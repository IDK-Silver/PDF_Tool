# Compression Design

本文件彙整 PDF/影像壓縮的重點，並規劃本專案的實作方向。作為 `docs/design.md` 的延伸，聚焦壓縮策略、分階段落地與 API 介面。

## 目標

- 優先「智慧壓縮」：保留 PDF 的文字與向量內容，只針對內嵌影像重壓縮與下採樣，並做結構優化（streams/object streams/去冗）。
- 圖片檔案支援重新編碼與尺寸降採樣，移除中繼資料。

## 核心要點（摘要）

- PDF 是容器：包含文字、向量、影像等不同型態資料；壓縮應對症下藥。
- 影像是主要體積來源：彩色用 JPEG/JPEG2000/WebP 有損壓縮，下採樣能顯著減量；黑白掃描適合 JBIG2/CCITT G4。
- 文字/結構採無損壓縮：Flate(Deflate) 為主，結構層面使用 object streams、壓縮 xref、去冗、字型子集化。
- 工具與範式：Acrobat（完整調參）、Ghostscript（自動下採樣+重壓縮）、qpdf（無損結構最佳化）。

## 本專案策略

### PDF 智慧壓縮（唯一路線）

流程（每頁）：
- 掃描頁面物件，統計文字/向量/影像比例；列出影像 XObject。
- 對每個影像計算「有效 DPI」（影像像素與頁面放置尺寸推得），高於門檻則下採樣。
- 依型態選擇編碼：
  - 彩色/灰階照片：JPEG 或 WebP（品質可調）。
  - 二值黑白掃描：優先 CCITT G4（無損）；未來視情況導入 JBIG2 選項。
  - 線稿/圖示：保留 Flate（無損）。
- 替換影像資料流（維持同一影像物件之寬高/顏色空間/遮罩設定）。
- 完成後執行無損結構最佳化：
  - 重新壓縮所有 streams（Flate）。
  - 啟用/產生 object streams 與壓縮 xref（PDF 1.5+）。
  - 去除冗餘物件/重複影像去重、清除 metadata。

落地選項：
- 首選內建：以 Rust 解析/重寫 PDF（需要低階 PDF 操作能力；可評估 `lopdf`/`pdf` crate）。
- 輔助工具：若偵測到系統可用 `qpdf`，可在最後一步呼叫以做結構最佳化。

### 3) 圖片壓縮

- 重新編碼：preserve/jpeg/webp/png；品質可調。
- 尺寸限制：maxWidth/maxHeight；採樣器使用 Lanczos3（或 Triangle 兼顧速度）。
- 中繼資料：可選擇移除 EXIF 等 metadata。

## 預設方案（Profiles）

- 螢幕（Screen）：
  - 圖片目標有效 DPI ≈ 120；JPEG/WebP 品質 75–82。
  - 結構最佳化：開啟；移除 metadata。
- 電子書（eBook）：
  - 圖片目標有效 DPI ≈ 150；品質 82。
  - 結構最佳化：開啟；移除 metadata。
- 列印（Printer）：
  - 圖片目標有效 DPI ≈ 200–300；品質 88–90。
  - 結構最佳化：開啟；保留 metadata（可選）。

## API 規劃（前瞻）

後端 Tauri Commands（命名示意）：
- `compress_pdf_smart(src_path, dest_path?, opts)` → `{ path, beforeSize, afterSize, pages, changedImages }`
  - opts：`profile` 或細項（目標有效 DPI、jpeg/webp 品質、是否移除 metadata、是否啟用 qpdf）
- `compress_pdf_lossless(src_path, dest_path?, opts)` → 無損結構最佳化（streams + object streams + 去冗）
- `compress_image(src_path, dest_path?, opts)` → 單圖像壓縮（現有 UI 已覆蓋）

前端 Service：
- 與現有 `src/modules/compress/settings.ts` 對齊，提供預覽與任務執行；UI 顯示「Smart / Lossless」要點，不提供 Fallback（光柵化）。

## 分階段落地

1. UI 調整：
   - PDF 面板聚焦「智慧壓縮」與「無損結構最佳化」，移除 Fallback（光柵化）相關設定與文案。
2. 後端 v1：
   - 先完成圖片壓縮 command；
   - PDF 無損結構最佳化：若可用 `qpdf`，先串起（可選）；
   - PDF 智慧壓縮基礎版：鎖定彩色/灰階影像的重編碼與下採樣（以 `lopdf`/`pdf` 操作 streams）。
3. 後端 v2：
   - 黑白掃描圖片導入 CCITT G4；評估 JBIG2（授權/整合風險另案）。
   - 圖像去重、字型子集化/清理（若非編輯器產生）。
4. 偵測與預估：
   - 加入快速「大小預估」：抽樣頁面影像做試編碼推估總大小；
   - 掃描型內容偵測：僅用於選擇黑白壓縮策略（CCITT）與參數提示，不進行整頁光柵化。

## 限制與風險

- PDF 重寫需要穩健的低階處理，需選擇成熟的 Rust crate 或引入外部工具配合。
- JBIG2 有損模式存在錯字風險；預設僅提供無損或 CCITT G4。
 
