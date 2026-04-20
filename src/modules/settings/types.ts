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
  // 高清渲染（精細品質）
  renderFormat: 'png' | 'jpeg' | 'webp' | 'raw'  // 統一格式（包含 Raw）
  highResDpiCap: number                  // 高清渲染 DPI 上限（fit 模式用，防卡頓）
  dprCap: number                          // DPR 上限（避免超高清輸出）
  maxOutputWidth: number                  // 最大輸出寬度（px）
  actualModeDpiCap: number               // 實際大小模式 DPI 上限

  // === 互動延遲（可調）===
  zoomRerenderDelayMs: number           // 縮放後觸發高清重渲染延遲
  hiResRerenderDelayMs: number          // 預設高清重渲染延遲（未特別指定時）
  scrollEndDebounceMs: number           // 偵測捲動結束的延遲

  // === 效能控制 ===
  maxConcurrentRenders: number      // 最大並行渲染數
  highResOverscan: number           // 高清預載範圍（向上下預載的頁數，預設 2）
  rawHighResCacheSize: number       // Raw 高清快取上限（激進模式用，預設 10）

  // === 編碼品質 ===
  jpegQuality: number               // 1-100
  pngCompression: 'fast' | 'balanced' | 'best'

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

  // === 工作台 ===
  workspaceCaptureBaseWidthPx: number   // 工作台擷取時，較大圖片的最小輸出寬度

  // === 更新 ===
  checkUpdateOnStartup: boolean          // 啟動時自動檢查更新
}

export const WORKSPACE_CAPTURE_BASE_WIDTH_MIN_PX = 400
export const WORKSPACE_CAPTURE_BASE_WIDTH_MAX_PX = 4000
export const WORKSPACE_CAPTURE_BASE_WIDTH_DEFAULT_PX = 1200

export function clampWorkspaceCaptureBaseWidthPx(value: number): number {
  const fallback = Number.isFinite(value) ? Math.round(value) : WORKSPACE_CAPTURE_BASE_WIDTH_DEFAULT_PX
  return Math.min(
    WORKSPACE_CAPTURE_BASE_WIDTH_MAX_PX,
    Math.max(WORKSPACE_CAPTURE_BASE_WIDTH_MIN_PX, fallback),
  )
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
  // 高清渲染
  renderFormat: 'raw',
  highResDpiCap: 144,          // 高清 DPI 上限（A3: 96dpi=1.78M像素=300ms，144dpi=4M像素=700ms）
  dprCap: 1.5,
  maxOutputWidth: 1200,
  actualModeDpiCap: 144,

  // 互動延遲（實務預設）
  zoomRerenderDelayMs: 150,
  hiResRerenderDelayMs: 300,
  scrollEndDebounceMs: 500,

  // 效能控制
  maxConcurrentRenders: 4,    // 激進降至 2（大檔案單頁 500ms）
  highResOverscan: 4,         // 高清預載範圍（向上下預載 2 頁）
  rawHighResCacheSize: 10,    // Raw 模式快取（10 頁約 30-120MB）

  // 編碼品質
  jpegQuality: 85,
  pngCompression: 'balanced',

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

  // 工作台
  workspaceCaptureBaseWidthPx: WORKSPACE_CAPTURE_BASE_WIDTH_DEFAULT_PX,

  // 更新
  checkUpdateOnStartup: true,         // 預設：啟動時自動檢查更新
}
