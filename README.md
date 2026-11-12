# 911 风格双门跑车 · 3D 数字车展

暗调影棚风格的单文件 Three.js 车展页：可开合车身部件、水平对置六缸发动机透视 / 爆炸拆解、
WebAudio 原生六缸声浪与转速仪表。零构建，浏览器直接运行。

## 运行

### 方式一：一键脚本（推荐）

双击 `启动预览.bat`，脚本会用本机 Python 在 `http://localhost:8765` 启动静态服务并自动打开页面。
关闭命令行窗口即停止服务。

### 方式二：手动启动

```bash
# 任选其一（需在项目根目录）
python -m http.server 8765
# 或
npx serve .
```

浏览器访问 `http://localhost:8765/index.html`。

> 不要用 `file://` 直接打开 —— 页面需通过 http(s) 拉取 `assets/car.glb` 与 CDN 模块。

### 重新生成 GLB（可选）

`assets/car.glb` 由 `index.html` 中标记段 `@@CAR_MODULE_START@@ … @@CAR_MODULE_END@@`
的同一份程序化车厂代码导出，浏览器与导出脚本共享单一数据源：

```bash
npm install
npm run build:glb      # 等价 node tools/export-glb.mjs
```

## 功能清单

| 模块 | 说明 |
| --- | --- |
| 相机 | OrbitControls 禁平移、阻尼 0.06、极角/距离限位；3 秒无操作自动环绕；4 个预设视角 |
| 部件 | pivot 铰链、`easeInOutCubic` 缓动、多部件并发开合、一键全开 / 全关、Esc 全关 |
| 交互 | 悬停描边 + 中文气泡、点击开合、11 个 3D 热点（门 / 窗 / 舱盖 / 发动机 / 四轮，带遮挡判断） |
| 发动机模式 | 1.2s 飞机位镜头、车身透视 / 隐藏、爆炸视图滑块、8 个中文 3D 标注、Esc 复原 |
| 运转模拟 | 起动机拖转 → 点火 → 900 rpm 怠速；rpm 驱动曲轴 / 活塞 / 连杆 / 风扇与车身抖动；800–7200 rpm，松滑块回落怠速，6500 红线告警 |
| 声浪 | 纯 WebAudio 合成六缸阶次声浪（基频 + 1.5/2 阶 + 排气噪声 + 点火 LFO），首次点击唤醒，可静音 |
| 仪表 | 原生 SVG 转速表（红线区、指针、数字读数） |
| 渲染 | 程序化 PMREM 影棚环境、ACES 色调映射、clearcoat 清漆车漆、IOR 1.5 透射玻璃、圆形 Reflector 地面倒影、2048 PCF 软阴影、灯带补光 |
| UI | 原生 DOM 暗色玻璃拟态：部件面板、视角、规格卡、首屏提示、Toast |
| 鲁棒 | GLB 加载进度 + 重试 + 程序化兜底、resize / DPR 自适应（上限 2x）、页面失焦暂停渲染与音频、全链路 SRGB |

## 程序化部件说明

车型为 **911 风格后置双门 2+2 快背跑车**（风格化原创模型，非任何厂商官方资产），全部由
Three.js 基础几何程序化构建：

- **车身**：侧轮廓 `ExtrudeGeometry` 挤出 + 四角翼子板鼓包、清漆车漆
- **座舱**：独立玻璃座舱（transmission 透射、IOR 1.5）+ 车顶 / A 柱 / C 柱
- **开合件**：左右车门（前缘铰链外摆 68°）、左右电动车窗（下沉 0.34 m）、
  前备箱盖（后缘铰链上掀 55°）、后置机舱盖（尾端铰链上掀 58°，带散热格栅）
- **车轮 ×4**：轮胎 / 五辐轮毂 / 刹车盘 / 红色卡钳 / 轮拱内衬，前轮 20″、后轮 21″
- **内饰**：两张运动座椅、仪表台、方向盘、中央通道
- **灯组**：双前大灯（自发光）、贯穿式尾灯、转向灯、双出镀铬排气
- **水平对置六缸发动机**：曲轴箱、曲轴（120° 相位）、6 组气缸 / 散热片 / 气缸盖 /
  活塞 / 连杆、顶部散热风扇、进气风室、双涡轮与管路 —— 全部按 rpm 实时运动，
  并内置 18 项爆炸位移与 8 个标注锚点

## 替换为真实 GLB 模型（三级降级策略）

页面加载 `assets/car.glb` 时按以下策略处理：

- **L1 分件 GLB（当前默认）**：节点包含 `DoorL_Pivot / DoorR_Pivot / WindowL_Pivot /
  WindowR_Pivot / Frunk_Pivot / Decklid_Pivot / Flat6_Engine` 等命名 pivot 时，
  直接绑定全部交互与动画。本仓库 `npm run build:glb` 产出的即此结构。
- **L2 外部 CC 资产候选**：可在以下来源筛选 CC0 / CC-BY 的分件汽车 GLB，下载后重命名为
  `assets/car.glb` 替换：
  - Sketchfab 筛选 "Downloadable + CC"：<https://sketchfab.com/search?features=downloadable&type=models&q=car%20rigged>
  - Poly Pizza（CC0 为主）：<https://poly.pizza/search/car>
  - Quaternius / Kenney 免费资产库
  - 替换前请核对授权与署名要求；加载失败时页面提供「重试 / 使用程序化展车」占位交互。
- **L3 合并网格 GLB**：若 GLB 内找不到任何 pivot 命名节点（整体合并网格），页面自动改用
  **程序化分件补全** —— 程序化生成门 / 窗 / 前备箱盖 / 机舱盖与完整水平对置六缸，
  顶部「模型来源」徽标显示 `合并 GLB + 程序化补件（L3）`，并在 README 此处标注。

### 替换步骤

1. 备份现有 `assets/car.glb`。
2. 将新模型转为 `.glb`（glTF Transform / Blender 均可），放入 `assets/car.glb`。
3. （可选）在 Blender 中给开合件建立空物体 pivot 并按上表命名，即可获得 L1 完整交互。
4. 双击 `启动预览.bat` 验证；加载失败可点「使用程序化展车」立即兜底。
5. 模型朝向需为 **车头 +Z、车顶 +Y、轮胎接地 y=0、单位米**，否则需在导出时调整。

## 技术栈与许可

- **Three.js `0.169.0`**（importmap 锁定，jsDelivr CDN，ESM 模块，零构建）：MIT License
- 本仓库全部原创代码与程序化模型：MIT License
- 若替换为外部 CC 资产，请遵循该资产自身许可（CC-BY 需保留署名）。
- 车型为受 911 经典布局启发的**风格化原创几何体**，不含任何商标、徽标或官方设计数据，
  规格参数均为展示用途的虚构数据。

## 自测

仓库内置零额外依赖的无头 Chrome 自测（通过 CDP 驱动本机 Chrome，Node 内置 WebSocket 通信）。
需先启动静态服务，再运行测试：

```bash
# 终端 A
python -m http.server 8765
# 终端 B
node tools/headless-test.mjs
```

覆盖项：GLB 加载与模型来源徽标、6 部件并发开合角度、Esc 归零、发动机模式 / 8 标注 /
爆炸位移、退出后车身材质完全还原、起动机→900rpm 怠速、7000rpm 红线告警、松手回落、
静音切换、4 车轮 / 18 爆炸项 / 11 热点结构断言，并汇总 `console.error` 与未捕获异常（要求为 0）。
截图输出到 `tools/shots/`。无头环境 rAF 被冻结，测试通过页面暴露的确定性 `window.__step`
钩子按 1/60s 逐帧泵逻辑，不影响真实浏览器运行路径。

## 目录结构

```
car/
├─ index.html            # 单文件车展页（含 @@CAR_MODULE@@ 程序化车厂标记段）
├─ assets/
│  └─ car.glb            # 由车厂代码导出的分件 GLB（L1，约 5 MB）
├─ tools/
│  ├─ export-glb.mjs     # 复用 index.html 车厂段导出 GLB
│  ├─ headless-test.mjs  # 无头 Chrome 交互回归测试
│  ├─ shot-closed.mjs    # 观感截图脚本
│  └─ shots/             # 自测截图输出
├─ 启动预览.bat           # Python 静态服务一键启动
├─ package.json          # 仅 GLB 导出/测试工具依赖 three
└─ README.md
```
