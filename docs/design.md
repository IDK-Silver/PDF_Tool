# PDF Tool 設計說明（Tauri + Vue）

本文描述目前專案的現況與近期規劃。舊版以 PDFium 為核心的規格已過時，現改以前端 PDF.js 檢視為起點，視需求再導入後端重工作業。

## 目前狀態
- 技術堆疊
  - 前端：Vue 3、Vue Router、Vite
  - 桌面容器：Tauri v2
  - 已啟用外掛：`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-opener`、`@tauri-apps/plugin-store`
- 主要功能
  - 左側檔案清單：拖放/加入/移除/選取
  - 模式切換：`view`／`convert`／`compose`（目前以 view 為主；其餘為骨架）
  - 版面：左右雙欄，中間拖拉條，可調整左欄寬度（會保存）
  - 狀態持久化：使用 plugin-store 寫入 `state.json`（key：`appState`，schema `version: 1`）
    - 保存內容：各模式檔案清單、各模式選取、各模式搜尋字串、最後模式、UI 左欄寬度
    - 以 1 秒 debounce 寫入，避免高頻刷寫
- 重要檔案位置
  - 佈局與狀態：`src/App.vue`
  - 模式頁面：`src/views/ViewMode.vue`、`src/views/ConvertMode.vue`、`src/views/ComposeMode.vue`
  - 清單元件：`src/components/FileListPanel.vue`、`src/components/FileListItem.vue`
  - 模式清單狀態：`src/composables/useModeFiles.ts`
  - 持久化：`src/composables/persistence.ts`
  - Tauri 外掛：`src-tauri/src/lib.rs`（builder）、`src-tauri/capabilities/default.json`（權限）

## 佈局與互動
- Grid 三欄：左欄 | 拖拉條 | 右欄
  - `leftWidth` 預設 320px，範圍約 240px～視窗寬度 70%
  - 以 Pointer Events 拖曳更新；視窗縮放時夾住範圍
  - 寬度保存於持久化（`ui.leftWidthPx`）
- 路由與模式
  - `mode` 與路由雙向同步：`/view`、`/convert`、`/compose`
  - 各模式各自擁有檔案清單與 `activeId`

## 狀態持久化（plugin-store）
- 檔案：`state.json`；Key：`appState`；Schema 版號：`version: 1`
- 型別：`PersistedState`（於 `src/composables/persistence.ts`）
  - `lastMode`、`files.{view,convert,compose}`（`PdfFile[]`）
  - `active.{view,convert,compose}`（`string | null`）
  - `queries.{view,convert,compose}`（搜尋字串）
  - `ui.leftWidthPx`（左欄寬度）
- 行為：啟動時載入；狀態變更時以 1 秒 debounce 寫回。

## 即將實作：View 模式（多頁直向 + 右鍵匯出本頁為圖片）
本階段專注於「右欄顯示 PDF（多頁直向捲動）」與「針對某一頁右鍵 → 匯出該頁為圖片」。

### 渲染方案
- 採用 PDF.js（`pdfjs-dist`）於前端渲染 Canvas。
- 檔案讀取：使用 `@tauri-apps/plugin-fs` 讀取本機 PDF bytes，傳入 `getDocument({ data })`。
- Worker：以 Vite worker 模組載入，設定 `GlobalWorkerOptions`。
- 多頁直向：每頁一個容器（Canvas + Overlay），可延伸支援懶渲染/虛擬清單。

### 頁級右鍵
- 右鍵僅發生在「單一頁」容器上：在 Overlay 攔截 `contextmenu`。
- PageContext（事件內容）包含：檔案資訊（id/name/path）、`pageNumber`、`scale`、頁尺寸、滑鼠座標（畫面 px 與 PDF pt）。

### 匯出「本頁」為圖片（PNG）
- 流程：
  1) 以較高倍率（預設 2x）將該頁渲染到 offscreen canvas。
  2) 以 `canvas.toBlob('image/png')` 產生影像資料。
  3) 使用 `plugin-dialog` 取得存檔目標（預設檔名：`{filename}-page{NNN}.png`）。
  4) 以 `plugin-fs` 寫入磁碟。
- 錯誤處理：存檔取消/失敗皆以訊息提示，不中斷檢視。
- 後續可選：調整倍率/DPI、輸出 JPEG 與品質、命名模板。

## 後續擴充（規劃）
- View：懶渲染/虛擬清單、縮放控制、文字圖層與搜尋、自訂 Overlay（標註/量測/框選）
- Convert：PDF → Image 批次（DPI、品質、範圍、ZIP、命名模板）
- Compose：合併/拆分（拖拉調整頁序、跨檔取頁）
- 後端（選擇性）：若需高效大量轉換或進階 PDF 操作，再導入 Rust + PDFium 指令；前端維持現有 UI。

## 里程碑（近期）
1) M1 Viewer 基礎：多頁直向渲染 + 頁 Overlay 與右鍵骨架
2) M1.1 右鍵動作：匯出本頁 PNG（2x）
3) M1.2 效能：懶渲染/虛擬清單；加入縮放控制
4) M2 Convert：表單與批次轉圖（可先前端渲染，必要時移至後端）
5) M3 Compose：合併/拆分互動與輸出



## Cmd+Option+I）打開開發者工具

## 近期更新（Viewer + 搜尋 + 縮放）

本段整理目前已完成的重要更新與行為定義，便於後續維護：

- PDF 檢視引擎（usePdfViewerEngine）
  - 指標為中心的縮放錨點：Ctrl/Cmd + 滾輪、鍵盤縮放皆以滑鼠/視窗中心為錨點，縮放後回捲定位不漂移。
  - CSS 縮放過渡（Tween）：在重新渲染前，以 host/canvas 橋接方式先行縮放，過渡結束後再以新倍率重排並回捲至錨點。
  - 文字層同步：縮放過渡時同步套用 transform 至文字層，避免文字與畫面錯位。
  - 視窗化渲染：僅在可視區附近進行渲染/文字層建立，降低資源占用。
  - API：暴露 `getScrollState`、`scrollToPosition`、`prepareZoomAnchor`、`disableTweenOnce` 等，供外層精準控制。

- 縮放模式與快捷鍵
  - 「縮放到適當大小（fit）」：依容器寬度自動計算倍率。
  - 一旦使用鍵盤/滑鼠縮放，模式切換為「實際大小（actual）」，UI 會顯示為已選取狀態，避免模式與畫面不一致。
  - 支援設定「縮放過渡（ms）」、可在特定互動（如鍵盤縮放）暫時關閉過渡以獲得即時感。

- 側欄切換與縮放模式
  - 設定頁新增「側欄切換時自動切換到『實際大小』」選項：
    - 當目前在「fit」模式且收合/展開左欄時，自動切至「actual」，倍率採用切換前的當前倍率。
    - 不再需要/顯示「目標倍率」欄位；行為完全自動化。

- PDF 文字搜尋（PDF 專用）
  - UI：
    - 工具列最左側提供搜尋按鈕；按下在檢視區左上角顯示搜尋面板。
    - 面板顯示「目前/總數」；支援 Enter（下一個）、Shift+Enter（上一個）、Ctrl/Cmd+F 快捷開啟/聚焦。
  - 範圍：僅對 PDF 啟用；圖片檢視不顯示搜尋。
  - 狀態保存：每個檔案的搜尋開關、關鍵字與目前索引獨立保存，切換檔案時自動恢復。
  - 高亮繪製：
    - 以文字層 DOM 建立 Range 計算矩形，支援「跨多個節點」的連續命中；每個命中完整畫出所有矩形，當前命中以實心邊框標示。
    - Highlighter 疊在文字層上方（提高 z-index），移除混合模式（blend-mode），並加入邊框與陰影，確保在整頁圖片等背景上仍清楚可見。
    - 縮放後自動重繪目前命中的高亮，讓位置與大小與新倍率對齊。

- 其他 UI 調整
  - 搜尋按鈕置於最左邊；展開側欄按鈕緊貼最左，易於快速點擊。

## 設定頁（Settings）更新

- Viewer 預設模式：`fit` 或 `actual`。
- Viewer 效能微調：文字層閒置（ms）、重繪閒置（ms）、縮放過渡（ms）。
- 側欄切換行為：
  - 「側欄切換時自動切換到『實際大小』」：啟用時，從 `fit` 進行側欄收合/展開會自動切到 `actual`，倍率採切換前的當前倍率。
  - 移除「目標倍率」欄位（已自動化）。

## 已知與後續

- 某些 PDF 雖有文字層，但字元在多個 span 中斷行；已透過跨節點 Range 支援命中與高亮。
- OCR 後援尚未實作：針對純影像頁的搜尋，未來可加可選的 OCR fallback（tesseract.js 或 Tauri 後端），僅在文字層為空時啟用並快取結果。
- 若縮放結束後想避免自動捲動至目前命中，可考慮加上 `suppressScroll` 選項以完全靜默重繪高亮（規劃中）。
