// 从 index.html 的 @@CAR_MODULE@@ 标记段提取程序化车厂，导出 assets/car.glb
// 与浏览器共享同一份建模代码，避免两份实现漂移。
// 用法：node tools/export-glb.mjs
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

const match = html.match(/@@CAR_MODULE_START@@([\s\S]*?)@@CAR_MODULE_END@@/);
if (!match) {
  console.error('未找到车厂模块标记 @@CAR_MODULE_START@@ / @@CAR_MODULE_END@@');
  process.exit(1);
}

// 在受控作用域内求值车厂函数（仅注入其依赖）
// 标记位于块注释内部，捕获段以悬空的 ' * ' 开头，需补回注释包裹
const factory = new Function(
  'THREE', 'RoundedBoxGeometry', 'D2R',
  `/*${match[1]}*/; return typeof __buildCar === 'function' ? __buildCar : null;`
);
const __buildCar = factory(THREE, RoundedBoxGeometry, Math.PI / 180);
if (typeof __buildCar !== 'function') {
  console.error('车厂模块未正确导出 __buildCar');
  process.exit(1);
}

const car = __buildCar(THREE, RoundedBoxGeometry);
console.log(`[export] 部件: ${Object.keys(car.parts).join(', ')}`);
console.log(`[export] 车身网格 ${car.bodyMeshes.length} 个 / 热点 ${car.hotspots.length} 个 / 爆炸项 ${car.engine.explodables.length} 个`);

// r169 GLTFExporter 的 Blob 读取依赖浏览器 FileReader，Node 下提供最小 shim
class FileReaderShim {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = buf;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}
globalThis.FileReader = FileReaderShim;

const exporter = new GLTFExporter();
// r169 的二进制导出路径依赖浏览器 FileReader，Node 下先导出 JSON glTF，再封包为 GLB
const gltfJson = await exporter.parseAsync(car.root, { binary: false, onlyVisible: false });

function pad4(buf) {
  const pad = (4 - (buf.length % 4)) % 4;
  return pad ? Buffer.concat([buf, Buffer.alloc(pad, 0x20)]) : buf;
}
function jsonToGlb(json) {
  const bin = Buffer.from(json.buffers[0].uri.split(',')[1], 'base64');
  delete json.buffers[0].uri;
  json.buffers[0].byteLength = bin.length;
  const jsonBuf = pad4(Buffer.from(JSON.stringify(json), 'utf8'));
  const binBuf = pad4(bin);
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);       // "glTF"
  head.writeUInt32LE(2, 4);                // version
  head.writeUInt32LE(total, 8);
  const jc = Buffer.alloc(8);
  jc.writeUInt32LE(jsonBuf.length, 0);
  jc.writeUInt32LE(0x4e4f534a, 4);         // "JSON"
  const bc = Buffer.alloc(8);
  bc.writeUInt32LE(binBuf.length, 0);
  bc.writeUInt32LE(0x004e4942, 4);         // "BIN\0"
  return Buffer.concat([head, jc, jsonBuf, bc, binBuf]);
}
const glb = jsonToGlb(gltfJson);

const outDir = resolve(root, 'assets');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'car.glb');
writeFileSync(outFile, Buffer.from(glb));
console.log(`[export] 已写入 ${outFile} (${(glb.byteLength / 1024).toFixed(1)} KB)`);

// 结构自检：确认 pivot / 发动机 / 热点命名完整
const names = [];
car.root.traverse(o => names.push(o.name));
const required = ['DoorL_Pivot', 'DoorR_Pivot', 'WindowL_Pivot', 'WindowR_Pivot',
  'Frunk_Pivot', 'Decklid_Pivot', 'Flat6_Engine', 'Crankshaft', 'CoolingFan'];
const missing = required.filter(n => !names.includes(n));
if (missing.length) {
  console.error('[export] 结构自检失败，缺失节点:', missing.join(', '));
  process.exit(1);
}
console.log('[export] 结构自检通过 ✓');
