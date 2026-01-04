# 標註工具列 UI 設計

本文件規劃標註工具列的完整 UI 設計與交互邏輯。

---

## 工具列總覽

### 入口

在 MediaToolbar 上有一個 ✏️ (鉛筆) 按鈕，點擊後在下方顯示標註子工具列。

```
MediaToolbar:
┌─────────────────────────────────────────────────────────────────────┐
│ [儲存][搜尋][檔案管理器][✏️] │   頁碼   │   縮放控制   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ 點擊 ✏️
AnnotationToolbar (子工具列):
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [選擇][矩形][圓形][直線][箭頭]│[文字]│[馬賽克][計數]│[畫筆][螢光筆]│[圖片][簽名]│[●][/▼]│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 佈局結構

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  核心工具區                                                    │  樣式調整區  │
│  [選擇][矩形][圓形][直線][箭頭][文字][馬賽克][計數][畫筆][螢光筆][圖片][簽名] │  [●][/▼]    │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 工具清單

| # | 工具 | ID | 快捷鍵 | 說明 |
|---|------|----|--------|------|
| 1 | 選擇 | `select` | `V` | 選取、移動、調整已繪製的物件 |
| 2 | 矩形 | `rect` | `R` | 繪製矩形框線 |
| 3 | 圓形 | `ellipse` | `O` | 繪製圓形或橢圓 |
| 4 | 直線 | `line` | `L` | 繪製直線 |
| 5 | 箭頭 | `arrow` | `A` | 繪製箭頭，指示特定位置 |
| 6 | 文字 | `text` | `T` | 在頁面上輸入文字說明 |
| 7 | 馬賽克 | `pixelate` | `M` | 遮蓋敏感資訊 |
| 8 | 計數標籤 | `counter` | `N` | 自動編號圓圈 (1, 2, 3...) |
| 9 | 畫筆 | `pen` | `P` | 平滑自由繪製 |
| 10 | 螢光筆 | `highlighter` | `H` | 半透明標記 |
| 11 | 插入圖片 | `image` | `I` | 插入圖片檔案 |
| 12 | 簽名 | `signature` | `S` | 新增或選擇簽名 |

---

## Icon 設計

所有 icon 採用統一風格：
- 尺寸：24x24 viewBox
- 線寬：stroke-width="2"
- 顏色：currentColor
- 填充：fill="none"（除特殊情況）

### SVG Path 定義

```typescript
const toolIcons: Record<string, string> = {
  // 選擇 - 游標箭頭
  select: `
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="M13 13l6 6" />
  `,

  // 矩形 - 圓角矩形
  rect: `
    <rect x="3" y="3" width="18" height="18" rx="2" />
  `,

  // 圓形 - 橢圓
  ellipse: `
    <circle cx="12" cy="12" r="9" />
  `,

  // 直線 - 斜線
  line: `
    <line x1="5" y1="19" x2="19" y2="5" />
  `,

  // 箭頭 - 帶箭頭的線
  arrow: `
    <line x1="5" y1="19" x2="19" y2="5" />
    <polyline points="10 5 19 5 19 14" />
  `,

  // 文字 - T 字
  text: `
    <path d="M4 7V4h16v3" />
    <path d="M12 4v16" />
    <path d="M8 20h8" />
  `,

  // 馬賽克 - 方格圖案
  pixelate: `
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  `,

  // 計數標籤 - 帶數字的圓圈
  counter: `
    <circle cx="12" cy="12" r="9" />
    <text x="12" y="16" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor" stroke="none">1</text>
  `,

  // 畫筆 - 鋼筆圖示
  pen: `
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
  `,

  // 螢光筆 - 粗頭筆
  highlighter: `
    <path d="M3 17l4-4 4 4-4 4-4-4z" fill="currentColor" opacity="0.3" />
    <path d="M7 13l10-10 4 4-10 10" />
    <path d="M11 17l6-6" />
  `,

  // 插入圖片 - 圖片框
  image: `
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  `,

  // 簽名 - 手寫筆跡
  signature: `
    <path d="M3 17c1-1 2-3 4-3s2 2 4 2 2-2 4-2 3 2 4 3" />
    <path d="M3 21h18" />
  `,
}
```

---

## 樣式調整區

工具列右側有兩個下拉按鈕：

### 顏色選擇 [●]

圓形色塊按鈕，顯示當前選中顏色。點擊展開下拉選單：

```
┌──────────┐
│ ■ ■ ■ ■  │  ← 8 色快選
│ ■ ■ ■ ■  │
├──────────┤
│ [自訂色] │  ← color picker
└──────────┘
```

**預設顏色盤** (8 色)：

```typescript
const colorPalette = [
  '#FF0000', // 紅
  '#FF9500', // 橘
  '#FFCC00', // 黃
  '#34C759', // 綠
  '#007AFF', // 藍
  '#5856D6', // 紫
  '#FF2D55', // 粉紅
  '#000000', // 黑
]
```

### 線條設定 [/▼]

線條圖示 + 下拉箭頭。點擊展開下拉選單：

```
┌────────┐
│ ━━━  1 │  ← 線條粗細
│ ━━━  2 │
│ ━━━  4 │
│ ━━━  8 │
├────────┤
│ ────── │  ← 線條樣式
│ - - -  │
│ · · ·  │
└────────┘
```

**線條粗細**：1pt、2pt、4pt、8pt

**線條樣式**：

```typescript
type StrokeStyle = 'solid' | 'dashed' | 'dotted'

const strokeDashArrays: Record<StrokeStyle, string> = {
  solid: '',           // 實線
  dashed: '8 4',       // 虛線
  dotted: '2 4',       // 點線
}
```

---

## 工具特定設定

### 馬賽克工具

```
筆刷大小: [───●───] 20px
模糊強度: [───●───] 8
```

### 計數標籤工具

```
起始數字: [ 1 ] [重置]
背景色: 跟隨當前顏色
文字色: 自動對比 (深/淺)
```

### 螢光筆工具

```
透明度: 固定 40%
線寬: [───●───] 16pt (範圍: 8-32pt)
```

### 文字工具

```
字型大小: [12▼] pt
字型: [系統預設▼]
```

---

## 完整工具列 UI

### 觸發方式

點擊 MediaToolbar 上的 ✏️ 按鈕開啟/關閉標註工具列。

### 工具列狀態

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ [選擇] │ [矩形][圓形][直線][箭頭] │ [文字] │ [馬賽克][計數] │ [畫筆][螢光筆] │ [圖片][簽名] │ [●][/▼] │
│   V    │   R    O    L    A     │   T    │    M      N    │   P      H    │   I     S    │ 顏色 線條│
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 關閉方式

- 點擊 MediaToolbar 上的 ✏️ 按鈕
- 按 **Esc** 鍵

### 分組邏輯

| 分組 | 工具 | 說明 |
|------|------|------|
| 選擇 | select | 獨立 |
| 圖形 | rect, ellipse, line, arrow | 幾何圖形 |
| 文字 | text | 獨立 |
| 效果 | pixelate, counter | 特殊效果 |
| 繪圖 | pen, highlighter | 自由繪製 |
| 插入 | image, signature | 插入物件 |
| 樣式 | color, stroke | 顏色與線條設定 |

---

## 類型定義更新

### types.ts

```typescript
// 標註類型
export type AnnotationType =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'pixelate'
  | 'counter'
  | 'path'       // pen/highlighter 產生
  | 'image'
  | 'signature'

// 工具類型
export type ToolType =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'pixelate'
  | 'counter'
  | 'pen'
  | 'highlighter'
  | 'image'
  | 'signature'

// 線條樣式
export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

// 工具設定
export interface ToolSettings {
  // 通用
  color: string           // 主要顏色
  strokeWidth: number     // 線寬 (pt)
  strokeStyle: StrokeStyle // 線型
  opacity: number         // 不透明度

  // 馬賽克專用
  pixelateSize: number    // 馬賽克方塊大小
  pixelateStrength: number // 模糊強度

  // 計數專用
  counterStart: number    // 起始數字

  // 文字專用
  fontSize: number        // 字型大小 (pt)
  fontFamily: string      // 字型

  // 螢光筆專用
  highlighterWidth: number // 螢光筆線寬
}

// 預設設定
export const defaultToolSettings: ToolSettings = {
  color: '#FF0000',
  strokeWidth: 2,
  strokeStyle: 'solid',
  opacity: 1,
  pixelateSize: 10,
  pixelateStrength: 8,
  counterStart: 1,
  fontSize: 14,
  fontFamily: 'system-ui',
  highlighterWidth: 16,
}
```

### AnnotationObject 擴展

```typescript
// 箭頭物件
interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow'
  points: [number, number, number, number] // [x1, y1, x2, y2]
  stroke: string
  strokeWidth: number
  strokeStyle: StrokeStyle
}

// 文字物件
interface TextAnnotation extends BaseAnnotation {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  color: string
}

// 馬賽克物件
interface PixelateAnnotation extends BaseAnnotation {
  type: 'pixelate'
  // 儲存區域，實際模糊在儲存時處理
}

// 計數物件
interface CounterAnnotation extends BaseAnnotation {
  type: 'counter'
  number: number
  backgroundColor: string
  textColor: string // 自動對比色
}
```

---

## 交互邏輯

### Delete 鍵行為

```typescript
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    // 有選中物件時刪除
    if (annotation.selectedIds.length > 0) {
      e.preventDefault()
      annotation.deleteSelected()
      return
    }

    // 有待放置物件時取消
    if (annotation.pendingObject) {
      e.preventDefault()
      annotation.setPendingObject(null)
      return
    }
  }
}
```

### 計數標籤自動遞增

```typescript
function placeCounter(pageIndex: number, x: number, y: number) {
  const counter: CounterAnnotation = {
    id: uuid(),
    type: 'counter',
    pageIndex,
    x,
    y,
    width: 24,
    height: 24,
    number: annotation.toolSettings.counterStart,
    backgroundColor: annotation.toolSettings.color,
    textColor: getContrastColor(annotation.toolSettings.color),
    opacity: 1,
  }

  annotation.addAnnotation(counter)

  // 自動遞增下一個數字
  annotation.updateToolSettings({
    counterStart: annotation.toolSettings.counterStart + 1
  })
}
```

### 快捷鍵綁定

```typescript
const keyBindings: Record<string, ToolType> = {
  'v': 'select',
  'r': 'rect',
  'o': 'ellipse',
  'l': 'line',
  'a': 'arrow',
  't': 'text',
  'm': 'pixelate',
  'n': 'counter',
  'p': 'pen',
  'h': 'highlighter',
  'i': 'image',
  's': 'signature',
}

function handleKeyDown(e: KeyboardEvent) {
  // 忽略輸入框
  if (isInputElement(e.target)) return

  const key = e.key.toLowerCase()
  if (key in keyBindings) {
    e.preventDefault()
    selectTool(keyBindings[key])
  }
}
```

---

## 響應式佈局

### 寬度不足時

當工具列寬度不足以顯示所有工具時：

**方案 1：雙列顯示**
```
┌─────────────────────────────────────────────────┐
│ [選擇][矩形][圓形][直線][箭頭][文字]            │
├─────────────────────────────────────────────────┤
│ [馬賽克][計數][畫筆][螢光筆][圖片][簽名] │ 樣式 │
└─────────────────────────────────────────────────┘
```

**方案 2：溢出選單**
```
┌───────────────────────────────────────────────────────────┐
│ [選擇][矩形][圓形][直線][箭頭][文字][畫筆][螢光筆] [▼更多] │
└───────────────────────────────────────────────────────────┘
                                                    ↓
                                        ┌─────────────────┐
                                        │ [馬賽克]        │
                                        │ [計數]          │
                                        │ [圖片]          │
                                        │ [簽名]          │
                                        └─────────────────┘
```

**建議採用方案 1**，更直覺且不需額外點擊。

---

## 實現順序

### Phase 1：UI 框架 ✅
- [x] 更新 types.ts（ToolType, AnnotationType, StrokeStyle）
- [x] MediaToolbar 添加 ✏️ 按鈕
- [x] 實現 AnnotationToolbar 完整 UI
- [x] Icon SVG 定義（12 個工具）
- [x] 顏色選擇器（下拉選單）
- [x] 線寬/線型選擇器（下拉選單）
- [x] 快捷鍵綁定（V/R/O/L/A/T/M/N/P/H/I/S）
- [x] Delete 鍵刪除選中物件

### Phase 2：基礎圖形工具 ✅
- [x] 矩形繪製
- [x] 圓形繪製
- [x] 直線繪製
- [x] 箭頭繪製

### Phase 3：特殊工具
- [ ] 文字工具
- [ ] 計數標籤
- [ ] 馬賽克效果

### Phase 4：繪圖工具
- [ ] 畫筆（平滑曲線）
- [ ] 螢光筆

### Phase 5：插入工具
- [ ] 圖片插入（現有）
- [ ] 簽名功能

---

## Undo/Redo 邏輯

### 快捷鍵

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl/Cmd + Z` | 復原 (Undo) |
| `Ctrl/Cmd + Shift + Z` | 重做 (Redo) |

### 狀態管理架構

```typescript
// annotation store 狀態
interface UndoRedoState {
  history: AnnotationState[]  // 歷史快照陣列
  historyIndex: number        // 當前位置指標
  MAX_HISTORY: 50             // 最大歷史記錄數
}
```

### 核心邏輯

```
歷史陣列: [S0] [S1] [S2] [S3] [S4]
                          ↑
                    historyIndex = 3

Undo: historyIndex-- → 還原到 S2
Redo: historyIndex++ → 還原到 S4
新操作: 截斷 S4，推入新狀態 S3'
```

### 需要記錄歷史的操作

| 操作 | 函數 | 說明 |
|------|------|------|
| 新增標註 | `addAnnotation()` | 繪製完成時 |
| 更新標註 | `updateAnnotation()` | 移動、縮放、修改屬性 |
| 刪除標註 | `deleteAnnotation()` | 單個刪除 |
| 批次刪除 | `deleteSelected()` | Delete 鍵刪除選中 |

### 不記錄歷史的操作

| 操作 | 說明 |
|------|------|
| 選擇/取消選擇 | 不影響標註內容 |
| 切換工具 | UI 狀態 |
| 修改工具設定 | 顏色、線寬等 |
| 設定 pendingObject | 尚未確認的操作 |

### 修正後的實現

```typescript
// store.ts

// 初始化時保存初始狀態
function initHistory() {
  if (history.value.length === 0) {
    history.value = [cloneState(currentState.value)]
    historyIndex.value = 0
  }
}

// 推入新狀態（操作後調用）
function pushState() {
  initHistory()

  // 截斷 redo 歷史
  history.value = history.value.slice(0, historyIndex.value + 1)

  // 推入當前狀態
  history.value.push(cloneState(currentState.value))

  // 限制歷史長度
  if (history.value.length > MAX_HISTORY) {
    history.value.shift()
  } else {
    historyIndex.value++
  }
}

// 復原
function undo() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    restoreState(cloneState(history.value[historyIndex.value]))
    media.markDirty()
  }
}

// 重做
function redo() {
  if (historyIndex.value < history.value.length - 1) {
    historyIndex.value++
    restoreState(cloneState(history.value[historyIndex.value]))
    media.markDirty()
  }
}

// 操作範例
function addAnnotation(obj) {
  // 1. 執行操作
  const annotation = { ...obj, id: generateId() }
  objects.value[annotation.pageIndex].push(annotation)

  // 2. 操作後保存狀態
  pushState()

  media.markDirty()
  return annotation
}
```

### 狀態流程圖

```
初始狀態
    │
    ▼
┌─────────┐
│ history │ = [S0]
│ index   │ = 0
└─────────┘
    │
    │ addAnnotation() - 新增矩形
    ▼
┌─────────┐
│ history │ = [S0, S1]
│ index   │ = 1
└─────────┘
    │
    │ addAnnotation() - 新增圓形
    ▼
┌─────────┐
│ history │ = [S0, S1, S2]
│ index   │ = 2
└─────────┘
    │
    │ undo() - Ctrl+Z
    ▼
┌─────────┐
│ history │ = [S0, S1, S2]
│ index   │ = 1          ← 圓形消失
└─────────┘
    │
    │ undo() - Ctrl+Z
    ▼
┌─────────┐
│ history │ = [S0, S1, S2]
│ index   │ = 0          ← 矩形也消失
└─────────┘
    │
    │ redo() - Ctrl+Shift+Z
    ▼
┌─────────┐
│ history │ = [S0, S1, S2]
│ index   │ = 1          ← 矩形回來
└─────────┘
    │
    │ addAnnotation() - 新增線條（新分支）
    ▼
┌─────────┐
│ history │ = [S0, S1, S3]  ← S2 被截斷
│ index   │ = 2
└─────────┘
```

### 注意事項

1. **深拷貝**：使用 `JSON.parse(JSON.stringify())` 確保狀態獨立
2. **記憶體限制**：最多保留 50 筆歷史
3. **dirty 狀態**：undo/redo 後也要更新 `media.dirty`
4. **重置**：切換檔案時清空歷史

---

## 變更記錄

| 日期 | 變更內容 |
|------|----------|
| 2025-01-04 | 初版：完整工具列 UI 規劃 |
| 2025-01-04 | Phase 1 完成：UI 框架、所有工具按鈕、顏色/線條下拉選單 |
| 2025-01-04 | 新增 Undo/Redo 邏輯規劃文件 |
| 2026-01-04 | Phase 2 完成：矩形、圓形、直線、箭頭繪製功能（PDF 和圖片皆支援）|
