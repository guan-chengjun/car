// 截取默认全关状态的展车（用于观感核对）
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9335', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + resolve(root, 'tools/.chrome-shot'), '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });
let id = 0; const pending = new Map();
for (let i = 0; i < 40; i++) {
  try { const r = await fetch('http://127.0.0.1:9335/json/new?' + encodeURIComponent('http://127.0.0.1:8765/index.html'), { method: 'PUT' }); if (r.ok) break; } catch {}
  await sleep(250);
}
const list = await (await fetch('http://127.0.0.1:9335/json/list')).json();
const t = list.find(x => x.url.includes('_l3.html'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const cdp = async (method, params) => (await send(method, params)).result;
const evalJs = async (e) => (await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.value;
await send('Runtime.enable'); await send('Page.enable');
for (let i = 0; i < 40; i++) { await sleep(500); if (await evalJs(`document.querySelector('#loading').classList.contains('hide')`)) break; }
await evalJs(`document.querySelector('#btnEnter').click()`);
await evalJs(`window.__step(0.5)`);
await evalJs(`window.__render()`);
mkdirSync(resolve(root, 'tools/shots'), { recursive: true });
const r = await cdp('Page.captureScreenshot', { format: 'png' });
console.log('hasData:', !!r.data);
writeFileSync(resolve(root, 'tools/shots/closed-default.png'), Buffer.from(r.data, 'base64'));
// 再来个正侧视
await evalJs(`document.querySelector('[data-view="side"]').click()`);
await evalJs(`window.__step(1.3)`);
await evalJs(`window.__render()`);
const r2 = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync(resolve(root, 'tools/shots/closed-side.png'), Buffer.from(r2.data, 'base64'));
ws.close(); chrome.kill();
console.log('done');
