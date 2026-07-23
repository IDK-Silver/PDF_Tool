# Kano PDF Tool 設計文件

## 專案概述

Kano PDF Tool 是一個基於 Tauri + Vue 3 的 PDF 與圖片檢視器及編輯工具。

## 架構

### 技術棧

- **前端**: Vue 3 + TypeScript + Tailwind CSS
- **後端**: Rust + Tauri
- **狀態管理**: Pinia
- **PDF 渲染**: pdfium-render
- **檢視顯示管線**: WebGPU canvas（PDF 與圖片共用）

### 目錄結構

```
src/
├── components/          # Vue 組件
│   ├── FileList/       # 檔案列表組件
│   ├── MediaView/      # 媒體檢視器（PDF/圖片）
│   └── Settings/       # 設定面板
├── modules/            # 功能模組
│   ├── export/         # 匯出功能
│   ├── filelist/       # 檔案列表狀態管理
│   ├── media/          # 媒體處理（PDF/圖片）
│   └── settings/       # 設定狀態管理
└── router/             # 路由配置

src-tauri/
└── src/
    ├── lib.rs          # Tauri 主入口
    ├── media.rs        # 媒體處理命令
    ├── error.rs        # 錯誤類型
    ├── image/          # 圖片處理模組
    └── pdf/            # PDF 處理模組
        ├── mod.rs
        ├── worker.rs   # 背景渲染執行緒
        ├── render.rs   # 頁面渲染
        ├── compress.rs # 壓縮功能
        └── types.rs    # 資料結構
```

## 媒體處理模組

### 支援格式

- **PDF**: 完整支援（檢視、編輯、匯出）
- **圖片**: PNG, JPEG, WebP, GIF, BMP, TIFF（可將單張圖片轉為單頁 PDF）

### 圖片載入流程

1. **檔案選擇**: 使用者透過檔案選擇器或拖曳檔案到視窗選擇圖片
2. **分析檔案**: 呼叫 `analyze_media` 識別檔案類型
3. **載入圖片**: 
   - 呼叫 `image_read` Rust command
   - 後端使用 `image` crate 解碼圖片
   - 回傳圖片 bytes、寬高、MIME 類型
4. **前端顯示**:
   - 建立 WebGPU 可讀的影像來源
   - 更新 descriptor 資訊（寬高）
   - 透過 WebGPU canvas 顯示到 MediaView 組件

### API

#### Rust Commands

##### `image_read(path: String) -> ImageReadResult`

讀取圖片檔案並解碼。

**回傳值**:
```rust
struct ImageReadResult {
    width: u32,
    height: u32,
    image_bytes: Vec<u8>,
    mime_type: String,
}
```

##### `analyze_media(path: String) -> MediaDescriptor`

分析檔案類型（PDF 或圖片）。

**回傳值**:
```rust
struct MediaDescriptor {
    path: String,
    type: MediaType,  // 'pdf' | 'image' | 'unknown'
    name: String,
    size: Option<u64>,
    pages: Option<usize>,
    width: Option<u32>,
    height: Option<u32>,
}
```

##### `image_to_pdf(src_path: String, dest_path: String) -> String`

將圖片轉為單頁 PDF 並存檔，回傳輸出路徑。

#### 前端 Service

##### `imageRead(path: string): Promise<ImageReadResult>`

呼叫後端讀取圖片。

##### `analyzeMedia(path: string): Promise<MediaDescriptor>`

呼叫後端分析檔案類型。

##### `pdfCopyPage({ srcDocId, srcIndex, destDocId, destIndex }): Promise<{ pages: number }>`

將來源 PDF 的單一頁插入至目前開啟文件的指定索引位置，回傳最新頁數。

### 檢視模式

MediaView 組件支援兩種檢視模式：

1. **符合寬度** (Fit Mode)
   - 圖片自動適應容器寬度
   - 背景填滿整個可視區域
   - 圖片置中顯示

2. **實際大小** (Actual Size Mode)
   - 以原始尺寸的百分比顯示
   - 支援縮放 (10% - 400%)
   - 使用 WebGPU canvas 貼圖顯示，CSS 尺寸負責版面與捲動範圍

### 縮放系統

縮放邏輯統一由 `src/modules/media/useZoom.ts` composable 管理：

- **核心狀態**: `viewMode` (fit/actual)、`zoomTarget` (縮放百分比)、`displayZoom` (當前顯示值)
- **核心操作**: `zoomIn/zoomOut`、`resetZoom`、`setFitMode`
- **視覺焦點維持**: 使用滾動內容的比例位置 (ratio) 來維持縮放前後的視覺中心點
- **縮放上限**: 由設定 `settings.zoomMaxPercent` 控制（預設 400%，可調 50–800），PDF 與圖片共用

### MediaView 組件結構

- `MediaView.vue`：主控容器，負責選擇媒體型態、串接工具列與載入狀態。
- `MediaView/parts/MediaToolbar.vue`：檔案儲存與縮放控制列，透過事件呼叫檢視器動作。
- `MediaView/parts/PdfViewport.vue`：專責 PDF 頁面渲染排程、快取與右鍵操作；頁面像素交給 WebGPU canvas 顯示。
- `MediaView/parts/ImageViewport.vue`：圖片檢視與縮放控制；圖片像素交給 WebGPU canvas 顯示，保持與 PDF 相同的檢視體驗。
- `MediaView/parts/WebGpuImageCanvas.vue`：PDF 與圖片共用的 WebGPU 貼圖顯示元件。

右鍵選單：
- 插入空白頁（自動判斷插入於頁面「之前/之後」；預設紙張可選「根據當前頁」）
- 插入檔案（PDF 逐頁插入；圖片將轉為單頁 PDF 後插入；同樣自動判斷「之前/之後」）

互動補充：
- 按住 Shift 時，工具列的「儲存」按鈕切換為「捨棄變更」（紅色），點擊將丟棄目前未儲存修改並自磁碟重載。
- 按住 Shift 開啟右鍵選單或點擊插入項時，「插入（之前/之後）」將反轉（例如原本為「之前」則顯示並採用「之後」）。

### Compression 模組（UI）

- `Compression/CompressionView.vue`：壓縮主頁（PDF/圖片 Tab）。
- `Compression/parts/PdfCompressPane.vue`：PDF 壓縮參數（目標有效 DPI、格式（JPEG/保留）、品質、結構最佳化）。
- `Compression/parts/ImageCompressPane.vue`：圖片壓縮參數（格式、品質、最大邊、移除中繼資料）。
- 目前僅提供前端 UI 與設定持久化（`src/modules/compress/`），後端壓縮指令將於後續加入。

更多壓縮設計與策略詳見：`docs/compression.md`。

### Workspace 模式

- `Workspace/WorkspaceView.vue`：雙欄工作台，左欄與右欄各自綁定一個資料夾。
- 左側側欄在此模式改為工作台清單，不顯示最近檔案。
- 每一欄改為「上方 viewer + 底部水平 filmstrip」的版面（仿 Lightroom）；底部清單以縮圖呈現並用 primary 色框標示目前選取檔案。
- 圖片以實際檔案縮圖呈現（透過 `convertFileSrc`），PDF 顯示文件圖示，提升一目了然程度。
- 每一欄檔案清單可拖拉改變順序；← / → / ↑ / ↓ 方向鍵在目前作用欄內依此順序切換檔案，Shift + ← / → 則切換左右兩欄的聚焦。
- 注意：底部 filmstrip 為 `src/components/Workspace/parts/WorkspaceFilmstrip.vue`，與一般檔案清單 `src/components/FileList/FileList.vue`（用於工作台清單）區分開，並以 `path` 而非 `id` 作為選取鍵，避免與後端回傳缺少 `id` 欄位產生不一致。
- 資料夾不顯示工具列按鈕，改為雙擊欄位標題或空白區設定。
- 右側 viewer 沿用既有 PDF / 圖片檢視元件，但關閉標註與原本的頁面編輯右鍵選單，改由工作台注入自訂右鍵動作。
- 目前自訂右鍵動作包含：
  - 將目前檔案實際搬移到另一欄資料夾
  - 將目前檔案移到垃圾桶
- 工具列「擷取」會開啟匯出對話框（`Workspace/parts/CaptureExportDialog.vue`），可選擇格式（PNG / JPEG / WebP）、基準寬度、品質（JPEG/WebP）與輸出位置；按「匯出」後等後端實際寫出檔案並回傳 `path` 再顯示完成提示，選項透過 localStorage 鍵 `workspace-export-settings` 持久化。

資料流：
- `src/modules/workspace/store.ts`：管理工作台列表、左右資料夾、每欄排序、目前選取檔案與 runtime viewer session；狀態透過 localStorage 鍵 `workspaces` 持久化（含上次開啟資料夾與選取檔案）。
- `src/modules/workspace/exportSettings.ts`：擷取匯出對話框使用的格式、基準寬度、品質與上次輸出資料夾。
- `src/modules/media/session.ts`：將原本單一 `media store` 的檢視 session 抽成可重用工廠，讓工作台左右兩欄各自擁有獨立 session。
- `src-tauri/src/workspace.rs`：提供資料夾掃描、檔案搬移、檔案刪除與擷取合成（PNG/JPEG/WebP）指令。

### 導覽行為（Dirty State）

- 從 `media_view` 切換到 `compress` 時，若 `media.dirty` 為 `true`，彈出確認對話框詢問是否放棄未儲存變更。
- 使用者選擇「捨棄」後，會以目前選擇的路徑重新載入描述資訊（自磁碟），以確保記憶體中的暫存修改被丟棄；選擇「取消」則中止導覽。
- 實作位置：`src/components/MediaView/MediaView.vue` 內的 `onBeforeRouteLeave`。

### 快取策略（PDF）

PDF 頁面僅維持 RAW 高解析度快取，按需載入並以 LRU 策略淘汰，確保視覺品質與互動流暢。低清預覽已移除。

顯示管線：
- PDF viewer 頁面仍由 Rust/pdfium-render 依設定的 PDF 渲染 DPI 光柵化為 RAW `ImageData`。
- Fit 與實際大小模式使用同一個 DPI；不再用 DPR 或最大輸出寬度改變頁面像素。
- 縮放只改變 WebGPU canvas 的顯示比例，不觸發 PDF 重新光柵化；canvas backing buffer 固定使用 RAW 來源尺寸，避免放大時要求超大的 WebGPU current texture。
- 前端不再以 `<img>` 或 2D canvas 作為 PDF/圖片的主要顯示路徑。
- `WebGpuImageCanvas.vue` 將 RAW `ImageData` 或影像 Blob 上傳為 GPU texture，再繪製到 WebGPU canvas。
- 暗色模式反色在 WebGPU fragment shader 內處理，避免額外 DOM filter。
- 不提供 2D canvas 顯示 fallback；若目標 WebView 不支援 WebGPU，畫面會顯示 WebGPU 錯誤狀態。

### 文字框快取（PDF Text）

- 目的：加速 `GetPageText`／文字框抽取，避免重複跑 `FPDFText_GetCharBox`。
- 儲存：桌面端放於 app cache 目錄下的 `db/page_text_cache.db`（SQLite），內容為 JSON + gzip 壓縮的 `PageTextContent`。
- Key：`{file_hash (SHA-256), file_size, page_index, rotation_deg, extractor_version}`。異動格式時提升 `extractor_version`，避免讀舊資料。
- 失效：若檔案雜湊或大小不同則重新計算；文件被編輯標記為 dirty 時不讀寫快取；儲存成功後重算雜湊並清除 dirty。
- 容量：軟上限（預設 50MB），以 `updated_at` 先進先出刪除，避免 DB 無限增長。
- 約束：SQLite 檔僅由文字框快取模組建立與管理，其他功能若需共用同一 DB，必須透過共用介面呼叫，不得自行開新連線或新檔。

### 工作台擷取快取（Workspace Capture）

- 目的：加速重複匯出同一批圖片，避免每次都重跑高成本縮圖。
- 儲存：桌面端放於 app cache 目錄下的 `db/workspace_cache.db`（SQLite），由共用 SQL helper 建立與開啟。
- Key：`{path, file_size, modified_ns, target_width, resize_method}`。檔案內容或目標寬度改變就重新計算。
- 內容：儲存精確縮圖後的 RGBA 像素，不改輸出尺寸、不改縮圖方法，只省去重算。
- 容量：軟上限（預設 256MB），以 `updated_at` 先進先出刪除。
- 效能判讀：工作台匯出的第一次縮圖在 `debug/dev` build 會明顯偏慢，獨立 benchmark 可到數秒；同條件在 `release` build，現有 `image + Lanczos3` 路徑約為 `84ms`（`4096x2304 -> 1200x675`），屬可接受範圍。
- 平台決策：曾比較 macOS 內建 `vImage`，速度更快，但目前 `release` 已足夠，因此先維持跨平台共用的 Rust 流程，不引入平台特化後端。

## 設定系統

使用 Pinia store 管理全域設定，支援：

- PDF 渲染 DPI
- 深色模式
- 快取大小限制
- 等等...

持久化：全部改為使用 `localStorage`，不再讀寫 AppConfig JSON 檔。
- 主要設定：`localStorage` 鍵 `settings`
- 匯出設定：`localStorage` 鍵 `export-settings`
- 壓縮設定：`localStorage` 鍵 `compress-settings`
- 最近檔案：`localStorage` 鍵 `recent-files`

使用者行為選項區分：
- 編輯存檔行為（檢視/編輯頁）：另存新檔/覆蓋原檔（`settings.deleteBehavior`，設定頁面「檔案操作」段落）
- 壓縮存檔行為（壓縮頁）：另存新檔/覆蓋原檔（`compressSettings.saveBehavior`，設定頁面「壓縮存檔行為」段落）
  - 另存新檔時，預設儲存位置為來源檔所在資料夾。

## 檔案列表

- 支援多檔案管理
- 記憶上次瀏覽頁碼（PDF）
- 搜尋過濾功能

## 系統層級開檔流程

- 後端在 `src-tauri/src/lib.rs` 內維護待處理佇列並透過 `frontend_ready` 指令與 `open-file` 事件串接單一實例與系統開檔事件。
- 前端於 `src/modules/app/openFileBridge.ts` 初始化 `open-file` 事件監聽，新增路徑至檔案列表並呼叫媒體檢視載入。
- `src-tauri/tauri.conf.json` 的 `fileAssociations` 訊息將應用註冊為 PDF 與常見圖片格式的檢視器。

## 未來規劃

- [ ] PDF View 渲染排程重整
  - [ ] 重新設計 PDF View 的渲染排程，優先服務目前頁面
  - [ ] 設定頁一併重做，改成對應新渲染架構的參數與模式
- [ ] PDF 標註系統（詳見 `docs/annotation-system.md`）
  - [ ] 插入圖片
  - [ ] 基本圖形（矩形、圓形、線條）
  - [ ] 簽名功能（手寫、圖片簽名、簽名管理）
- [ ] 圖片編輯功能（旋轉、裁切）
- [ ] 圖片批次處理
- [ ] 更多匯出選項
