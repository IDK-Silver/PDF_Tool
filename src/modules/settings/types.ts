// 精簡版 Settings（v2）- 移除過度設計的參數

export interface SettingsState {
  // === 語言 ===
  language: 'system' | 'zh-TW' | 'en'

  // === 外觀 ===
  theme: 'system' | 'light' | 'dark'
  invertColorsInDarkMode: boolean  // 暗色模式下反轉 PDF/圖片顏色

  // === 檔案操作 ===
  deleteBehavior: 'saveAsNew' | 'overwrite'

  // === 插入空白頁預設 ===
  insertPaper: 'CurrentPage' | 'A4' | 'Letter' | 'A5' | 'Legal' | 'Tabloid' | 'Custom'
  insertOrientation: 'portrait' | 'landscape'
  insertCustomWidthMm: number
  insertCustomHeightMm: number

  // === 渲染品質 ===
  pdfRenderDpi: number                   // PDF 檢視渲染 DPI

  // === 效能控制 ===
  maxConcurrentRenders: number      // 最大並行渲染數

  // === 開發工具 ===
  devPerfOverlay: boolean

  // === 文字層 ===
  enableTextExtraction: boolean          // 是否啟用文字讀取（關閉可提升效能）
  textLayerOverlapThreshold: number      // 重疊檢測閾值（負值表示需要調整的重疊量）
  textLayerMinSpacing: number            // 重疊時的最小間距（像素）
  textLayerSmallGapThreshold: number     // 小間距檢測閾值
  textLayerSmallGapSpacing: number       // 小間距時的調整值
  textLayerGlobalOffsetX: number         // 全局水平偏移（像素，正值向右）
  textLayerGlobalOffsetY: number         // 全局垂直偏移（像素，正值向下）
  textLayerRange: number                 // 文字層渲染範圍（中心頁面 ± N 頁）

  // === DOM 虛擬化 ===
  structureOverscan: number              // 頁面結構渲染範圍（視野外 ± N 頁仍保留 DOM 結構）

  // === 縮放互動 ===
  zoomMaxPercent: number                // PDF/圖片共用的最大縮放百分比
  zoomSensitivity: number                // 滾輪縮放敏感度（建議 0.002–0.006，預設 0.0045）

  // === 更新 ===
  checkUpdateOnStartup: boolean          // 啟動時自動檢查更新
}

export const defaultSettings: SettingsState = {
  // 語言
  language: 'system',

  // 外觀
  theme: 'system',
  invertColorsInDarkMode: true,

  // 檔案操作
  deleteBehavior: 'saveAsNew',

  // 插入空白頁預設
  insertPaper: 'CurrentPage',
  insertOrientation: 'portrait',
  insertCustomWidthMm: 210,
  insertCustomHeightMm: 297,

  // 渲染品質
  pdfRenderDpi: 144,          // A3: 96dpi=1.78M pixels, 144dpi=4M pixels

  // 效能控制
  maxConcurrentRenders: 4,    // 激進降至 2（大檔案單頁 500ms）

  // 開發工具
  devPerfOverlay: false,

  // 文字層
  enableTextExtraction: true,         // 預設：啟用文字讀取
  textLayerOverlapThreshold: 0.0,     // 預設：完全重疊才調整
  textLayerMinSpacing: 1.0,           // 預設：1 像素最小間距
  textLayerSmallGapThreshold: 0.5,    // 預設：0.5 像素以下視為間距太小
  textLayerSmallGapSpacing: 0.5,      // 預設：小間距調整為 0.5 像素
  textLayerGlobalOffsetX: 0,          // 預設：無全局水平偏移
  textLayerGlobalOffsetY: 0,          // 預設：無全局垂直偏移
  textLayerRange: 1,                  // 預設：中心頁面 ± 1 頁

  // DOM 虛擬化
  structureOverscan: 10,              // 預設：視野外 ± 10 頁保留 DOM 結構

  // 縮放互動
  zoomMaxPercent: 400,                // 預設最大縮放 400%，適用於 PDF 與圖片
  zoomSensitivity: 0.0045,            // 預設：0.0045（較快的滾輪縮放）

  // 更新
  checkUpdateOnStartup: true,         // 預設：啟動時自動檢查更新
}
