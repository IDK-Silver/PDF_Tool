# PDF Tool 設計說明（Tauri + PDFium）

## 目標
- 桌面版 PDF 工具，支援：
  - PDF → 圖片（PNG/JPEG，DPI、品質、頁碼範圍、ZIP 輸出）
  - PDF 合併與拆分（依頁碼範圍、保留原屬性）
  - 基本頁面操作（旋轉、刪除，作為後續擴充）
- 完全離線運行，跨平台（macOS/Windows/Linux）。
- 使用 PDFium 提供高效能/高相容性的 PDF 操作；Rust 後端負責重工作業與檔案 I/O。

## 架構總覽
- 前端：Vue 3 + Vite（UI 與任務觸發、進度顯示）
- 後端：Tauri（Rust commands）
  - PDF 圖片轉換（渲染）：PDFium
  - 合併／拆分：PDFium（以 Import Pages API 建立新文件 / 輸出子文件）
  - 檔案 I/O、ZIP 打包、進度事件
- 插件：
  - `@tauri-apps/plugin-dialog`：開檔、選擇輸出資料夾
  - `@tauri-apps/plugin-fs`：檔案讀寫
  - `@tauri-apps/plugin-opener`：打開輸出資料夾

## 前端優先與 UI 版面
- 版面配置：整體 2 欄，比例約 7:3（右側主視窗較寬）。
  - 左欄（約 3）：2 列，上列＝功能選單（模式切換），下列＝檔案選擇清單。
  - 右欄（約 7）：主視窗，依模式切換內容。
- 模式定義（功能選單）
  - 檢視模式（view）：單獨查看 PDF（頁面導覽、縮放）。
  - 批次轉換（convert，PDF → Image）：只顯示可調整選項，不含上方控制列、也不做預覽。
  - 合併分割模式（compose）：在主視窗內再切成左右兩側；左＝要編輯的主要檔案，右＝來源檔案（支援拖拉拷貝/合併/拆分）。

### 前端元件與狀態（草案）
- 元件
  - `ModeTabs`：模式切換（view | convert | compose）。
  - `FileListPanel`：檔案清單（拖放/加入/移除/選取），供三種模式共用。
  - 主視圖：`ViewMode`、`ConvertMode`、`ComposeMode`。
    - `ComposeMode` 內再分 `TargetPages`（左）與 `SourcePages`（右），支援拖拉/多選/排序。
  - 通用輸入：`RangeInput`（頁碼字串）、`NamingInput`（命名模板）、`TaskProgress`（進度列）。
- 狀態（TypeScript）
  - `mode: 'view' | 'convert' | 'compose'`
  - `files: Array<{ id: string; path: string; name: string; pages?: number; meta?: Record<string, unknown> }>`
  - `activeId: string | null`
  - `convertOptions: { format: 'png' | 'jpeg'; dpi: number; quality?: number; range?: string; zip: boolean; outputDir?: string; naming: string }`
  - `composeState: { targetId: string | null; sourceIds: string[] }`
  - 進度事件：監聽 `pdf:progress`（`{ task, current, total, file?, message? }`）。

## 視覺與配色（無漸層、以白為主）
- 風格原則：
  - 僅使用純色，完全不使用漸層與材質貼圖。
  - 以白色為主（背景/面板），以中性灰作為分隔與文字色，單一點綴色作為互動/焦點。
  - 優先使用細邊界與留白分隔，陰影極度節制（必要時使用極淺陰影）。
  - 保持 4.5:1（文字）與 3:1（UI 元素）最低對比度。
- 調色盤（可調整的預設）：
  - 背景/面板：白 `#ffffff`
  - 文字（主/輔）：`#111827` / `#6b7280`
  - 邊界/分隔：`#e5e7eb`（hover 行高亮可用 `#f3f4f6`/`#f9fafb`）
  - 點綴（accent，預設藍）：`#2563eb`（可替換成你的品牌色）
  - 狀態色：成功 `#16a34a`、警告 `#d97706`、錯誤 `#dc2626`
- CSS 變數（可直接引用）：
  ```css
  :root {
    color-scheme: light;
    /* colors */
    --bg: #ffffff;
    --surface: #ffffff;
    --panel: #ffffff;
    --text: #111827;
    --text-muted: #6b7280;
    --border: #e5e7eb;
    --hover: #f9fafb;
    --selected: #eff6ff; /* accent 淡色背景 */
    --accent: #2563eb;
    --accent-foreground: #ffffff;
    --ring: rgba(37, 99, 235, 0.5);
    --success: #16a34a;
    --warning: #d97706;
    --danger: #dc2626;
    /* layout */
    --radius: 8px;
    --radius-sm: 6px;
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 24px;
    --space-6: 32px;
    /* elevation（僅必要時使用） */
    --shadow-1: 0 1px 2px rgba(0,0,0,.04);
    --shadow-2: 0 2px 8px rgba(0,0,0,.08);
  }
  body { background: var(--bg); color: var(--text); }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); }
  .divider { border-bottom: 1px solid var(--border); }
  .focus-ring { outline: 2px solid var(--ring); outline-offset: 2px; }
  .btn { border-radius: var(--radius-sm); border: 1px solid var(--border); background: #fff; color: var(--text); }
  .btn-primary { background: var(--accent); color: var(--accent-foreground); border-color: var(--accent); }
  .input { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  .input:focus, .btn:focus { outline: 2px solid var(--ring); outline-offset: 2px; }
  .row-hover:hover { background: var(--hover); }
  ```
- 元件風格細則：
  - 按鈕：預設扁平（白底＋灰邊），主要操作用實心 accent；禁用僅降低不透明度，不改色相。
  - 輸入框/下拉：白底、1px 灰邊、圓角 6px、聚焦顯示明顯 focus ring。
  - 分隔：使用 1px 邊界或 12–16px 留白，不使用分隔陰影與漸層。
  - 清單 hover/選取：hover 用 `--hover`，選取用 `--selected`（不使用強烈底色）。
  - 不使用任何漸層背景/邊框/文字特效；圖示採單一色或描邊色，與文字同步變色。

## 核心選型
- PDF 引擎：`pdfium-render`
  - 使用 PDFium（Google PDF engine）透過 `pdfium-render` crate 進行渲染與頁面匯入/匯出。
  - 啟用「自動帶入預編譯 PDFium」方案，減少使用者安裝負擔。
- 影像編碼：`image` crate（PNG/JPEG），或由 PDFium 直接輸出位圖後再編碼。
- 壓縮：`zip` crate（串流寫入，避免一次性佔用大量記憶體）。
- 併發：`tauri::async_runtime::spawn_blocking` 跑 CPU 密集工作；必要時以批次策略與簡單並行。

## Rust Commands（草案）
所有指令以 `invoke()` 呼叫，必要參數由前端 UI 收集。長任務會透過事件回報進度（事件名稱以 `pdf:` 前綴）。

1) `pdf_info(path)` → 基本資訊
- 輸入：`{ path: string }`
- 輸出：`{ pages: number, sizes: Array<{ width: f32, height: f32 }>, meta?: { title?, author?, subject? } }`
- 用途：顯示頁數、尺寸，協助頁碼範圍與 DPI 建議。

2) `convert_pdf_to_images(input_path, output_dir, opts)`
- 輸入：
  ```json
  {
    "input_path": "string",
    "output_dir": "string",
    "pages": "string | null",  // 例如 "1-3,5,8-"，null 代表全部
    "dpi": 150,                  // 72–300
    "format": "png" | "jpeg",
    "quality": 85,               // 僅 JPEG 使用
    "zip": true,                 // true 則輸出 zip_path
    "naming": "{filename}-{page}-{dpi}.{ext}"
  }
  ```
- 回傳：`{ outputs: string[], zip_path?: string }`
- 事件：`pdf:progress`（payload：`{ task: "render", current, total }`）

3) `merge_pdfs(paths, output_path)`
- 輸入：`{ paths: string[], output_path: string }`（`paths` 依 UI 排序）
- 行為：使用 PDFium 建立新文件，依序 Import Pages，保留基本 metadata（可合併時採用第一個來源或由前端提供）。
- 回傳：`{ output_path: string }`
- 事件：`pdf:progress`（`{ task: "merge", current, total }`）

4) `split_pdf(input_path, ranges, output_dir, naming)`
- 輸入：
  ```json
  {
    "input_path": "string",
    "ranges": "string",        // 例如 "1-3,5,8-10"；或前端已解析為二維陣列
    "output_dir": "string",
    "naming": "{filename}-part{index}.pdf" // 檔名模板
  }
  ```
- 行為：解析頁碼字串 → 每段建立新 PDF → 以 Import Pages 匯入 → 輸出多個檔案。
- 回傳：`{ outputs: string[] }`
- 事件：`pdf:progress`（`{ task: "split", current, total }`）

備選（後續擴充）：`rotate_pages(input_path, ranges, angle, output_path)`、`delete_pages(...)` 等。

## Rust 模組結構（`src-tauri/src/`）
- `lib.rs`：註冊 commands、初始化插件、事件型別定義
- `pdf/mod.rs`
  - `renderer.rs`：PDF → 影像（PDFium 渲染、DPI/格式/品質）
  - `ops.rs`：合併、拆分、旋轉、刪除（PDFium Import/Export APIs）
  - `ranges.rs`：頁碼字串解析工具（支援 `1-3,5,8-`）
  - `naming.rs`：輸出命名模板（`{filename}`, `{page}`, `{dpi}`, `{index}`, `{ext}`）
  - `progress.rs`：進度回報工具（包裝事件發送）

## PDFium 整合（自動帶入預編譯）
- 方案：使用 `pdfium-render` 的「預編譯 PDFium」整合，於 build 期自動抓取對應平台的二進位並連結，無需使用者手動安裝。
- Cargo 設定（示意）：
  ```toml
  [dependencies]
  pdfium-render = { version = "=0.8", features = ["pdfium"] }
  image = "0.25"
  zip = "0.6"
  ```
  說明：
  - 啟用 `pdfium` feature 後，crate 會在編譯時下載對應平台的 PDFium 並完成連結。
  - 若需要落地到 Tauri app bundle 中，照常打包即可；無需用戶安裝系統級 PDFium。
- 初始化（概念）：
  - 以 `pdfium-render` 提供的綁定初始化 PDFium 執行個體。
  - 在 Tauri command 中，每次任務建立或重用一個 `Pdfium` 物件；長任務以 `spawn_blocking` 執行。
- 平台注意事項：
  - macOS/Windows/Linux 皆支援；Apple Silicon 需以相容架構編譯（Tauri 預設已支援）。
  - 若未來要改用系統 PDFium，可關閉 `pdfium` feature，改以環境變數或系統路徑綁定。

## 前端（Vue）流程
- 元件建議：
  - `PdfDropzone.vue`：拖放/選檔、列出多份 PDF
  - `PdfThumbnails.vue`：（選配）以低 DPI 預覽；或僅顯示頁數/檔案資訊
  - `Toolbar.vue`：模式切換（轉圖 / 合併 / 拆分）
  - `ExportDialog.vue`：輸出參數（DPI、格式、品質、頁碼範圍、ZIP、命名模板）
  - `TaskProgress.vue`：顯示 `pdf:progress` 事件、可取消（後續）
- 呼叫範例（概念）：
  - `invoke('merge_pdfs', { paths, output_path })`
  - `invoke('split_pdf', { input_path, ranges, output_dir, naming })`
  - `invoke('convert_pdf_to_images', { input_path, output_dir, ... })`
- 檔案權限：
  - 透過 `dialog.open()` 取得來源與輸出資料夾，避免硬編碼路徑。
  - `capabilities/default.json` 開啟必要的 FS 讀/寫範圍（或使用 `scope` 指定最小權限）。

### 通用輸入元件規格
1) RangeInput（頁碼字串）
- 目的：將輸入字串解析為有效頁序列，供轉換/合併/拆分。
- 規則：1-based；允許空白；支援 `1-3,5,8-`（開放結尾＝直到最後一頁）；空字串或 `all` 代表全部；自動裁切到 `[1, pageCount]`，去重並遞增排序；無效輸入標紅與提示。
- 介面：`v-model`（string）、`pageCount?`、`strict?=false`、`disabled?`；emits：`update:modelValue`、`valid(number[])`、`invalid(message)`。

2) NamingInput（命名模板）
- 目的：定義輸出檔名規則（圖片批轉與 PDF 拆分）。
- 佔位符：`{filename}`、`{index}`、`{timestamp}`、`{date}`、`{time}`、影像：`{page}`、`{total}`、`{dpi}`、`{ext}`；拆分：`{range}`、`{ext}`；支援補零 `{page:3}`/`{index:2}`。
- 規則：未含 `{ext}` 則自動補上副檔名；未知 `{...}` 視為錯誤並提示建議。
- 預設：轉換 `"{filename}-{page:3}-{dpi}.{ext}"`；拆分 `"{filename}-part{index}.{ext}"`。
- 介面：`v-model:template`、`mode: 'convert' | 'split'`、`sampleContext`（即時示例）。

3) TaskProgress（進度列）
- 目的：統一顯示長任務進度與狀態，支援取消。
- 模式：determinate（`current/total`、百分比）與 indeterminate（跑馬燈）。
- 介面：`current`, `total`, `label?`, `status?: 'idle'|'running'|'success'|'error'`, `cancellable?`；emits：`cancel`。

### ConvertMode（批次轉換）規範
- 版型：僅表單選項；不設上方控制列；不做預覽。
- 表單項目：
  - 格式：`PNG | JPEG`
  - DPI：數值（預設 150，範圍 72–300），動態提示體積影響
  - JPEG 品質：僅在 JPEG 顯示（0–100，預設 85）
  - 頁碼範圍：`<RangeInput>`（可空＝全部）
  - 是否打包 ZIP：勾選（預設開）
  - 輸出資料夾：`dialog.open({ directory: true })`
  - 命名模板：`<NamingInput mode="convert">`
  - 提交按鈕：開始轉換（執行期間禁用表單，顯示 `<TaskProgress>`）
- 行為：使用左側清單被勾選或全選之 PDF；統一輸出至指定資料夾；完成後可「開啟輸出資料夾」。
- 驗證：必填輸出資料夾；DPI 範圍；JPEG 時品質必填；頁碼解析為空則阻止提交並高亮錯誤。

## 效能與記憶體策略
- DPI 建議：預設 150；>250 顯示體積與時間提示。
- 批次處理：
  - 渲染：每批 N 頁（例如 16–32），完成即寫出或加入 ZIP，釋放記憶體。
  - 合併/拆分：逐份輸入逐段輸出，避免一次性載入過多頁面。
- ZIP 串流：以 `zip::ZipWriter` 流式寫入；避免將所有圖片保存在記憶體後才打包。
- 中斷/取消：後續以共享旗標或 channel 控制；前端 UI 提供取消按鈕。

## 錯誤處理
- 明確的錯誤分類：輸入不存在/無法讀取、輸出目錄不可寫、頁碼範圍無效、PDF 受保護、PDFium 初始化失敗。
- 友善訊息：Rust 端 map 至結構化錯誤碼與訊息；前端根據錯誤碼顯示解決建議。
- 日誌：開發模式輸出 debug 日誌；正式版保留最小必要訊息。

## 測試與驗證
- 單元測試：
  - `ranges.rs` 頁碼字串解析（邊界案例、遞增/遞減、溢出）
  - `naming.rs` 命名模板替換
- 手動驗證：
  - 小檔（<20 頁）與大檔（>500 頁）各一
  - 不同比例圖片輸出、ZIP 內容檢查
  - 合併後 metadata/書籤保留策略（若需要保留，需另行處理）

## 里程碑
1. M1：打通 PDFium（自動預編譯）與基本 commands：`pdf_info`、`merge_pdfs`、`split_pdf`、`convert_pdf_to_images`（單頁/少量頁）。
2. M2：ZIP 串流、多頁批次策略、進度事件與前端進度 UI。
3. M3：頁碼字串解析、命名模板、錯誤分類與友善提示。
4. M4：效能優化（批次大小、並行策略）、取消機制。
5. M5：頁面旋轉/刪除、浮水印、更多 metadata 策略。

## 後續注意
- 書籤/大綱、表單欄位與註記在合併/拆分時的處理行為需確認需求（PDFium 能存取但處理較繁）。
- 若要長期維護可考慮把 PDF 任務邏輯做成獨立 Rust crate，app 僅包裝 commands。
- 若未來要改成系統 PDFium 或自建 PDFium，請留意 CI/CD 產物大小與法規授權條款（PDFium 授權為 BSD-style）。

---

附註：本文件描述的是設計與實作方向；實際程式碼將依 `pdfium-render` 版本提供的 API 做微調（特別是 PDFium 綁定初始化方式）。
