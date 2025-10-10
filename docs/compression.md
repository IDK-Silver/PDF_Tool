# Compression Design

本文件彙整 PDF/影像壓縮的重點，並規劃本專案的實作方向。作為 `docs/design.md` 的延伸，聚焦「JPEG/Flate 重編碼 + 物件/串流最佳化」的落地與 API 介面。

## 目標

- 優先「智慧壓縮」：保留 PDF 的文字與向量內容，只針對內嵌影像進行「下採樣 + JPEG/Flate 重編碼」，並做結構優化（streams/object streams/去冗）。
- 圖片檔案支援重新編碼與尺寸降採樣，移除中繼資料。

## 核心要點（摘要）

- PDF 是容器：包含文字、向量、影像等不同型態資料；壓縮應對症下藥。
- 影像是主要體積來源：彩色/灰階採 JPEG 有損壓縮，下採樣能顯著減量；線稿/低色數採 Flate（無損）。
- 文字/結構採無損壓縮：Flate(Deflate) 為主，結構層面使用 object streams、壓縮 xref、去冗、字型子集化。
- 工具與範式（參考）：Acrobat、Ghostscript 等。本文檔聚焦純 Rust 落地，不依賴外部 CLI。

## 本專案策略

### PDF 智慧壓縮（v1 範圍）

流程（每頁）：
- 掃描頁面物件，統計文字/向量/影像比例；列出影像 XObject。
- 對每個影像計算「有效 DPI」（影像像素與頁面放置尺寸推得），高於門檻則下採樣。
- 依型態選擇編碼（v1）：
  - DCTDecode 彩色/灰階：解碼後依有效 DPI 判斷是否縮放，再以指定品質重新 JPEG 編碼。
  - 單純 FlateDecode（DeviceRGB / DeviceGray、8-bit、可含 PNG Predictor）：解壓並還原像素緩衝後轉成 JPEG，僅處理非遮罩、1 或 3 通道影像。
  - 線稿/圖示/低色數：保留 Flate（無損）。
  - 二值黑白掃描（CCITT G4）與 JPEG2000/JBIG2/JPX 等進階編碼不在 v1 範圍。
- 替換影像資料流（維持同一影像物件之寬高/顏色空間/遮罩設定）。
- 限制（v1）：僅支援 BitsPerComponent=8、無 alpha 的 DeviceGray/DeviceRGB/簡單 ICC；遇到 Mask/特殊濾鏡時跳過不重編碼。
- 完成後執行無損結構最佳化：
  - 重新壓縮所有 streams（Flate）。
  - 啟用/產生 object streams 與壓縮 xref（PDF 1.5+）。
  - 去除冗餘物件/重複影像去重、清除 metadata。

採用套件（已定）：
- 解析 / 重寫：`lopdf`（讀取 PDF、就地修改物件與 stream 字典）
- 影像：`image`（JPEG/PNG 編碼）、`flate2`（Flate 解壓與 Predictor 處理）、`webp`（圖片壓縮指令）
（不依賴外部 qpdf；未來若需要 linearization 再另行規劃。）

### 3) 圖片壓縮

- 重新編碼：preserve/jpeg/webp/png；品質可調。
- 尺寸限制：maxWidth/maxHeight；採樣器使用 Lanczos3（或 Triangle 兼顧速度）。
- 中繼資料：可選擇移除 EXIF 等 metadata。

## 預設建議（Profiles）

- 螢幕（Screen）：目標有效 DPI ≈ 120；JPEG 品質 75–82；結構最佳化開啟、移除 metadata。
- 電子書（eBook）：目標有效 DPI ≈ 150；JPEG 品質 82；結構最佳化開啟、移除 metadata。
- 列印（Printer）：目標有效 DPI ≈ 200–300；JPEG 品質 88–90；結構最佳化開啟、可保留 metadata。

## API 規劃（前瞻）

後端 Tauri Commands（命名示意）：
- `compress_pdf_smart(src_path, dest_path?, opts)` → `{ path, beforeSize, afterSize, pages, changedImages }`（v1 僅 JPEG/Flate + 結構最佳化）
- `compress_image(src_path, dest_path?, opts)` → 單圖像壓縮（已完成）

前端 Service：
- 與現有 `src/modules/compress/settings.ts` 對齊，提供預覽與任務執行；UI 顯示「Smart / Lossless」要點，不提供 Fallback（光柵化）。

## 分階段落地

1. UI 調整：
   - PDF 面板僅保留：DPI 規則（統一/條件 + 目標/門檻）、格式（JPEG/保留）、品質、結構最佳化、移除 metadata。
2. 後端 v1：
   - 完成圖片壓縮 command；
   - PDF 智慧壓縮基礎版：鎖定彩色/灰階影像的重編碼與下採樣（以 `pdf` 操作，並以 `pdf-writer` 重建結構）。
3. 後端 v2：
   - 黑白 CCITT G4（可選）、圖片去重、字型子集化/清理。
4. 偵測與預估：
   - 加入快速「大小預估」：抽樣頁面影像做試編碼推估總大小；
   - 掃描型內容偵測：僅用於選擇黑白壓縮策略（CCITT）與參數提示，不進行整頁光柵化。

## 限制與風險

- PDF 重寫需要穩健的低階處理，需選擇成熟的 Rust crate 或引入外部工具配合。
- JBIG2 有損模式存在錯字風險；預設僅提供無損或 CCITT G4。
 
