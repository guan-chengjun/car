// 无头浏览器自测：CDP 驱动 Chrome，捕获 console/页面错误，验证关键交互并截图。
// 用法：node tools/headless-test.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const URL = 'http://127.0.0.1:8765/index.html';
const DEBUG_PORT = 9333;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(resolve(root, 'tools/shots'), { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + resolve(root, 'tools/.chrome-profile'),
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' });
      if (res.ok) return res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools 未就绪');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));

let msgId = 0;
const pending = new Map();
const consoleMsgs = [];
const pageErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleMsgs.push(m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    pageErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
});
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
// 无头模式 rAF 被冻结，改用应用暴露的确定性步进钩子（内部按 1/60s 逐帧泵逻辑，不渲染以提速）
const advance = (ms) => evalJs(`window.__step(${(ms / 1000).toFixed(4)})`);
const shot = async (path) => {
  await evalJs(`window.__render()`);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path, Buffer.from(r.data, 'base64'));
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });

// 1) 等待 GLB 加载完成（加载层隐藏即代表车已绑定）
let ready = false;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  ready = await evalJs(`window.__appReady && document.querySelector('#loading').classList.contains('hide')`).catch(() => false);
  if (ready) break;
}
console.log('应用启动:', ready ? 'OK' : 'FAIL');

const summary = await evalJs(`({
  modelSrc: document.querySelector('#modelSrc').textContent,
  loadingHidden: document.querySelector('#loading').classList.contains('hide'),
  hotspotCount: document.querySelectorAll('.hotspot').length,
  partButtons: document.querySelectorAll('[data-part]').length,
  hasCar: !!document.querySelector('canvas'),
})`);
console.log('初始状态:', JSON.stringify(summary));

// 2) 首屏进入（模拟用户手势解锁音频）
await evalJs(`document.querySelector('#btnEnter').click()`);
await advance(600);
await shot(resolve(root, 'tools/shots/00-showroom.png'));

// 3) 一键全开
await evalJs(`document.querySelector('#btnOpenAll').click()`);
const tweenImmediate = await evalJs(`__testHooks().tweens.length`);
await advance(200);
const tweenMid = await evalJs(`(() => { const h=__testHooks();
  return { n: h.tweens.length, doorRot: h.car.parts.doorL.pivot.rotation.y.toFixed(3),
    isOpen: h.car.parts.doorL.isOpen }; })()`);
await advance(1400);
const openAngles = await evalJs(`(() => { const c=__testHooks().car; return {
  doorL: c.parts.doorL.pivot.rotation.y.toFixed(3),
  doorR: c.parts.doorR.pivot.rotation.y.toFixed(3),
  frunk: c.parts.frunk.pivot.rotation.x.toFixed(3),
  decklid: c.parts.decklid.pivot.rotation.x.toFixed(3),
  winL_y: c.parts.windowL.pivot.position.y.toFixed(3),
  tweensLeft: __testHooks().tweens.length,
}; })()`);
console.log('tween 立即数:', tweenImmediate, '中途:', JSON.stringify(tweenMid));
console.log('全开后部件姿态:', JSON.stringify(openAngles));

// 4) Esc 全关
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await advance(1300);
const closedAngles = await evalJs(`(() => { const c=__testHooks().car; return {
  doorL: c.parts.doorL.pivot.rotation.y.toFixed(3),
  frunk: c.parts.frunk.pivot.rotation.x.toFixed(3),
}; })()`);
console.log('Esc 后部件姿态:', JSON.stringify(closedAngles));

// 5) 发动机模式 + 爆炸滑块
await evalJs(`document.querySelector('#btnEngineMode').click()`);
await advance(1500);
const engMode = await evalJs(`document.querySelector('#enginePanel').classList.contains('show')`);
const labels = await evalJs(`document.querySelectorAll('.eng-label').length`);
await evalJs(`(() => { const sl=document.querySelector('#explodeSlider');sl.value=80;sl.dispatchEvent(new Event('input')); })()`);
await advance(900);
const explodePos = await evalJs(`(() => {
  const g = __testHooks().car.engine.group;
  const fan = g.getObjectByName('CoolingFan');
  const item = __testHooks().car.engine.explodables.find(e => e.obj === fan);
  return { fanY: fan.position.y.toFixed(3), offY: item.offset.y.toFixed(3),
    baseY: item.base.y.toFixed(3) };
})()`);
console.log('发动机模式:', engMode, '标注数:', labels, '风扇爆炸位移:', JSON.stringify(explodePos));
await shot(resolve(root, 'tools/shots/01-engine.png'));

// 6) 退出 + 启动发动机（起动机→怠速）
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await advance(1200);
// 验证退出发动机模式后车身材质完全还原（不残留 xray 透明）
const matCheck = await evalJs(`(() => {
  const c = __testHooks().car;
  const bad = c.bodyMeshes.filter(m => m.material && (m.material.transparent === true && m.material.opacity < .5));
  const invisible = c.bodyMeshes.filter(m => m.visible === false);
  return { ghostCount: bad.length, hiddenCount: invisible.length, total: c.bodyMeshes.length,
    sampleOpacity: c.bodyMeshes[0] ? c.bodyMeshes[0].material.opacity : null };
})()`);
console.log('退出后材质还原:', JSON.stringify(matCheck));
await evalJs(`document.querySelector('#btnStart').click()`);
await advance(2600);
const idle = await evalJs(`Math.round(__testHooks().engineState.rpm)`);
const audioOn = await evalJs(`(() => { const a=__testHooks().actx; return a ? a.state : 'null'; })()`);
console.log('点火后怠速 rpm:', idle, 'AudioContext:', audioOn);

// 7) 拉高转速 + 红线（置 _held 模拟按住滑块，避免「松手回怠速」逻辑）
await evalJs(`(() => { const sl=document.querySelector('#rpmSlider');sl.disabled=false;sl._held=true;sl.value=7000;sl.dispatchEvent(new Event('input')); })()`);
await advance(1600);
const high = await evalJs(`Math.round(__testHooks().engineState.rpm)`);
const warn = await evalJs(`document.querySelector('#redlineWarn').classList.contains('show')`);
console.log('高转 rpm:', high, '红线告警:', warn);
await shot(resolve(root, 'tools/shots/02-redline.png'));

// 8) 松开回落怠速（模拟 pointerup 松手）
await evalJs(`window.dispatchEvent(new PointerEvent('pointerup'))`);
await advance(2000);
const back = await evalJs(`Math.round(__testHooks().engineState.rpm)`);
console.log('回落 rpm:', back);

// 9) 静音切换 + 视角切换
await evalJs(`document.querySelector('#btnMute').click()`);
const muted = await evalJs(`document.querySelector('#btnMute').textContent`);
await evalJs(`document.querySelector('[data-view="side"]').click()`);
await advance(1500);
await shot(resolve(root, 'tools/shots/03-side.png'));
console.log('静音按钮:', muted);

const finalCheck = await evalJs(`(() => { const c=__testHooks().car; return {
  carOk: !!c && Object.keys(c.parts).length === 6,
  wheels: c.wheelGroups.length,
  explodables: c.engine.explodables.length,
  hotspots: document.querySelectorAll('.hotspot').length,
  autoRotateCapable: typeof __testHooks().controls !== 'undefined',
}; })()`);
console.log('最终结构检查:', JSON.stringify(finalCheck));

console.log('\n--- 错误汇总 ---');
console.log('console.error 条数:', consoleMsgs.length);
consoleMsgs.forEach(m => console.log('  •', m.slice(0, 300)));
console.log('未捕获异常条数:', pageErrors.length);
pageErrors.forEach(m => console.log('  •', m.slice(0, 300)));

ws.close();
chrome.kill();
const fail = !ready || !summary.modelSrc || summary.hotspotCount < 10 ||
  consoleMsgs.length > 0 || pageErrors.length > 0 || !finalCheck.carOk ||
  finalCheck.wheels !== 4 || finalCheck.explodables !== 18 ||
  matCheck.ghostCount !== 0 || matCheck.hiddenCount !== 0;
console.log(fail ? '\n❌ 自测失败' : '\n✅ 自测通过，截图见 tools/shots/');
process.exit(fail ? 1 : 0);
