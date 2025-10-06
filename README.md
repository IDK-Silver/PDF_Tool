Kano PDF Tool — 開發與使用說明

目的：快速啟動專案並說明 PDFium 動態庫的放置與自動下載流程。架構與 API 詳見 `docs/media_view.md:1`。

使用前提
- Node.js 18+、npm 9+（或等效）
- Rust 工具鏈與 Tauri 2（打包需要 Xcode/VS Build Tools/GTK 依平台而定）

安裝與啟動
- 安裝：`npm install`
- 網頁開發（僅前端）：`npm run dev`
- 桌面開發（Tauri）：`npm run tauri dev`

打包
- 直接打包：`npm run tauri build`
- 若啟用 PDFium 自動下載（見下方）建議：`npm run build && npm run pdfium:fetch && npm run tauri build`

PDFium 動態庫放置位置（必要）
- 資源根目錄：`src-tauri/resources/pdfium/<target-triple>/`
  - macOS (Apple Silicon)：`aarch64-apple-darwin/libpdfium.dylib`
  - macOS (Intel)：`x86_64-apple-darwin/libpdfium.dylib`
  - Windows (x64)：`x86_64-pc-windows-msvc/pdfium.dll`
  - Linux (x64)：`x86_64-unknown-linux-gnu/libpdfium.so`
- 將整個資料夾加入打包資源（Tauri v2）：在 `src-tauri/tauri.conf.json:1` 的 `bundle` 區段新增：
  
  ```json
  {
    "bundle": {
      "active": true,
      "targets": "all",
      "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
      "resources": [
        "resources/pdfium/**"
      ]
    }
  }
  ```

自動下載 PDFium（選用，建議）
- 目標：用 npm 指令抓取指定版本 PDFium 並放入 `src-tauri/resources/pdfium/`，供打包時動態連結。
- 建議新增腳本（已內建示例，可依需求調整）：
  - `package.json:1` scripts 增加：
    - `"pdfium:fetch": "node scripts/fetch-pdfium.mjs --version chromium/7442 --dest src-tauri/resources/pdfium --targets auto"`
  - 建立 `scripts/fetch-pdfium.mjs`：
    - 依 `--version` 與 `--targets`（`auto` 僅下載本機平台）決定來源 URL → 下載 → 解壓 → 整理為上述路徑與檔名
    - 也可使用環境變數 `PDFIUM_VERSION`（等同 `--version`），或指定 `latest` 自動抓取最新 tag。
    - CI 可指定多個 target，例如：
      - `npm run pdfium:fetch -- --version chromium/7442 --targets "aarch64-apple-darwin,x86_64-apple-darwin,x86_64-unknown-linux-gnu,x86_64-pc-windows-msvc"`
      - `PDFIUM_VERSION=latest npm run pdfium:fetch -- --targets auto`

注意事項
- 依 `docs/media_view.md:261`，PDF 解析採 `pdfium-render`，需於 Rust 端以路徑動態載入 PDFium。請確保執行檔於 runtime 能找到上述資源檔。
- 若動態庫來源包含額外資源（如 `icudtl.dat`），請一併放入對應 `<target-triple>` 目錄並打包。
- 目前 `src-tauri/tauri.conf.json:1` 未預設 `resources`，需按上方說明調整。

相關檔案
- 設計與流程：`docs/media_view.md:1`
- Tauri 設定：`src-tauri/tauri.conf.json:1`
- 後端入口：`src-tauri/src/lib.rs:1`
- MediaView 元件：`src/components/MediaView/MediaView.vue:1`
