# PDF_Tool 設計文件

## 專案概述

PDF_Tool 是一個基於 Tauri + Vue 3 的 PDF 與圖片檢視器及編輯工具。

## 架構

### 技術棧

- **前端**: Vue 3 + TypeScript + Tailwind CSS
- **後端**: Rust + Tauri
- **狀態管理**: Pinia
- **PDF 渲染**: pdfium-render

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
    └── media.rs        # 媒體處理後端
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
   - 建立 Blob URL
   - 更新 descriptor 資訊（寬高）
   - 渲染到 MediaView 組件

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

### 檢視模式

MediaView 組件支援兩種檢視模式：

1. **符合寬度** (Fit Mode)
   - 圖片自動適應容器寬度
   - 背景填滿整個可視區域
   - 圖片置中顯示

2. **實際大小** (Actual Size Mode)
   - 以原始尺寸的百分比顯示
   - 支援縮放 (10% - 400%)
   - 使用 CSS transform 實現即時縮放

### 縮放系統

縮放邏輯統一由 `src/modules/media/useZoom.ts` composable 管理：

- **核心狀態**: `viewMode` (fit/actual)、`zoomTarget` (縮放百分比)、`displayZoom` (當前顯示值)
- **核心操作**: `zoomIn/zoomOut`、`resetZoom`、`setFitMode`
- **視覺焦點維持**: 使用滾動內容的比例位置 (ratio) 來維持縮放前後的視覺中心點

### MediaView 組件結構

- `MediaView.vue`：主控容器，負責選擇媒體型態、串接工具列與載入狀態。
- `MediaView/parts/MediaToolbar.vue`：檔案儲存與縮放控制列，透過事件呼叫檢視器動作。
- `MediaView/parts/PdfViewport.vue`：專責 PDF 頁面渲染、快取與右鍵操作。
- `MediaView/parts/ImageViewport.vue`：圖片檢視與縮放控制，保持與 PDF 相同的檢視體驗。

### Compression 模組（UI）

- `Compression/CompressionView.vue`：壓縮主頁（PDF/圖片 Tab）。
- `Compression/parts/PdfCompressPane.vue`：PDF 壓縮參數（目標有效 DPI、格式（JPEG/保留）、品質、結構最佳化）。
- `Compression/parts/ImageCompressPane.vue`：圖片壓縮參數（格式、品質、最大邊、移除中繼資料）。
- 目前僅提供前端 UI 與設定持久化（`src/modules/compress/`），後端壓縮指令將於後續加入。

更多壓縮設計與策略詳見：`docs/compression.md`。

### 雙快取策略（PDF 專用）

PDF 頁面採用雙快取策略以平衡載入速度與顯示品質：

- **低解析度快取**: 快速載入的縮圖（可選關閉）
- **高解析度快取**: 按需載入的完整品質頁面（支援 LRU 淘汰）

## 設定系統

使用 Pinia store 管理全域設定，支援：

- 渲染格式 (PNG/JPEG/WebP/Raw)
- DPI 與品質設定
- 深色模式
- 快取大小限制
- 等等...

持久化：設定改為以 JSON 檔案儲存於系統的 App Config 目錄（Tauri BaseDirectory.AppConfig），不做舊版相容或遷移。
- 主要設定：`$APPCONFIG/settings.json`
- 匯出設定：`$APPCONFIG/export-settings.json`
- 壓縮設定：`$APPCONFIG/compress-settings.json`
- 最近檔案：`$APPCONFIG/recent-files.json`

## 檔案列表

- 支援多檔案管理
- 記憶上次瀏覽頁碼（PDF）
- 搜尋過濾功能

## 系統層級開檔流程

- 後端在 `src-tauri/src/lib.rs` 內維護待處理佇列並透過 `frontend_ready` 指令與 `open-file` 事件串接單一實例與系統開檔事件。
- 前端於 `src/modules/app/openFileBridge.ts` 初始化 `open-file` 事件監聽，新增路徑至檔案列表並呼叫媒體檢視載入。
- `src-tauri/tauri.conf.json` 的 `fileAssociations` 訊息將應用註冊為 PDF 與常見圖片格式的檢視器。

## 未來規劃

- [ ] 圖片編輯功能（旋轉、裁切）
- [ ] 圖片批次處理
- [ ] 圖片轉 PDF
- [ ] 更多匯出選項
##### `imageToPdf({ srcPath, destPath }): Promise<{ path: string }>`

將圖片轉為 PDF 並回傳輸出路徑；ImageView 右鍵選單提供快捷操作。
