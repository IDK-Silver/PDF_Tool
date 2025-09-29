# Kano PDF

桌面版 PDF/圖片檢視工具，使用 Tauri + Vue 3 開發。提供快速開啟、瀏覽、基本匯出，以及對常見圖片格式的閱讀支援。專案目標是穩定、可擴充，而非包辦所有編修功能。

## 功能概覽

- PDF 檢視
  - 縮放：實際大小、填滿寬度（Fit）、自訂比例
  - 頁面導覽：上一頁/下一頁、直接輸入頁碼
  - 右鍵選單：
    - 開啟於資料夾
    - 匯出本頁為圖片（PNG 或 JPEG，依設定）
    - 匯出本頁為 PDF（僅單頁）
  - 記住每個檔案的最後閱讀頁
- 圖片檢視（View 模式）
  - 支援 PNG / JPG / JPEG / GIF / BMP / WebP / TIFF / TIF / SVG
  - 與 PDF 一致的縮放控制（1:1 與填滿寬度）
  - 自動置中：小圖置中，大圖可捲動
  - 右鍵選單：
    - 開啟於資料夾
    - 匯出本頁為圖片（PNG）
    - 匯出本頁為 PDF（單頁，頁面大小與圖片相同）
- 使用體驗
  - 拖放加入檔案
  - 單一實例（Windows 等）：後續開啟的檔案會送到已執行的視窗並帶到前景
  - 視窗大小與狀態持久化
  - 檔案清單顯示 PDF / 圖片不同的圖示

> 註：Convert / Compose 等模式目前以檢視與匯出為主，後續功能會逐步擴充。

## 安裝與執行

### 需求
- Node.js（建議 18+）
- Rust toolchain（stable）
- Tauri CLI（`npm i -g @tauri-apps/cli` 或使用本專案的 devDependency）

### 開發模式
```
npm install
npm run tauri dev
```

### 打包（產生安裝檔 / 應用程式）
```
npm run tauri build
```
產物位於 `src-tauri/target/release/bundle`。

## 開啟檔案的方式
- 直接拖放到視窗
- 以 OS 檔案關聯開啟（雙擊檔案或右鍵「以 Kano PDF 開啟」）
- 從命令列參數（開發中啟動時帶檔案路徑）

支援的副檔名：`pdf`, `png`, `jpg`, `jpeg`, `gif`, `bmp`, `webp`, `tiff`, `tif`, `svg`。

## 常用快捷鍵
- `Ctrl/⌘ +` 放大
- `Ctrl/⌘ -` 縮小
- `Ctrl/⌘ 0` 填滿寬度（Fit）

## 設定與持久化
- 應用狀態與設定存於 Tauri Store（JSON），包括：
  - 最後模式、檔案清單、作用中檔案
  - 視窗大小、左側欄寬度
  - PDF 導出格式（PNG/JPEG）、JPEG 品質、預設縮放模式
  - 每個檔案的最後閱讀頁

## 已知限制 / 注意事項
- macOS 的 Window/Help 系統選單項目在部分 Tauri 版本可能不完整，此為上游問題；本專案已採取保守處理，但仍可能與原生 App 行為略有差異。
- 圖片匯出 PDF 為單頁文件，頁面尺寸等同於圖片像素尺寸（未套邊距、未重排）。

## 專案結構（重點）
- `src/components/PdfViewer.vue`：PDF.js 驅動的 PDF 檢視器
- `src/components/ImageViewer.vue`：圖片檢視器，支援縮放、置中、右鍵事件
- `src/views/ViewMode.vue`：主檢視模式，統一控制縮放/頁碼/右鍵
- `src-tauri/src/lib.rs`：Tauri 入口，檔案開啟事件、單一實例、選單等
- `src-tauri/tauri.conf.json`：Tauri 設定、檔案關聯

## 授權
本倉庫未附帶授權宣告。若需發佈或二次開發，請先確認授權安排。

