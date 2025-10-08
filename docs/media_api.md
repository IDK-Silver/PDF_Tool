# PDF Media API（Tauri，狀態式）

本文件定義 PDF 後端（`src-tauri/src/media.rs`）唯一且一致的 API。所有操作以「已開啟文件的 `docId`」為核心，不再支援以路徑直接修改的相同功能。

- 單一權威：本文件為 PDF API 之唯一參考；請勿同時維護重複 API。
- 狀態式：透過 `pdf_open()` 取得 `docId`，一系列檢視/編輯/渲染/儲存皆以該 `docId` 進行。
- 索引基準：頁索引一律採 0-based。
- 單執行緒：所有 PDF 操作在後端單一 worker 內序列化執行，避免跨執行緒風險。

---

## 常見型別與錯誤

- `MediaError { code: string, message: string }`
  - `not_found`：找不到檔案或資源
  - `invalid_input`：參數錯誤或超界
  - `io_error`：檔案/IO 例外
  - `parse_error`：PDF 解析錯誤
  - `canceled`：渲染請求被較新世代覆蓋

- `PdfOpenResult { docId: number, pages: number }`
- `PdfPageSize { widthPt: number, heightPt: number }`（單位：pt，72 pt = 1 inch）
- `PageRenderBytesRaw { pageIndex: number, widthPx: number, heightPx: number, scale?: number, dpi?: number, format: 'png'|'jpeg'|'webp', imageBytes: Uint8Array }`

---

## 指令（Tauri commands）

### analyze_media
- 用途：快速分析檔案類型與基礎資訊。
- 參數：`{ path: string }`
- 回傳：`MediaDescriptor`（含 `type`, `name`, `size`, `pages?` 等）
- 備註：僅分析，不開啟文件。

### pdf_open
- 用途：開啟 PDF，建立狀態並回傳 `docId`。
- 參數：`{ path: string }`
- 回傳：`PdfOpenResult { docId, pages }`
- 失敗：`not_found`, `parse_error`, `io_error`

### pdf_close
- 用途：關閉並釋放指定文件狀態。
- 參數：`{ docId: number }`
- 回傳：`void`
- 失敗：`not_found`

### pdf_page_size
- 用途：查詢單頁尺寸（pt）。
- 參數：`{ docId: number, pageIndex: number }`
- 回傳：`PdfPageSize { widthPt, heightPt }`
- 失敗：`not_found`, `invalid_input`

### pdf_render_page
- 用途：渲染單頁為影像 bytes（供前端建立 Blob URL）。
- 參數：
  ```ts
  {
    docId: number,
    pageIndex: number,
    // 三選一優先序：targetWidth > dpi > scale（若皆無，使用缺省寬度）
    targetWidth?: number, // 目標寬度（px）
    dpi?: number,         // 以頁寬 pt * dpi / 72 推導寬度
    scale?: number,       // 相對缺省寬度比例（例如 1.0）
    format?: 'png'|'jpeg'|'webp',
    quality?: number,     // 1~100（視格式適用）
    gen?: number          // 前端世代，用於 best-effort 取消
  }
  ```
- 回傳：`PageRenderBytesRaw`
- 失敗：`not_found`, `invalid_input`, `canceled`
- 說明：`gen` 搭配 `pdf_render_cancel()`，可使過期請求被忽略。

### pdf_render_cancel
- 用途：宣告某頁的最小有效世代，低於該值的渲染結果將被丟棄。
- 參數：`{ docId: number, pageIndex: number, minGen: number }`
- 回傳：`void`

### pdf_insert_blank
- 用途：在指定索引插入空白頁。
- 參數：`{ docId: number, index: number, widthPt: number, heightPt: number }`
- 回傳：`{ pages: number }`（插入後總頁數）
- 失敗：`not_found`, `invalid_input`

### pdf_delete_pages
- 用途：刪除多個頁面（會依索引由大到小刪除以避免位移）。
- 參數：`{ docId: number, indices: number[] }`
- 回傳：`{ pages: number }`（刪除後總頁數）
- 失敗：`not_found`, `invalid_input`
- 規範：`indices` 不可重複且需在範圍內；不可刪成 0 頁。

### pdf_rotate_page
- 用途：旋轉單頁。
- 參數：`{ docId: number, index: number, rotateDeg: 0|90|180|270 }`
- 回傳：`void`
- 失敗：`not_found`, `invalid_input`

### pdf_copy_page
- 用途：跨文件或同文件複製單頁到指定位置。
- 參數：`{ srcDocId: number, srcIndex: number, destDocId: number, destIndex: number }`
- 回傳：`{ destPages: number }`（複製後目標文件的總頁數）
- 失敗：`not_found`, `invalid_input`

### pdf_save
- 用途：儲存目前文件至路徑（覆蓋或另存）。
- 參數：`{ docId: number, destPath?: string, overwrite?: boolean }`
  - `destPath` 省略且 `overwrite=true`：覆蓋原本開啟的檔案路徑。
  - 指定 `destPath`：另存到該路徑；`overwrite` 為 `true` 時允許覆蓋已存在檔案。
- 回傳：`{ path: string, pages: number }`
- 失敗：`not_found`, `io_error`

---

### pdf_export_page_image
- 用途：將指定頁匯出為圖片檔。
- 參數：`{ docId: number, pageIndex: number, destPath: string, format?: 'png'|'jpeg', targetWidth?: number, dpi?: number, quality?: number }`
  - `format` 預設 `png`；若為 `jpeg` 可提供 `quality`（1–100）。
  - `targetWidth` 與 `dpi` 擇一提供，優先 `targetWidth`；若皆省略則以預設寬度輸出。
- 回傳：`{ path: string, widthPx: number, heightPx: number, format: string }`
- 失敗：`not_found`, `invalid_input`, `io_error`

---

### pdf_export_page_pdf
- 用途：將指定頁匯出為單頁 PDF 檔（保留向量內容，不修改原文件）。
- 參數：`{ docId: number, pageIndex: number, destPath: string }`
- 回傳：`{ path: string }`
- 失敗：`not_found`, `invalid_input`, `io_error`

---

## 行為與約定

- 單位與索引
  - 頁索引：0-based。
  - 尺寸單位：pt（72 pt = 1 inch）。
  - 旋轉角度：僅允許 `0|90|180|270`。
- 渲染畫質
  - `format` 與 `quality` 由前端自行決定策略；一般建議：PNG（無損）、JPEG（有損、較小）、WEBP（平衡）。
- 狀態與並發
  - 後端維持 `docId -> PdfDocument` 映射；所有操作在單一 worker 執行，避免並發衝突。
  - `pdf_render_cancel` 為最佳努力；應搭配前端的世代檢查避免過期覆蓋。
- 例外處理
  - 遵循 `MediaError` 統一回傳錯誤碼與訊息，便於前端提示。

---

## 破壞性更新（相較於舊流程）

- 僅保留 `docId` 為核心的狀態式 API；不再提供「以路徑直接刪頁/旋轉/插頁/保存」的等價函式。
- `pdf_render_page`：`docId` 必填；不再支援 `rotateDeg`（旋轉改由 `pdf_rotate_page` 變更狀態）。

---

## 實作位置

- 後端：`src-tauri/src/media.rs`
- 本文件：`docs/media_api.md`

如需新增 API，請先更新本文件再實作，並避免引入重複或兼容層以維持清晰度。
