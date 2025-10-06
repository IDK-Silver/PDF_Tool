# MediaView 設計與整合規劃

> 本文件說明「從左側 MediaFileListPane 選取項目 → 交給後端 Rust 解析 → 在 MediaView 呈現」的完整流程、資料結構與對應元件。屬於本專案的設計/實作權威文件之一，後續異動請一併維護。

## 目標與範圍
- 目標（本階段僅限「圖片」與「PDF」）：
  - 使用者在左側清單選擇檔案後，前端呼叫 Tauri Rust 指令進行媒體解析，根據為圖片或 PDF 在 MediaView 顯示內容與摘要。
  - 保持模組化與清晰 API 合約，便於後續擴充（縮圖、PDF 專用 viewer、更多中繼資料）。
  - 編輯區支援雙檢視模式，允許跨文件移動或複製頁面，並維持檔案安全。
- 範圍：
  - 前端路由/元件/狀態管理串接。
  - Tauri 後端指令與能力（capabilities）需求。
  - 僅支援圖片與 PDF 的型別偵測與必要中繼資料。

## 決策摘要（已定稿）
- PDF 引擎：`pdfium-render`；PDFium 動態庫隨 App 打包，執行期動態連結（首次呼叫時延遲載入）。
- 錯誤模型：所有指令以 `Result<T, MediaError>` 回傳。
- 頁索引：0-based（`pageIndex`/`indices`）。
- `pdf_render_page`：`scale` 與 `dpi` 擇一（`dpi` 優先）；`rotateDeg` 僅允許 0/90/180/270；預設 `format='png'`。
- 透明處理：PDF 透明區域以白底扁平化。
- 先不實作渲染快取：不設置 LRU/預取/容量上限，專注 MVP 正確性。
- 縮放：即時 CSS 平滑，120ms 後高解析重渲染；`devicePixelRatio` 上限 2.0。
- 後端事件：`document_changed`（`path`, `mtime`, `pageCount`, `replaced`）。

## 設計原則（PDF）
- 禁止使用 `pdf.js`/`pdfjs-dist`。
- 禁止依賴 WebView 內建 PDF 檢視（`<embed>`/`<object>`/`<iframe>`）。
- 採「後端原生渲染＋前端顯示圖片」策略：由 Rust 端將 PDF 單頁光柵化為位圖（PNG/WebP），前端以 `<img>` 呈現，避免 WebView PDF 控制器帶來的限制。
- 為支援「刪除指定頁」「右鍵頁面功能」等互動，所有頁級動作（渲染、刪除、旋轉、重排）都由後端實作 API，前端僅為 UI 與命令觸發層。
- PDF 引擎：採用 `pdfium-render`，PDFium 動態庫隨 App 打包，執行期動態連結；首次呼叫相關指令時才延遲載入（lazy init），避免 `npm run dev` 階段未備齊動態庫時啟動失敗。

## 名詞與元件
- MediaFileListPane：左側媒體清單面板（檔案列表）。
  - 目前檔案：`src/components/FileList/MediaFileListPane.vue:1`
- MediaView：右側媒體顯示區域。
  - 目前檔案：`src/components/MediaView/MediaView.vue:1`
- FileList 與 FileListItem：通用清單與項目元件。
  - `src/components/FileList/FileList.vue:1`
  - `src/components/FileList/FileListItem.vue:1`
- 路由：
  - `src/router/index.ts:1`
- Tauri 後端：
  - 進入點與指令註冊：`src-tauri/src/lib.rs:1`

## 系統架構與資料流
1. 使用者點選 MediaFileListPane 的項目（`FileItem`）。
2. 前端狀態（store）接收選擇，呼叫 Tauri `invoke('analyze_media', { path })`。
3. Rust 端解析檔案（依副檔名/內容推測型態，收集中繼資料），回傳 `MediaDescriptor`。
4. 前端收到 `MediaDescriptor`：
   - 以 `convertFileSrc(path)` 生成可顯示的 `contentUrl`（Tauri v2 於 `@tauri-apps/api/core`）。
   - 將狀態更新給 MediaView。
5. MediaView 僅依 `type` 在圖片與 PDF 間切換渲染策略：
   - image：直接以 `<img>` 顯示原檔（`convertFileSrc`）。
   - pdf：呼叫後端渲染頁面為位圖，前端以 `<img>` 顯示渲染結果。

## 型別與資料結構（前端）
- 索引基準：所有 PDF 頁面索引採 0-based（包含 `pageIndex` 與 `indices`）。
- FileItem（既有）：`src/components/FileList/types.ts:1`
- 新增（建議放置）：`src/modules/media/types.ts`
  - MediaType：`'pdf' | 'image' | 'unknown'`
  - MediaDescriptor：
    - `path: string`
    - `type: MediaType`
    - `name: string`
    - `size: number` 可選
    - `pages: number` 可選（PDF）
    - `width: number, height: number` 可選（影像）
    - `orientation: 1|2|3|4|5|6|7|8` 可選（影像 EXIF 方向）
    - 其餘欄位不於本階段實作（影音欄位移除）。

- PDF 渲染結果（前端接收）：`PageRender`
  - `pageIndex: number`
  - `widthPx: number`
  - `heightPx: number`
  - `scale: number`（相對 1x 渲染縮放）或 `dpi: number`（二選一）
  - `format: 'png' | 'webp'`
  - `imagePath: string`（暫存檔路徑，前端以 `convertFileSrc` 顯示）
  - 前端可在接收後補充 `contentUrl: string` 可選（由 `convertFileSrc` 產生）。

## API 合約（Tauri Rust）
共用錯誤（統一）：
- 以 `Result<T, MediaError>` 回傳。
- `MediaError { code: 'not_found' | 'unsupported_type' | 'parse_error' | 'permission_denied' | 'io_error', message: string }`

1) 媒體基本解析
- 指令：`analyze_media`
- 請求：`{ path: string }`
- 回應：`MediaDescriptor`
 - 備註：MVP 先以副檔名推測型別並回傳檔名與大小，圖片尺寸與 EXIF 後續補上。

2) PDF 基本資訊
- 指令：`pdf_info`
- 請求：`{ path: string }`
- 回應：`{ pages: number }`，另有 `pageSizesPt: Array<{ widthPt: number, heightPt: number }>` 可選
 - 備註：已實作 lazy init 與頁數回傳；若未安裝 PDFium 回傳 `not_found` 並提示執行 `npm run pdfium:fetch`。

3) PDF 單頁渲染（後端光柵化）
- 指令：`pdf_render_page`
- 請求：
  - 必填：`{ path: string, pageIndex: number }`
  - 其一：`scale?: number` 或 `dpi?: number`（兩者擇一，若皆提供以 `dpi` 優先）
  - 可選：`rotateDeg?: 0 | 90 | 180 | 270`, `format?: 'png' | 'webp'`
- 回應：`PageRender`
- 預設：未提供 `format` 時為 `png`；未提供縮放參數時以「容器寬度 × devicePixelRatio」推導渲染寬度（由前端傳入後端）。
- 備註：`rotateDeg` 僅影響本次渲染，不改動原始檔案。

4) PDF 刪除頁（非破壞預設）
- 指令：`pdf_delete_pages`
- 請求：`{ path: string, indices: number[] }`，另有 `outputPath: string` 與 `replace: boolean` 可選
- 回應：`{ path: string, deleted: number[], pageCount: number }`
- 策略：
  - 預設非破壞：若未提供 `replace: true`，輸出到 `outputPath` 或 app 暫存/輸出目錄；原檔不動。
  - 若 `replace: true` 且權限允許，直接覆寫原檔（需風險提示與備份策略）。

5) PDF 複製頁到另一文件
- 指令：`pdf_copy_pages`
- 請求欄位：
  - `srcPath: string`
  - `srcIndices: number[]`
  - `dstPath: string`
  - `insertAt: number`
  - `outputPath: string` 可選
  - `replace: boolean` 可選，預設 false
  - `deduplicateResources: boolean` 可選，預設 true
- 回應：`{ path: string, inserted: Array<{ srcIndex: number, dstIndex: number }>, pageCount: number }`
- 策略：
  - 預設非破壞：未提供 `replace: true` 時輸出到 `outputPath`，原始目標檔不動
  - `deduplicateResources` 預設啟用，跨文件合併時移除重複字型與影像資源
  - `insertAt` 為插入位置索引，零為檔首，等於頁數為附加到末尾

6) PDF 移動頁到另一文件
- 指令：`pdf_move_pages`
- 請求欄位：
  - `srcPath: string`
  - `srcIndices: number[]`
  - `dstPath: string`
  - `insertAt: number`
  - `dstOutputPath: string` 可選
  - `srcOutputPath: string` 可選
  - `replaceDst: boolean` 可選，預設 false
  - `replaceSrc: boolean` 可選，預設 false
  - `deduplicateResources: boolean` 可選，預設 true
- 回應：`{ srcPath: string, dstPath: string, moved: Array<{ srcIndex: number, dstIndex: number }>, srcPageCount: number, dstPageCount: number }`
- 策略：
  - 行為等同先 `pdf_copy_pages` 再 `pdf_delete_pages`，兩步以同一原子操作批次完成
  - 預設非破壞，除非明確指定 `replaceDst` 或 `replaceSrc`
  - 任一端為開啟狀態時後端持有短期檔案鎖，避免競態覆寫

7) PDF 重排同文件頁序
- 指令：`pdf_reorder_pages`
- 請求：`{ path: string, mapping: number[] }`
- 回應：`{ path: string, pageCount: number }`
- 策略：
  - `mapping` 長度等於原頁數，內容為新的頁序索引，零為第一頁
  - 以暫存檔寫入與原子換名提昇安全

8) PDF 擷取頁為新文件
- 指令：`pdf_extract_pages`
- 請求：`{ path: string, indices: number[], outputPath: string }`
- 回應：`{ path: string, pageCount: number }`

最小實作（MVP）：
- 僅接受圖片（png/jpg/jpeg/gif/bmp/webp/tiff）與 PDF。
- 型別偵測策略：
  - 優先依副檔名；如需更嚴謹可輔以 `infer` 檔頭檢測。
- 回傳欄位：
  - 通用：`type`, `name`, `path`, `size`（檔案大小）
  - 圖片：`width`, `height`（用 `image::image_dimensions`，不解碼整張）；`orientation`（可選，用 `kamadak-exif` 讀 EXIF）
  - PDF：`pages`（用 `lopdf` 或 `pdfium` 取得頁數）；可選頁尺寸（pt）。
- 不支援格式：回 `Err(MediaError { code: 'unsupported_type' ... })`。

Rust 端檔案規劃：
- `src-tauri/src/lib.rs:1`：註冊 `.invoke_handler(tauri::generate_handler![greet, analyze_media, pdf_info, pdf_render_page])`
- `src-tauri/src/media.rs`：
  - `#[derive(Serialize)] struct MediaDescriptor { ... }`
  - `#[derive(Serialize)] struct MediaError { code: String, message: String }`
  - `#[tauri::command] fn analyze_media(path: String) -> Result<MediaDescriptor, MediaError>`
  - `#[tauri::command] fn pdf_info(path: String) -> Result<{ pages: number }, MediaError>`（骨架，lazy init）
  - `#[tauri::command] fn pdf_render_page(path, pageIndex, scale|dpi, rotateDeg, format) -> Result<PageRender, MediaError>`（骨架；後續以 `pdfium-render` 光柵化為位圖輸出到臨時目錄）
  - Lazy init `Pdfium`：首次呼叫 `pdf_*` 指令時嘗試從 `resource_dir()/pdfium/<platform>/` 綁定；找不到則回 `not_found` 並提示 `npm run pdfium:fetch`。

## 前端整合設計
- 狀態管理（Pinia 建議）：
  - 位置：`src/modules/media/store.ts`
  - 狀態：
    - `selected: FileItem | null`
    - `descriptor: MediaDescriptor | null`
    - `loading: boolean`
    - `error: string | null`
  - 行為：
    - `select(item: FileItem)`：設定選取並呼叫 `loadDescriptor(item.path)`
    - `loadDescriptor(path: string)`：`invoke('analyze_media')` → 產生 `contentUrl` → 更新 `descriptor`
    - `clear()`：清空狀態
- 服務封裝（建議）：`src/modules/media/service.ts`
  - `analyzeMedia(path: string)` 封裝 `invoke`
  - `toContentUrl(path: string)` 封裝 `convertFileSrc`
- UI 串接：
  - MediaFileListPane 綁定 `@item-click="mediaStore.select"` 或 `selectAndLoad`
    - 參考：`src/components/FileList/MediaFileListPane.vue:1`、`src/components/FileList/FileList.vue:1`
  - MediaView 根據 store 狀態渲染：
    - `loading`：顯示讀取中
    - `error`：顯示錯誤訊息
    - `descriptor`：依 `type` 顯示內容

## MediaView 渲染策略（MVP）
- image：`<img :src="contentUrl" :style="orientation 對應旋轉（可選）" />`（EXIF 方向：前端以 CSS 處理，不改動原檔）。
- pdf：每頁以 `<img :src="renderedPageUrl" />` 呈現；縮放時重新要求後端依比例渲染，透明區域以白底扁平化。
- unknown/錯誤：顯示錯誤訊息與「以系統開啟」按鈕（opener 插件）。

## 雙檢視與跨文件移頁
- 兩個 MediaView 實例可同時存在於編輯區，彼此狀態獨立。
- 支援從任一實例的頁縮圖拖曳到另一實例的插入指示線，完成後呼叫 `pdf_move_pages` 或 `pdf_copy_pages`。
- 插入位置以指示線所在目標頁之前為準，頁尾另有附加插入區。
- 同一文件內的拖曳重排呼叫 `pdf_reorder_pages` 並以原子提交更新序列。
- 完成任一變更後後端發送 `document_changed` 事件（`path`, `mtime`, `pageCount`, `replaced`），前端刷新清單與渲染即可。

## 滾動與虛擬化
- 版面：垂直連續滾動，每頁為一個獨立容器，容器寬度對齊工作區寬度，頁距固定 8 像素。
- 初始化：預設採「符合視窗寬度」策略計算全域縮放倍率，依頁面實際尺寸與容器寬度計算顯示高度。
- 虛擬化：僅渲染可視區域附近的頁面，向上向下各預留 3 頁緩衝，離開緩衝區的頁面釋放 DOM 與圖片資源。
- 量測：若具備 `pageSizesPt`，以頁尺寸與縮放倍率預估高度；無尺寸時以第一次渲染量測作為後續估計。
- 滾動定位：維持頁頂對齊行為，縮放後以指標錨點修正滾動位移，使視覺焦點穩定。

## 縮放與平滑度
- 互動：支援滑鼠與觸控板縮放，按住 `Ctrl` 或 `Cmd` 進行滾輪縮放；提供 `+` 與 `-` 鍵，以及 `0` 重置為符合寬度。
- 倍率：全域縮放倍率範圍 `0.25` 至 `4.0`，步進採指數曲線以符合人眼感知，縮放以指標位置為中心。
- 即時平滑：先以 CSS 轉換在當前圖片上進行即時縮放，轉換原點為指標位置，確保連續且順滑。
- 重新渲染：縮放穩定 120 毫秒後向後端請求新倍率的高解析渲染，替換當前圖片並以淡入交替，避免清晰度落差。
- 解析度：渲染輸出以螢幕像素為基準，輸出寬度等於版面寬度乘以縮放倍率乘以 `devicePixelRatio`，品質因子固定為 `1.0`；為避免超大輸出，`devicePixelRatio` 參與計算時上限採 2.0（可調）。

## 渲染與輸出（MVP）
- 每次縮放或視圖變動時，僅渲染必要頁面；不做預取與持久快取。
- 渲染結果以臨時檔案形式輸出，前端以 `convertFileSrc` 顯示。
- 允許中的渲染任務完成後覆蓋當前顯示；不保留歷史版本。

## 檔案安全與原子寫入
- 修改操作一律以新檔寫入至同目錄暫存檔，完成與 `fsync` 後以原子換名覆蓋或輸出新檔。
- 當 `replace` 啟用時於同目錄產生備份副本，操作成功後保留至工作階段結束。
- 變更完成後更新 mtime，前端依事件刷新當前顯示。

## 滑鼠與觸控板對應
- 滾輪：未按修飾鍵時為縱向卷動，按住 `Shift` 時為橫向卷動。
- 縮放：按住 `Ctrl` 或 `Cmd` 的滾輪事件觸發縮放，縮放幅度依 `deltaY` 指數映射計算。
- 觸控板：以系統轉換為滾輪事件的方式處理，行為與滑鼠一致。

## 刪頁與狀態同步
- 觸發：頁項目提供右鍵選單，包含刪除頁、匯出當前頁圖片、複製頁索引等操作。
- 執行：刪除動作呼叫 `pdf_delete_pages`，預設產出新檔，完成後更新當前文件路徑與頁數。
- 回復：保留最近一次刪除操作的備份檔名與路徑，提供快速還原功能。

相關檔案：
- MediaView：`src/components/MediaView/MediaView.vue:1`
- 服務與型別：`src/modules/media/{types.ts, service.ts}`
- Opener 插件：`src-tauri/src/lib.rs:1`（已載入 `tauri_plugin_opener::init()`）

## Tauri 能力與權限
- 顯示：前端以 `convertFileSrc` 顯示本機圖片與後端輸出的渲染圖片（非 WebView PDF 檢視）。
- 解析：Rust 以 `std::fs` 讀取檔案，PDF 以 `pdfium-render` 光柵化、`lopdf`/`pdfium` 變更頁面。
- PDFium 佈署：動態庫隨 App 打包於資源目錄，執行期動態連結；首次呼叫 PDF 相關指令時才延遲載入（lazy init）。建議於 `src-tauri/tauri.conf.json:1` 的 `bundle.resources` 指定各平台動態庫。
- Capabilities：
  - 既有 `core:default` 可行；若有額外需求另行增列。
  - 檔案寫入策略：渲染圖片寫入臨時目錄；PDF 寫入新檔（非破壞），除非 `replace: true`。

## 錯誤處理與回饋
- Rust：所有指令以 `Result<T, MediaError>` 回傳，`message` 提供簡要可讀訊息；必要時於 debug log 詳述。
- 前端：
  - `loading` 過程顯示骨架或 Spinner。
  - 失敗顯示錯誤區塊與重試動作。
  - `unknown` 類型提供外部開啟備援。

## 里程碑（Milestones）
- M0（MVP）— 僅圖片與 PDF：
  - 指令 `analyze_media`：回傳圖片尺寸或 PDF 頁數與檔案大小。
  - 指令 `pdf_info`、`pdf_render_page`：後端渲染單頁位圖並回傳路徑。
  - 前端 Pinia store + MediaView 基礎渲染（img/每頁位圖）。
  - 檔案：
    - `src-tauri/src/lib.rs:1`（註冊指令）
    - `src-tauri/src/media.rs`（新增）
    - `src/modules/media/{types.ts, service.ts, store.ts}`（新增）
    - `src/components/MediaView/MediaView.vue:1`（實作渲染）
    - `src/components/FileList/MediaFileListPane.vue:1`（綁定事件）
- M1（頁面操作與體驗）：
  - 指令 `pdf_delete_pages`、（可選）`pdf_rotate_pages`、`pdf_reorder_pages`。
  - 強化縮放體驗與長文件虛擬清單顯示（不含預取/快取）。
  - 仍避免 `pdf.js` 與 WebView 內建 PDF 檢視。
 - M2（雙檢視與跨檔移頁）：
   - 指令 `pdf_copy_pages`、`pdf_move_pages`、`pdf_extract_pages`，完成原子跨檔移頁與複製流程。
   - 前端完成拖放交互、插入指示線與事件廣播同步。
   - 雙檢視拖放與狀態同步穩定運作（不依賴全域渲染快取）。

## 驗證與測試建議
- 前端：
  - 型別檢查與基本互動驗證（選擇列表 → 顯示內容）。
  - 手動測試圖片與 PDF（jpg、png、pdf）。
- 後端：
  - 單元測試 `analyze_media` 對不同副檔名的回傳。
  - 本機檔案存取權限驗證與錯誤情境覆蓋。

## 相關連結與參考檔案
- 路由：`src/router/index.ts:1`
- Media 檔案列表：`src/components/FileList/MediaFileListPane.vue:1`
- 通用列表：`src/components/FileList/FileList.vue:1`
- MediaView：`src/components/MediaView/MediaView.vue:1`
- Tauri 指令與插件：`src-tauri/src/lib.rs:1`
- 能力設定：`src-tauri/capabilities/default.json:1`
 - 打包設定：`src-tauri/tauri.conf.json:1`

## TODO 狀態（M0 專注）
- [x] 決策：PDF 引擎採用 `pdfium-render`，PDFium 動態庫隨 App 打包、執行期動態連結（首次呼叫時延遲載入）。
- [x] 決策：PDF 頁索引採 0-based（`pageIndex`/`indices`）。
- [x] 決策：錯誤模型統一為 `Result<T, MediaError>`。
- [x] 決策：預設輸出格式 `png`、透明區域白底扁平化。
- [x] 決策：縮放重新渲染延遲 120ms、`devicePixelRatio` 上限 2.0。
- [x] 決策：後端事件 `document_changed`（`path`, `mtime`, `pageCount`, `replaced`）。
- [x] 實作：`src-tauri/src/media.rs` 指令（`analyze_media`/`pdf_info`/`pdf_render_page`，lazy init + 臨時檔輸出）。
- [x] 實作：`src-tauri/Cargo.toml:1` 新增 `pdfium-render` 相依（啟用 `image_latest`、`pdfium_latest`、`thread_safe`）。
- [x] 實作：`src-tauri/tauri.conf.json:1` 設定 `bundle.resources` 引入 PDFium 動態庫。
- [x] 實作：前端 `src/modules/media/{types.ts, service.ts}` 骨架（invoke 包裝）。
- [x] 實作：`src/components/MediaView/MediaView.vue:1` 最小串接（輸入路徑 → 顯示圖片或 PDF 第一頁）。
- [ ] 驗證：開發與打包在主要平台驗證（至少 macOS），確認動態連結成功。
 

---

如需更動架構或 API，請一併更新本文件並同步 `docs/design.md`（若有）。
