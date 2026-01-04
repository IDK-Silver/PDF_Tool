# 繪圖功能設計文件

本文件規劃 PDF 標註系統的自由繪圖功能，作為現有 `annotation-system.md` 的擴展。

---

## 功能概述

### 目標

在 PDF/圖片上實現自由手繪標註功能，讓使用者能夠：
- 直接在頁面上繪製自由曲線
- 使用螢光筆標記重點
- 橡皮擦擦除繪製內容
- 支援觸控筆壓力感應（未來擴展）

### 與現有功能的區別

| 功能 | 描述 | 行為 |
|------|------|------|
| 簽名 (Signature) | 在獨立面板繪製，完成後放置到頁面 | 一次性物件 |
| 圖形 (Shape) | 矩形、橢圓、直線 | 幾何圖形 |
| **繪圖 (Drawing)** | 直接在頁面上自由繪製 | 連續路徑 |

---

## 工具規劃

### 繪圖工具列表

```
┌─────────────────────────────────────────────────────────────┐
│  [選擇] │ [圖片] [矩形] [橢圓] [線條] │ [畫筆] [螢光筆] [橡皮擦] │
└─────────────────────────────────────────────────────────────┘
                                         ↑ 新增繪圖工具區
```

| 工具 | ID | 描述 |
|------|----|------|
| 畫筆 | `pen` | 自由繪製實線，固定不透明度 |
| 螢光筆 | `highlighter` | 半透明筆觸，用於標記文字 |
| 橡皮擦 | `eraser` | 刪除繪製的路徑 |

### 工具屬性

#### 共用設定

所有繪圖工具共用 `ToolSettings` 中的 `color` 和 `strokeWidth`：

```typescript
// 來自 ToolSettings
{
  color: string        // 預設: #FF0000
  strokeWidth: number  // 預設: 2pt, 範圍: 1-8pt
}
```

#### 工具行為差異

| 工具 | 不透明度 | 說明 |
|------|----------|------|
| 畫筆 (Pen) | 1.0 | 實線繪製 |
| 螢光筆 (Highlighter) | 0.4 | 半透明標記效果 |
| 橡皮擦 (Eraser) | - | 擦除範圍 = strokeWidth × 5 |

擦除模式：
- `stroke`: 整條路徑刪除（碰到即刪）— 目前實現
- `point`: 僅刪除觸碰到的路徑片段（未來擴展）

---

## UI 設計

### Icon 設計

使用與現有工具一致的 SVG 圖標風格（24x24, stroke-width: 2）：

#### 畫筆 (Pen)
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <!-- 鋼筆形狀 -->
  <path d="M12 19l7-7 3 3-7 7-3-3z" />
  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
  <path d="M2 2l7.586 7.586" />
  <circle cx="11" cy="13" r="2" />
</svg>
```

簡化版本（推薦）：
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
  <path d="M20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
</svg>
```

#### 螢光筆 (Highlighter)
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <!-- 螢光筆形狀：粗筆頭 + 斜線 -->
  <rect x="8" y="3" width="8" height="14" rx="1" transform="rotate(45 12 10)" />
  <line x1="6" y1="18" x2="10" y2="22" />
  <line x1="14" y1="18" x2="18" y2="22" />
</svg>
```

簡化版本（推薦）：
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M9 11l-6 6v3h3l6-6" />
  <path d="M11 9L9 11l6 6 2-2" />
  <rect x="13" y="3" width="4" height="10" rx="1" transform="rotate(45 15 8)" />
</svg>
```

#### 橡皮擦 (Eraser)
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <!-- 橡皮擦形狀 -->
  <path d="M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1l10-10c.6-.6 1.5-.6 2.1 0l7 7c.6.6.6 1.5 0 2.1L16 19" />
  <line x1="5.5" y1="13.5" x2="10.5" y2="18.5" />
</svg>
```

### 工具列佈局

#### 方案 A：分組式（推薦）

```
┌────────────────────────────────────────────────────────────────────────┐
│ [選擇]  │  [圖片] [矩形] [圓形] [線條]  │  [畫筆] [螢光筆] [橡皮擦]  │ [×] │
│         │        圖形工具               │         繪圖工具          │     │
└────────────────────────────────────────────────────────────────────────┘
```

分隔線將工具分為三組：
1. 選擇工具
2. 圖形工具（既有）
3. 繪圖工具（新增）

#### 方案 B：單列式

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [選擇] │ [圖片] [矩形] [圓形] [線條] [畫筆] [螢光筆] [橡皮擦] │ 設定區 │ [×] │
└──────────────────────────────────────────────────────────────────────────────┘
```

所有工具在同一列，寬度可能過長。

**建議採用方案 A**，視覺上更清晰。

### 設定面板

繪圖工具共用工具列上的通用設定：

#### 共用設定（畫筆、螢光筆、橡皮擦）
```
┌─────────────────────────────────────────────────────────────┐
│  [顏色●]  [筆寬▼]                                           │
└─────────────────────────────────────────────────────────────┘
```

- **顏色選擇器**：8 色快選 + 自訂顏色
- **筆寬選擇器**：1, 2, 4, 8 pt + 線條樣式

#### 工具差異

| 工具 | 顏色 | 筆寬 | 不透明度 |
|------|------|------|----------|
| 畫筆 | 共用 | 共用 | 100% |
| 螢光筆 | 共用 | 共用 | 40% |
| 橡皮擦 | - | 用於計算擦除範圍 | - |

---

## 資料模型

### 擴展 AnnotationType

```typescript
// types.ts - 擴展現有類型

export type AnnotationType =
  | 'image'
  | 'signature'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'path'        // 新增：自由繪製路徑

export type ToolType =
  | 'select'
  | 'image'
  | 'signature'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'pen'         // 新增
  | 'highlighter' // 新增
  | 'eraser'      // 新增（不產生標註物件，僅刪除）
```

### PathAnnotation 物件

```typescript
interface PathAnnotationObject extends BaseAnnotationObject {
  type: 'path'

  // SVG path data (相對於頁面座標)
  // 格式: "M x1 y1 L x2 y2 L x3 y3 ..."
  pathData: string

  // 路徑樣式
  stroke: string        // 顏色
  strokeWidth: number   // 線寬 (pt)
  opacity: number       // 不透明度
  lineCap: 'round'      // 固定為 round，確保平滑
  lineJoin: 'round'     // 固定為 round

  // 外接矩形 (用於選擇/hit-test)
  x: number
  y: number
  width: number
  height: number

  // 路徑來源標記 (用於區分樣式)
  source: 'pen' | 'highlighter'
}
```

### 路徑資料格式

使用 SVG path 的簡化格式：

```
M x1 y1 L x2 y2 L x3 y3 L x4 y4 ...
```

- `M`: moveTo (起點)
- `L`: lineTo (直線段)

**註**：Phase 1 使用直線段連接，未來可優化為貝茲曲線（`Q` 或 `C` 命令）實現更平滑的曲線。

### 座標處理

路徑點座標儲存為 **PDF 點座標**（與其他標註物件一致）：
- 原點：頁面左下角
- Y 軸：向上為正

繪製時進行即時轉換：
```typescript
// 滑鼠事件 → SVG 座標 → PDF 座標
function handleMouseMove(e: MouseEvent) {
  const svgPoint = screenToSvg(e.clientX, e.clientY, svgElement)
  const pdfPoint = svgToPdf(svgPoint.x, svgPoint.y, coordContext)
  currentPath.push(pdfPoint)
}
```

---

## 交互流程

### 畫筆繪製流程

```
1. 選擇畫筆工具
   ↓
2. mousedown/touchstart
   → 建立新 PathAnnotation 物件
   → 記錄起始點 (M x y)
   ↓
3. mousemove/touchmove
   → 追加路徑點 (L x y)
   → 即時渲染 SVG path
   ↓
4. mouseup/touchend
   → 簡化路徑（移除冗餘點）
   → 計算外接矩形
   → 提交到 annotation store
   → 標記 dirty
```

### 螢光筆繪製流程

與畫筆相同，僅樣式不同：
- `opacity: 0.4`
- `strokeWidth: 12pt` (預設)
- `source: 'highlighter'`

### 橡皮擦流程

```
1. 選擇橡皮擦工具
   ↓
2. mousedown → 開始擦除模式
   ↓
3. mousemove → 檢測碰撞
   → 遍歷當前頁面的 path 物件
   → 計算滑鼠位置與路徑的距離
   → 若距離 < eraserSize/2，標記為待刪除
   ↓
4. mouseup → 批次刪除標記的物件
   → 提交變更
   → 標記 dirty
```

### 快捷鍵

| 按鍵 | 功能 |
|------|------|
| `P` | 切換到畫筆工具 |
| `H` | 切換到螢光筆工具 |
| `E` | 切換到橡皮擦工具 |
| `[` | 減小筆刷/橡皮擦大小 |
| `]` | 增大筆刷/橡皮擦大小 |
| `Ctrl/Cmd + Z` | 復原 |
| `Ctrl/Cmd + Shift + Z` | 重做 |

---

## SVG 渲染

### AnnotationLayer 擴展

```vue
<!-- AnnotationLayer.vue - 新增 path 渲染 -->

<template>
  <svg ...>
    <!-- 現有圖形 -->
    <rect v-for="obj in rectObjects" ... />
    <ellipse v-for="obj in ellipseObjects" ... />
    <line v-for="obj in lineObjects" ... />
    <image v-for="obj in imageObjects" ... />

    <!-- 新增：路徑繪製 -->
    <path
      v-for="obj in pathObjects"
      :key="obj.id"
      :d="pdfPathToSvg(obj.pathData)"
      :stroke="obj.stroke"
      :stroke-width="pdfToSvgSize(obj.strokeWidth)"
      :opacity="obj.opacity"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- 繪製中的臨時路徑 -->
    <path
      v-if="drawingPath"
      :d="drawingPath"
      :stroke="currentStroke"
      :stroke-width="currentStrokeWidth"
      :opacity="currentOpacity"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="drawing-preview"
    />

    <!-- 橡皮擦游標 -->
    <circle
      v-if="isErasing"
      :cx="eraserPosition.x"
      :cy="eraserPosition.y"
      :r="eraserSize / 2"
      fill="none"
      stroke="#666"
      stroke-dasharray="4 2"
      class="eraser-cursor"
    />
  </svg>
</template>
```

### 路徑轉換函數

```typescript
// coordinateUtils.ts - 新增

/**
 * 將 PDF path data 轉換為 SVG path data
 * PDF 座標 (原點左下) → SVG 座標 (原點左上)
 */
function pdfPathToSvg(
  pathData: string,
  ctx: CoordinateContext
): string {
  const scale = ctx.displayWidth / ctx.pageWidthPt

  return pathData.replace(
    /([ML])\s*([\d.]+)\s+([\d.]+)/g,
    (_, cmd, x, y) => {
      const svgX = parseFloat(x) * scale
      const svgY = (ctx.pageHeightPt - parseFloat(y)) * scale
      return `${cmd} ${svgX} ${svgY}`
    }
  )
}
```

---

## 路徑簡化

為了優化性能和儲存空間，需要簡化繪製的路徑。

### Ramer-Douglas-Peucker 演算法

```typescript
// pathSimplify.ts

interface Point {
  x: number
  y: number
}

/**
 * 簡化路徑，移除冗餘點
 * @param points 原始點陣列
 * @param epsilon 容差（pt），建議值 0.5-2.0
 */
function simplifyPath(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points

  // 找到距離首尾連線最遠的點
  const start = points[0]
  const end = points[points.length - 1]
  let maxDist = 0
  let maxIndex = 0

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end)
    if (dist > maxDist) {
      maxDist = dist
      maxIndex = i
    }
  }

  // 遞迴簡化
  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon)
    const right = simplifyPath(points.slice(maxIndex), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [start, end]
}
```

### 簡化時機

- `mouseup` 時對完整路徑進行簡化
- 容差值根據縮放級別動態調整：`epsilon = 1.0 / zoomScale`

---

## 後端 API

### 路徑嵌入 API（Phase 2）

PDFium 支援路徑物件，可將繪製的路徑永久嵌入 PDF：

```rust
// pdf/annotation.rs

#[tauri::command]
pub async fn pdf_add_path_to_page(
    doc_id: u64,
    page_index: u32,
    path_data: String,       // SVG-like path: "M x1 y1 L x2 y2 ..."
    stroke_color: String,    // "#RRGGBB"
    stroke_width: f32,       // pt
    opacity: f32,            // 0.0-1.0
) -> Result<AddPathResult, MediaError>
```

PDFium API 使用：

```rust
// 解析路徑點
let points = parse_path_data(&path_data)?;

// 建立路徑物件
let mut path_obj = page.objects_mut().create_path_object_line(
    PdfPoints::new(points[0].x),
    PdfPoints::new(points[0].y),
    PdfPoints::new(points[1].x),
    PdfPoints::new(points[1].y),
)?;

// 新增後續線段
for point in &points[2..] {
    path_obj.line_to(PdfPoints::new(point.x), PdfPoints::new(point.y))?;
}

// 設定樣式
path_obj.set_stroke_color(parse_color(stroke_color, opacity)?)?;
path_obj.set_stroke_width(PdfPoints::new(stroke_width))?;
path_obj.set_stroke(true)?;
path_obj.set_fill(false)?;

// 插入頁面
page.objects_mut().add_path_object(path_obj)?;
page.regenerate_content()?;
```

---

## 實現階段

### Phase 1：基礎繪圖功能 ✅ 完成

**範圍**：
- ✅ 畫筆工具 (`pen`)
- ✅ 基本 UI（共用顏色、筆寬選擇器）
- ✅ SVG 即時預覽
- ✅ 路徑儲存到 store
- ✅ Undo/Redo 支援
- ✅ 路徑簡化演算法 (Ramer-Douglas-Peucker)

**完成日期**：2026-01-04

### Phase 2：螢光筆 ✅ 完成

**範圍**：
- ✅ 螢光筆工具 (`highlighter`)
- ✅ 共用顏色/筆寬選擇器（與畫筆相同）
- ✅ 半透明效果 (opacity: 0.4)
- ⏳ 後端路徑嵌入 API（待實現）

**完成日期**：2026-01-04

### Phase 3：橡皮擦 ✅ 完成

**範圍**：
- ✅ 橡皮擦工具 (`eraser`)
- ✅ 碰撞檢測（基於筆寬）
- ✅ 游標視覺回饋

**完成日期**：2026-01-04

### Phase 4：優化與進階功能

**範圍**：
- ✅ 路徑簡化演算法（已在 Phase 1 完成）
- ⏳ 觸控筆壓力支援（未來擴展）
- ⏳ 貝茲曲線平滑（未來擴展）
- ⏳ 性能優化（大量路徑虛擬化）

---

## 工具列實現

### 更新 AnnotationToolbar.vue

```vue
<script setup lang="ts">
// 新增 icons
const icons = {
  // ... 現有
  pen: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  highlighter: 'M9 11l-6 6v3h3l6-6M11 9L9 11l6 6 2-2M13.3 3.3l3.4 3.4-7.8 7.8-3.4-3.4 7.8-7.8z',
  eraser: 'M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1l10-10c.6-.6 1.5-.6 2.1 0l7 7c.6.6.6 1.5 0 2.1L16 19M5.5 13.5l5 5',
}

// 繪圖工具判斷
const isDrawingTool = computed(() =>
  ['pen', 'highlighter', 'eraser'].includes(annotation.activeTool ?? '')
)

// 螢光筆預設顏色
const highlighterColors = [
  '#FFFF00', // 黃
  '#00FF00', // 綠
  '#FF69B4', // 粉紅
  '#00BFFF', // 藍
  '#FFA500', // 橘
]
</script>

<template>
  <!-- 展開狀態工具列 -->
  <div class="annotation-toolbar ...">
    <!-- 選擇工具 -->
    <button @click="selectTool('select')" ...>...</button>

    <div class="divider"></div>

    <!-- 圖形工具 -->
    <button @click="selectTool('image')" ...>...</button>
    <button @click="selectTool('rect')" ...>...</button>
    <button @click="selectTool('ellipse')" ...>...</button>
    <button @click="selectTool('line')" ...>...</button>

    <div class="divider"></div>

    <!-- 繪圖工具 (新增) -->
    <button
      @click="selectTool('pen')"
      :class="['tool-btn', { active: isActive('pen') }]"
      title="Pen (P)"
    >
      <svg class="w-5 h-5" ...><path :d="icons.pen" /></svg>
    </button>

    <button
      @click="selectTool('highlighter')"
      :class="['tool-btn', { active: isActive('highlighter') }]"
      title="Highlighter (H)"
    >
      <svg class="w-5 h-5" ...><path :d="icons.highlighter" /></svg>
    </button>

    <button
      @click="selectTool('eraser')"
      :class="['tool-btn', { active: isActive('eraser') }]"
      title="Eraser (E)"
    >
      <svg class="w-5 h-5" ...><path :d="icons.eraser" /></svg>
    </button>

    <div class="divider"></div>

    <!-- 繪圖工具設定 -->
    <template v-if="activeTool === 'pen'">
      <input type="color" :value="penColor" @input="..." />
      <input type="range" min="1" max="10" :value="penWidth" @input="..." />
    </template>

    <template v-if="activeTool === 'highlighter'">
      <div class="flex gap-1">
        <button
          v-for="color in highlighterColors"
          :key="color"
          @click="setHighlighterColor(color)"
          :style="{ backgroundColor: color }"
          :class="['w-5 h-5 rounded', { ring: highlighterColor === color }]"
        />
        <input type="color" :value="highlighterColor" @input="..." />
      </div>
      <input type="range" min="8" max="24" :value="highlighterWidth" @input="..." />
    </template>

    <template v-if="activeTool === 'eraser'">
      <input type="range" min="10" max="50" :value="eraserSize" @input="..." />
      <span class="text-xs">{{ eraserSize }}px</span>
    </template>

    <!-- 關閉按鈕 -->
    <button @click="closeToolbar" ...>×</button>
  </div>
</template>
```

---

## 狀態管理

### 擴展 annotation store

```typescript
// modules/annotation/store.ts - 擴展

interface DrawingState {
  // 正在繪製的路徑點 (SVG 座標)
  currentPoints: Point[]

  // 繪製中標記
  isDrawing: boolean

  // 橡皮擦位置
  eraserPosition: Point | null

  // 繪圖工具設定
  penSettings: PenSettings
  highlighterSettings: HighlighterSettings
  eraserSettings: EraserSettings
}

// actions
function startDrawing(point: Point) {
  state.isDrawing = true
  state.currentPoints = [point]
}

function addDrawingPoint(point: Point) {
  state.currentPoints.push(point)
}

function finishDrawing() {
  if (state.currentPoints.length < 2) {
    state.isDrawing = false
    state.currentPoints = []
    return
  }

  // 簡化路徑
  const simplified = simplifyPath(state.currentPoints, epsilon)

  // 建立 PathAnnotation 物件
  const pathData = pointsToPathData(simplified)
  const bbox = calculateBoundingBox(simplified)

  const annotation: PathAnnotationObject = {
    id: uuid(),
    type: 'path',
    pageIndex: currentPageIndex,
    pathData,
    stroke: currentTool === 'highlighter' ? highlighterSettings.color : penSettings.color,
    strokeWidth: currentTool === 'highlighter' ? highlighterSettings.strokeWidth : penSettings.strokeWidth,
    opacity: currentTool === 'highlighter' ? 0.4 : 1.0,
    lineCap: 'round',
    lineJoin: 'round',
    source: currentTool as 'pen' | 'highlighter',
    ...bbox,
  }

  addAnnotation(annotation)

  state.isDrawing = false
  state.currentPoints = []
}
```

---

## 性能考量

### 繪製優化

1. **節流 (Throttle)**：`mousemove` 事件使用 `requestAnimationFrame` 節流
2. **批次更新**：繪製完成後才更新 store，避免每個點都觸發響應式更新
3. **路徑簡化**：減少點數，降低 SVG 複雜度

### 渲染優化

1. **虛擬化**：只渲染當前可見頁面的路徑
2. **分層**：靜態路徑和動態繪製使用不同 SVG 層
3. **合併路徑**：多個相同樣式的路徑可合併為單一 `<path>` 元素

### 記憶體優化

1. **路徑壓縮**：使用相對座標減少字串長度
2. **歷史限制**：大型路徑操作限制 undo 歷史深度

---

## 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| 大量路徑導致性能下降 | UI 卡頓 | 路徑簡化 + 虛擬化 |
| 觸控設備兼容性 | 繪製體驗不佳 | 使用 Pointer Events API |
| 路徑嵌入 PDF 失敗 | 無法永久儲存 | 降級為圖片嵌入 |
| 座標轉換精度問題 | 路徑位置偏移 | 單元測試覆蓋邊界情況 |

---

## 相關文件

- `docs/dev/annotation-system.md` - 標註系統主文件
- `docs/dev/design.md` - 專案整體設計
- `src/modules/annotation/` - 標註模組實現

---

## 變更記錄

| 日期 | 變更內容 |
|------|----------|
| 2025-01-04 | 初版建立：繪圖功能完整規劃 |
| 2026-01-04 | Phase 1-3 完成：畫筆、螢光筆、橡皮擦實現 |
| 2026-01-04 | 簡化設定：移除獨立的螢光筆顏色和橡皮擦大小，共用通用設定 |
