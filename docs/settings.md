# 設定頁與參數說明

本頁說明 `src/components/Settings/SettingsView.vue` 之設定項目，包含用途、建議預設與影響範圍。

## 渲染策略（Rendering）
- 輸出格式（`highQualityFormat`: `png` | `jpeg`）
  - 用途：單階段輸出格式。文字/向量頁常用 `png`；掃描影像可用 `jpeg`（較快）。
  - 建議：`png`。

- DPR 上限（`dprCap`: number）
  - 用途：限制裝置像素比對目標寬度的放大倍率，避免超高解析度渲染造成延遲。
  - 建議：`2.0`。

## 目標寬度（Width Policy）
- 目標寬度策略（`targetWidthPolicy`: `container` | `scale`）
  - 用途：決定渲染寬度的來源：容器寬度，或基準寬 × 倍率。
  - 建議：`container`。

- 基準寬（`baseWidth`: px）
  - 用途：當策略為 `scale` 時的基礎寬度。
  - 建議：`1200`。

## 效能（Performance）
- 最大並行渲染（`maxConcurrentRenders`）
  - 用途：同時進行的頁面渲染數量上限，避免 CPU 滿載與卡頓。
  - 建議：`2`～`4`。

- 預抓距離（`prefetchPx`: px）
  - 用途：可視區域上下預抓距離，越大越早開始渲染。
  - 建議：`800`。

## 編碼品質（Encoding）
- JPEG 品質（`jpegQuality`: 1–100）
  - 用途：JPEG 壓縮品質。數值越高越清晰、檔案越大。
  - 建議：`80`～`85`。

- PNG 快速壓縮（`pngFast`: boolean）
  - 用途：開啟時採用較快的壓縮（檔較大）；關閉則較慢但檔更小。
  - 建議：`true`（開啟）。

## 除錯與輔助（Debug）
- 顯示效能浮層（`devPerfOverlay`）
  - 用途：右下角顯示 inflight/queued 渲染指標，方便觀察效能。
  - 建議：僅在調整參數時使用。

## 後端渲染 API 關聯
- `pdf_open(path) -> { docId, pages }`
  - 說明：在單一 Worker 執行緒中開啟並長駐 PdfDocument，回傳 docId。
- `pdf_render_page({ docId, pageIndex, targetWidth?|scale|dpi, rotateDeg?, format?, quality? }) -> bytes`
  - 說明：直接在 Worker 中用長駐的 PdfDocument 渲染該頁；`quality` 支援 PNG/JPEG（PNG 以數值門檻切換 fast/default）。
- `pdf_close(docId)`
  - 說明：釋放指定 docId 的 PdfDocument。

## 建議使用流程
1. 使用 `/settings` 調整輸出格式、DPR 上限與效能參數。
2. 於媒體頁開啟 PDF 時呼叫 `pdf_open` 取得 `docId`。
3. 懶載入可視頁面：直接渲染單階段高品質（`highQualityFormat`/`jpegQuality` 或 `pngFast`）。
4. 未使用之文件呼叫 `pdf_close`，保持記憶體健康。
