# PDF 標註系統設計文件

本文件描述 PDF 標註功能的設計規劃，包含圖形插入和簽名功能。

## 功能概述

### 目標功能
1. **插入圖片**：在 PDF 頁面上放置圖片
2. **基本圖形**：矩形（實心/空心）、圓形/橢圓（實心/空心）、線條
3. **簽名功能**：手寫簽名、圖片簽名、簽名管理

### 設計原則
- 統一架構：所有標註類型共用疊加層和交互邏輯
- 非破壞性編輯：繪製時使用疊加層預覽，儲存時才嵌入 PDF
- 複用現有機制：整合現有 undo/redo、dirty state、縮放系統

---

## 架構設計

### 整體架構：SVG 疊加層 + 延遲嵌入

```
┌─────────────────────────────────────────┐
│  PDF Page Container (.page-slot)        │
│  ┌───────────────────────────────────┐  │
│  │  <img> 渲染後的 PDF 頁面          │  │  ← 現有
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  <svg> AnnotationLayer (新增)     │  │  ← 與頁面同尺寸
│  │    <rect>, <ellipse>, <image>...  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  PdfTextLayer (現有)              │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**選擇 SVG 的理由**：
- 每個圖形是獨立 DOM 元素，便於選擇、移動、調整
- 任意縮放不失真
- 與 Vue 響應式系統自然整合
- 比 Canvas 更容易實現物件級操作

### 模組結構

```
src/
├── components/MediaView/parts/
│   ├── AnnotationLayer.vue        # SVG 疊加層（新增）
│   ├── AnnotationToolbar.vue      # 標註工具列（新增）
│   └── SignaturePadModal.vue      # 簽名繪製對話框（新增）
├── modules/annotation/            # 標註模組（新增）
│   ├── store.ts                   # 標註狀態管理
│   ├── types.ts                   # 類型定義
│   ├── tools/                     # 繪製工具
│   │   ├── SelectTool.ts
│   │   ├── ImageTool.ts
│   │   ├── SignatureTool.ts
│   │   ├── RectTool.ts
│   │   ├── EllipseTool.ts
│   │   └── LineTool.ts
│   ├── coordinateUtils.ts         # 座標轉換
│   └── signatureManager.ts        # 簽名管理
└── modules/media/
    └── store.ts                   # 修改：整合標註狀態

src-tauri/src/
├── pdf/
│   ├── annotation.rs              # 標註嵌入 API（新增）
│   └── worker.rs                  # 修改：整合標註命令
└── signature.rs                   # 簽名管理（新增）
```

---

## 資料模型

### AnnotationObject（標註物件）

```typescript
interface AnnotationObject {
  id: string                    // UUID
  type: AnnotationType
  pageIndex: number             // 所屬頁面（0-based）

  // 位置與尺寸（PDF pt 座標）
  x: number
  y: number
  width: number
  height: number
  // 註：Phase 1 不支援標註旋轉，未來擴展時再加入 rotation 欄位

  // 通用樣式
  opacity: number               // 0-1

  // 圖形樣式（rect, ellipse, line, arrow）
  fill?: string                 // 填充色（hex 或 'none'）
  stroke?: string               // 邊框色
  strokeWidth?: number          // 邊框寬度（pt）
  strokeStyle?: StrokeStyle     // 線條樣式：'solid' | 'dashed' | 'dotted'

  // 圖片/簽名特定
  imageData?: string            // base64 PNG

  // 線條特定（扁平格式：[x1, y1, x2, y2]，與後端 API 一致）
  points?: number[]
}

type AnnotationType = 'image' | 'signature' | 'rect' | 'ellipse' | 'line' | 'arrow'
type StrokeStyle = 'solid' | 'dashed' | 'dotted'
```

#### 欄位規則（避免歧義）

- `line` 的幾何以 `points` 為準；`x/y/width/height` 僅作為外接矩形（selection/hit-test），每次更新 `points` 後需重新計算。
- `rect/ellipse/image/signature` 不使用 `points`。
- `opacity` 需同時作用於 fill/stroke（alpha）；image/signature 以 PNG alpha 為主，若需額外透明度則在嵌入前預乘。
- `fill = 'none'` 等同於不填充；`strokeWidth = 0` 等同於不描邊。

### AnnotationState（標註狀態）

```typescript
interface AnnotationState {
  // 按頁面索引的標註物件
  objects: Record<number, AnnotationObject[]>

  // 當前選中的標註（使用 Array 而非 Set，確保序列化/深拷貝正常）
  selectedIds: string[]

  // 當前工具
  activeTool: ToolType | null

  // 工具設定
  toolSettings: {
    color: string           // 統一顏色（用於 stroke）
    strokeWidth: number
    strokeStyle: StrokeStyle
    opacity: number
  }

  // 待放置的物件（如剛建立的簽名）
  pendingObject: AnnotationObject | null
}

type ToolType = 'select' | 'image' | 'signature' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'pixelate' | 'counter' | 'pen' | 'highlighter'
```

### SignatureInfo（簽名資訊）

```typescript
interface SignatureInfo {
  id: string
  name: string
  imageData: string             // base64 PNG
  createdAt: number             // timestamp
  lastUsedAt: number
}
```

---

## 座標系統

### 三層座標轉換

```
螢幕座標 (Screen: clientX/clientY)
    ↓  getBoundingClientRect() 取得元素位置
SVG 座標 (SVG/Canvas Pixels)
    ↓  scale factor = pageWidthPt / displayWidth
PDF 座標 (PDF Points)
```

註：`clientX/clientY` 是相對於 viewport 的座標，`getBoundingClientRect()` 回傳的 `left/top` 也是相對於 viewport，兩者相減即可得到元素內座標，不需要額外處理 scroll offset。

### 關鍵轉換邏輯

```typescript
// coordinateUtils.ts

interface CoordinateContext {
  pageWidthPt: number       // PDF 頁面寬度（pt）
  pageHeightPt: number      // PDF 頁面高度（pt）
  displayWidth: number      // 當前顯示寬度（px）
  displayHeight: number     // 當前顯示高度（px）
  // 註：Phase 1 假設頁面 rotation = 0，旋轉頁面的標註支援待後續擴展
}

// 螢幕座標 → PDF 座標
function screenToPdf(
  screenX: number,
  screenY: number,
  element: HTMLElement,
  ctx: CoordinateContext
): { x: number; y: number } {
  const rect = element.getBoundingClientRect()

  // 轉為元素內座標
  const localX = screenX - rect.left
  const localY = screenY - rect.top

  // 計算縮放因子
  const scale = ctx.pageWidthPt / ctx.displayWidth

  // 轉為 PDF 座標（注意 Y 軸翻轉）
  const pdfX = localX * scale
  const pdfY = ctx.pageHeightPt - (localY * scale)

  return { x: pdfX, y: pdfY }
}

// PDF 座標 → SVG 座標（用於渲染）
function pdfToSvg(
  pdfX: number,
  pdfY: number,
  ctx: CoordinateContext
): { x: number; y: number } {
  const scale = ctx.displayWidth / ctx.pageWidthPt

  const svgX = pdfX * scale
  const svgY = (ctx.pageHeightPt - pdfY) * scale

  return { x: svgX, y: svgY }
}
```

### 縮放同步

AnnotationLayer 的 SVG 尺寸必須與頁面顯示尺寸同步：

```vue
<!-- AnnotationLayer.vue -->
<svg
  :width="displayWidth"
  :height="displayHeight"
  :viewBox="`0 0 ${displayWidth} ${displayHeight}`"
  class="annotation-layer"
>
  <!-- 標註物件渲染 -->
</svg>

<style>
.annotation-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;  /* 預設不攔截事件 */
}

.annotation-layer.interactive {
  pointer-events: auto;  /* 繪製/選擇模式時啟用 */
}
</style>
```

---

## 使用者介面

### 工具列設計

在現有 MediaToolbar 下方或側邊新增 AnnotationToolbar：

```
┌──────────────────────────────────────────────────┐
│  [儲存] [頁碼] [搜尋] [縮放控制]   ← MediaToolbar │
├──────────────────────────────────────────────────┤
│  [選擇] [圖片] [簽名] [矩形] [圓形] [線條]        │
│  ────────────────────────────────────────────    │
│  填充: [■] 邊框: [■] 線寬: [2] 透明度: [100%]   │
└──────────────────────────────────────────────────┘
```

### 工具交互流程

#### 選擇工具（Select）
1. 點擊標註物件 → 選中，顯示調整手柄
2. 拖曳 → 移動物件
3. 拖曳手柄 → 調整大小
4. Delete 鍵 → 刪除選中物件
5. Escape 鍵 → 取消選擇

#### 圖片工具（Image）
1. 點擊工具按鈕 → 開啟檔案選擇器
2. 選擇圖片 → 游標變為十字，顯示預覽
3. 點擊頁面 → 放置圖片
4. 自動切換到選擇工具

#### 簽名工具（Signature）
1. 點擊工具按鈕 → 開啟簽名面板
2. 選擇已有簽名 或 新建簽名
3. 游標變為十字，顯示預覽
4. 點擊頁面 → 放置簽名

#### 圖形工具（Rect/Ellipse/Line）
1. 點擊並拖曳 → 繪製圖形
2. 釋放滑鼠 → 完成繪製
3. 可繼續繪製或切換工具

### 簽名面板設計

```
┌─────────────────────────────────────┐
│  簽名                          [×]  │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │     手寫簽名區域            │    │
│  │     (Canvas)                │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│  [清除] [撤銷]     筆畫: [細][粗]   │
├─────────────────────────────────────┤
│  已儲存的簽名：                      │
│  ┌─────┐ ┌─────┐ ┌─────┐           │
│  │ Sig1│ │ Sig2│ │ +   │           │
│  └─────┘ └─────┘ └─────┘           │
├─────────────────────────────────────┤
│        [使用此簽名] [儲存為新簽名]   │
└─────────────────────────────────────┘
```

---

## 後端 API

### Rust Commands

#### 標註嵌入

**已實現（PoC）**：
```rust
// media.rs - 圖片插入命令（已驗證可用）

#[tauri::command]
pub async fn pdf_add_image_to_page(
    doc_id: u64,
    page_index: u32,
    image_bytes: Vec<u8>,
    x_pt: f32,        // PDF pt，原點左下
    y_pt: f32,
    width_pt: f32,
    height_pt: f32,
) -> Result<AddImageResult, MediaError>
```

**待實現**：
```rust
// 圖形插入（Phase 3）
#[tauri::command]
pub async fn pdf_add_shape_annotation(
    doc_id: u64,
    page_index: u32,
    shape_type: String,   // "rect" | "ellipse" | "line"
    // 扁平座標陣列（與前端 AnnotationObject.points 格式一致）：
    //   rect/ellipse: [x, y, width, height]
    //   line: [x1, y1, x2, y2]
    points: Vec<f32>,
    fill: Option<String>,
    stroke: Option<String>,
    stroke_width: f32,
    opacity: f32,
) -> Result<AddImageResult, MediaError>
```

參數規格（待實作前確認）：
- `points`：`rect/ellipse` 使用 `[x, y, width, height]`，`line` 使用 `[x1, y1, x2, y2]`，皆為 PDF pt。
- `fill` / `stroke`：`#RRGGBB` 或 `None`（UI 的 `none` 需轉為 `None`）。
- `opacity`：0.0–1.0，後端轉為 PDFium RGBA alpha（0–255），套用於 fill/stroke。

#### 簽名管理

```rust
// signature.rs

#[tauri::command]
pub async fn signature_save(
    name: String,
    image_bytes: Vec<u8>,
) -> Result<SignatureInfo, String>

#[tauri::command]
pub async fn signature_list() -> Result<Vec<SignatureInfo>, String>

#[tauri::command]
pub async fn signature_delete(id: String) -> Result<(), String>

#[tauri::command]
pub async fn signature_get(id: String) -> Result<SignatureInfo, String>
```

### PDFium API 使用

PDFium 支援的相關 API：

```rust
// 建立並添加圖片物件
FPDFPageObj_NewImageObj(document)
FPDFImageObj_SetBitmap(pages, count, image_object, bitmap)
FPDFImageObj_SetMatrix(image_object, a, b, c, d, e, f)
FPDFPage_InsertObject(page, page_object)

// 建立路徑物件（用於圖形）
FPDFPageObj_CreateNewPath(x, y)
FPDFPath_LineTo(path, x, y)
FPDFPath_BezierTo(path, x1, y1, x2, y2, x3, y3)
FPDFPath_Close(path)
FPDFPageObj_SetFillColor(page_object, r, g, b, a)
FPDFPageObj_SetStrokeColor(page_object, r, g, b, a)
FPDFPageObj_SetStrokeWidth(page_object, width)

// 儲存變更
FPDFPage_GenerateContent(page)
```

**狀態**：✅ 已驗證 pdfium-render 0.8.35 支援 `create_image_object()` API。

---

## 狀態管理與 Undo/Redo

### 整合現有機制

標註操作需要與現有的 undo/redo 系統整合：

```typescript
// modules/annotation/store.ts

export const useAnnotationStore = defineStore('annotation', () => {
  const media = useMediaStore()

  // 標註歷史（與 media revision 同步）
  // 註：AnnotationState 內的 selectedIds 使用 string[] 而非 Set，確保深拷貝正常
  const history = ref<AnnotationState[]>([])
  const historyIndex = ref(-1)

  // 深拷貝當前狀態（使用 JSON 序列化，因所有欄位皆為可序列化類型）
  function cloneState(state: AnnotationState): AnnotationState {
    return JSON.parse(JSON.stringify(state))
  }

  function pushState() {
    // 截斷 redo 歷史
    history.value = history.value.slice(0, historyIndex.value + 1)
    history.value.push(cloneState(currentState.value))
    historyIndex.value++
  }

  function addAnnotation(obj: AnnotationObject) {
    pushState()
    objects.value[obj.pageIndex].push(obj)
    media.markDirty()
  }

  function undo() {
    if (historyIndex.value > 0) {
      historyIndex.value--
      restoreState(cloneState(history.value[historyIndex.value]))
    }
  }

  function redo() {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++
      restoreState(cloneState(history.value[historyIndex.value]))
    }
  }
})
```

### Dirty State 處理

- 任何標註變更都會標記 `media.dirty = true`
- 切換檔案或關閉時，檢查 dirty 狀態
- 儲存時，先 flatten 標註到 PDF，再執行現有儲存流程

---

## 實現階段

### Phase 1：基礎架構 + 圖片插入 ✅ 已完成

**目標**：建立核心架構，實現最基本的圖片插入功能。

**範圍**：
- AnnotationLayer 組件
- 座標轉換工具
- 圖片插入（選擇檔案 → 放置 → 儲存）
- 基本選擇/移動功能

**完成日期**：2025-01-04

### Phase 2：簽名功能

**目標**：完整的簽名功能。

**範圍**：
- SignaturePadModal 組件（手寫繪製）
- 簽名管理（儲存、列表、刪除）
- 簽名放置流程

**狀態**：待實現

### Phase 3：基本圖形 ✅ 已完成

**目標**：矩形、圓形、線條、箭頭繪製。

**範圍**：
- 形狀繪製工具（rect, ellipse, line, arrow）
- 樣式面板（顏色、線寬、線條樣式：實線/虛線/點線）
- 選擇、移動、調整大小功能
- 支援 PDF 和圖片兩種媒體類型
- 圖片標註儲存（Canvas 合成後存檔）

**完成日期**：2025-01-04

### Phase 4：進階交互

**目標**：完善編輯體驗。

**範圍**：
- ~~調整大小手柄~~ ✅ 已完成
- 旋轉功能
- 複製/貼上
- 圖層順序
- 鍵盤快捷鍵（部分完成：V 選擇、R 矩形、O 橢圓、L 線條、A 箭頭、Delete 刪除）

**狀態**：部分完成

### Phase 5：繪圖工具 ✅ 已完成

**目標**：自由繪製功能。

**範圍**：
- ✅ 畫筆工具 (`pen`) - 快捷鍵 P
- ✅ 螢光筆工具 (`highlighter`) - 快捷鍵 H，半透明效果
- ✅ 橡皮擦工具 (`eraser`) - 快捷鍵 E
- ✅ 路徑簡化演算法 (Ramer-Douglas-Peucker)
- ✅ SVG 即時預覽
- ⏳ 後端路徑嵌入 API（待實現）

**完成日期**：2026-01-04

**詳細設計**：見 `docs/dev/drawing-feature.md`

### Phase 6：文字工具 ✅ 已完成

**目標**：文字標註功能。

**範圍**：
- ✅ 文字工具 (`text`) - 快捷鍵 T
- ✅ 點擊創建新文字
- ✅ 雙擊編輯現有文字
- ✅ Enter/Blur 確認，Escape 取消
- ✅ 字型大小選擇器 (10-48pt)
- ✅ 空文字自動刪除

**完成日期**：2026-01-04

---

## PoC 驗證結果

**驗證日期**：2025-12-31

**結論**：✅ PDFium API 完全支援圖片嵌入功能

**驗證內容**：
- 新增 `pdf_add_image_to_page` Tauri 命令
- 使用 `pages_mut().get(idx).objects_mut().create_image_object()` API
- 編譯通過，無需額外依賴

**關鍵程式碼**（`src-tauri/src/pdf/worker.rs`）：
```rust
let mut page = record.doc.pages_mut().get(idx_u16)?;
let objects = page.objects_mut();
objects.create_image_object(
    PdfPoints::new(x_pt),
    PdfPoints::new(y_pt),
    &dyn_img,
    Some(PdfPoints::new(width_pt)),
    Some(PdfPoints::new(height_pt)),
)?;
```

---

## 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| ~~PDFium API 不支援圖形嵌入~~ | ~~無法將圖形永久嵌入 PDF~~ | ✅ 已驗證支援 |
| 座標轉換錯誤 | 圖形位置偏移 | 建立單元測試，覆蓋旋轉/縮放場景 |
| 大量標註性能問題 | UI 卡頓 | SVG 虛擬化（只渲染可見頁面的標註） |
| 簽名隱私問題 | 用戶資料外洩 | 簽名僅存本地，不傳輸 |
| 與現有功能衝突 | 文字選擇、右鍵選單失效 | 工具模式切換時調整 pointer-events |

---

## Phase 7：相對大小系統 ✅ 已完成

### 設計目標

將工具大小從「絕對 pt 值」改為「相對視覺大小」，實現所見即所得的繪製體驗。

**完成日期**：2026-01-05

### 核心概念

- **大小選項**：1, 2, 4, 8（代表螢幕上的視覺大小，單位為像素）
- **統一系統**：所有工具（形狀、畫筆、文字）使用同一套大小選項
- **動態換算**：根據當前縮放比例，自動計算實際存儲的 pt 值

### 計算公式

```
scale = displayWidth / pageWidthPt
actualPt = visualSize / scale
```

**情境範例**（用戶選擇大小 4）：

| 縮放比例 | scale | 螢幕視覺 | 實際存儲 pt |
|---------|-------|---------|------------|
| 100% | 1.0 | 4px | 4pt |
| 200% | 2.0 | 4px | 2pt |
| 400% | 4.0 | 4px | 1pt |
| 50% | 0.5 | 4px | 8pt |

### 行為說明

1. **繪製時**：用戶在 400% 縮放下選擇大小 4 繪製
   - 螢幕上看起來是 4 像素粗
   - 實際存儲為 1pt

2. **查看時**：縮回 100% 查看
   - 1pt 線條看起來會很細
   - 這是正確的，因為用戶當時就是想要那個視覺大小

### 文字大小處理

- **移除獨立的 pt 選擇器**（目前的 10, 12, 14... 48pt）
- **使用統一大小選項**：1, 2, 4, 8
- **換算公式**：`fontSize = baseSize * sizeMultiplier / scale`
  - `baseSize`：基準字體大小（如 14pt）
  - `sizeMultiplier`：用戶選擇的大小（1, 2, 4, 8）
  - `scale`：當前縮放比例

### 需要修改的檔案

1. **`src/modules/annotation/types.ts`**
   - 修改 `ToolSettings`，移除 `fontSize`，統一使用 `size`
   - 新增大小常數定義

2. **`src/modules/annotation/store.ts`**
   - 新增 `calculateActualPt(visualSize: number, scale: number)` 函數
   - 修改 `finishDrawing()` 使用動態換算

3. **`src/components/MediaView/parts/AnnotationToolbar.vue`**
   - 移除文字專用的 pt 選擇器
   - 修改大小選項的顯示方式（可能改為圖示或更直觀的標籤）

4. **`src/components/MediaView/parts/AnnotationLayer.vue`**
   - 創建標註時傳入當前 scale
   - 修改 `onSvgMouseDown`、`onDrawEnd` 等函數

5. **`src/modules/annotation/coordinateUtils.ts`**（可選）
   - 新增 `visualSizeToPt(visualSize: number, ctx: CoordinateContext)` 輔助函數

### 實作步驟

1. [x] 在 `types.ts` 定義新的大小系統常數（`VISUAL_SIZES`, `TEXT_BASE_SIZE`）
2. [x] 在 `sizeUtils.ts` 新增換算函數（`visualSizeToPt`, `visualSizeToFontPt`, `getScale`）
3. [x] 修改 `store.ts` 的 `finishDrawing(scale)` 使用動態換算
4. [x] 修改 `AnnotationToolbar.vue` 移除文字 pt 選擇器
5. [x] 修改 `AnnotationLayer.vue` 創建標註時使用換算
6. [x] 更新文件

---

## 建議的下一步

1. ~~**驗證 PDFium API**~~：✅ 已完成（2025-12-31）
2. **確認 UI 設計**：確定工具列位置（頂部 vs 側邊）和交互細節
3. **開始 Phase 1 實現**：
   - 前端 AnnotationLayer 組件
   - 座標轉換工具（screenToPdf / pdfToSvg）
   - 圖片選擇與放置 UI
   - 整合現有儲存流程

---

## 相關文件

- `docs/design.md` - 專案整體設計
- `src/components/MediaView/parts/PdfViewport.vue` - 現有 PDF 檢視器
- `src/modules/media/store.ts` - 媒體狀態管理
- `src-tauri/src/pdf/worker.rs` - PDF 渲染 worker

---

## 變更記錄

| 日期 | 變更內容 |
|------|----------|
| 2025-12-31 | 初版建立：完整架構設計、資料模型、UI 規劃、實現階段 |
| 2025-12-31 | 完成 PDFium API PoC 驗證，確認 `create_image_object()` 可用 |
| 2025-12-31 | 新增 `pdf_add_image_to_page` 命令至 `media.rs` |
| 2025-01-04 | 完成 Phase 1 & 3：AnnotationLayer、AnnotationToolbar、形狀繪製（rect, ellipse, line, arrow）、選擇/移動/調整大小、樣式設定（顏色、線寬、線條樣式）、圖片標註儲存、鍵盤快捷鍵 |
| 2026-01-04 | 完成 Phase 5：繪圖工具（畫筆、螢光筆、橡皮擦）、路徑簡化演算法、pathUtils.ts |
| 2026-01-04 | 完成 Phase 6：文字工具、字型大小選擇器、雙擊編輯 |
| 2026-01-04 | 規劃 Phase 7：相對大小系統設計（視覺大小 → 動態 pt 換算） |
| 2026-01-05 | 完成 Phase 7：相對大小系統（sizeUtils.ts、統一大小選項、移除文字 pt 選擇器） |
