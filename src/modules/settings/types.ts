// 精簡版 Settings（v2）- 移除過度設計的參數

export interface SettingsState {
  // === 外觀 ===
  theme: 'light' | 'dark'
  invertColorsInDarkMode: boolean  // 暗色模式下反轉 PDF/圖片顏色

  // === 檔案操作 ===
  deleteBehavior: 'saveAsNew' | 'overwrite'

  // === 插入空白頁預設 ===
  insertPaper: 'A4' | 'Letter' | 'A5' | 'Legal' | 'Tabloid' | 'Custom'
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
  hideTextLayerWhileInteracting: boolean // 互動時隱藏文字層（false=保持顯示，推薦）
  textLayerRerenderDelayMs: number       // 互動結束後延遲顯示文字層（ms，僅在隱藏模式生效）
  textLayerOverlapThreshold: number      // 重疊檢測閾值（負值表示需要調整的重疊量）
  textLayerMinSpacing: number            // 重疊時的最小間距（像素）
  textLayerSmallGapThreshold: number     // 小間距檢測閾值
  textLayerSmallGapSpacing: number       // 小間距時的調整值
  textLayerGlobalOffsetX: number         // 全局水平偏移（像素，正值向右）
  textLayerGlobalOffsetY: number         // 全局垂直偏移（像素，正值向下）
}

export const defaultSettings: SettingsState = {
  // 外觀
  theme: 'light',
  invertColorsInDarkMode: true,

  // 檔案操作
  deleteBehavior: 'saveAsNew',

  // 插入空白頁預設
  insertPaper: 'A4',
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
  hideTextLayerWhileInteracting: false, // 預設：false（互動時保持顯示，性能已優化）
  textLayerRerenderDelayMs: 0,        // 預設：0ms（立即顯示）
  textLayerOverlapThreshold: 0.0,     // 預設：完全重疊才調整
  textLayerMinSpacing: 1.0,           // 預設：1 像素最小間距
  textLayerSmallGapThreshold: 0.5,    // 預設：0.5 像素以下視為間距太小
  textLayerSmallGapSpacing: 0.5,      // 預設：小間距調整為 0.5 像素
  textLayerGlobalOffsetX: 0,          // 預設：無全局水平偏移
  textLayerGlobalOffsetY: 0,          // 預設：無全局垂直偏移
}

// 舊版參數映射（用於遷移）
export function migrateFromV1(old: any): SettingsState {
  return {
    theme: old.theme ?? defaultSettings.theme,
    invertColorsInDarkMode: old.invertColorsInDarkMode ?? defaultSettings.invertColorsInDarkMode,
    deleteBehavior: old.deleteBehavior ?? defaultSettings.deleteBehavior,
    
    insertPaper: old.insertPaper ?? defaultSettings.insertPaper,
    insertOrientation: old.insertOrientation ?? defaultSettings.insertOrientation,
    insertCustomWidthMm: old.insertCustomWidthMm ?? defaultSettings.insertCustomWidthMm,
    insertCustomHeightMm: old.insertCustomHeightMm ?? defaultSettings.insertCustomHeightMm,
    
    // 高清渲染
    renderFormat: old.useRawForHighRes ? 'raw' : (old.highQualityFormat ?? defaultSettings.renderFormat),
    highResDpiCap: old.highResDpiCap ?? defaultSettings.highResDpiCap,
    dprCap: old.dprCap ?? defaultSettings.dprCap,
    maxOutputWidth: old.maxTargetWidth ?? defaultSettings.maxOutputWidth,
    actualModeDpiCap: old.actualDpiCap ?? defaultSettings.actualModeDpiCap,
    // 新字段：若舊版有 highQualityDelayMs，可映射為 hiResRerenderDelayMs
    zoomRerenderDelayMs: defaultSettings.zoomRerenderDelayMs,
    hiResRerenderDelayMs: old.highQualityDelayMs ?? defaultSettings.hiResRerenderDelayMs,
    scrollEndDebounceMs: defaultSettings.scrollEndDebounceMs,
    
    maxConcurrentRenders: old.maxConcurrentRenders ?? defaultSettings.maxConcurrentRenders,
    highResOverscan: old.highResOverscan ?? old.highRadius ?? old.preloadRange ?? defaultSettings.highResOverscan,
    rawHighResCacheSize: old.rawHighResCacheSize ?? defaultSettings.rawHighResCacheSize,
    
    jpegQuality: old.jpegQuality ?? defaultSettings.jpegQuality,
    pngCompression: old.pngFast ? 'fast' : 'balanced',

    devPerfOverlay: old.devPerfOverlay ?? defaultSettings.devPerfOverlay,

    // 文字層（新參數，使用預設值）
    enableTextExtraction: old.enableTextExtraction ?? defaultSettings.enableTextExtraction,
    hideTextLayerWhileInteracting: old.hideTextLayerWhileInteracting ?? defaultSettings.hideTextLayerWhileInteracting,
    textLayerRerenderDelayMs: old.textLayerRerenderDelayMs ?? defaultSettings.textLayerRerenderDelayMs,
    textLayerOverlapThreshold: old.textLayerOverlapThreshold ?? defaultSettings.textLayerOverlapThreshold,
    textLayerMinSpacing: old.textLayerMinSpacing ?? defaultSettings.textLayerMinSpacing,
    textLayerSmallGapThreshold: old.textLayerSmallGapThreshold ?? defaultSettings.textLayerSmallGapThreshold,
    textLayerSmallGapSpacing: old.textLayerSmallGapSpacing ?? defaultSettings.textLayerSmallGapSpacing,
    textLayerGlobalOffsetX: old.textLayerGlobalOffsetX ?? defaultSettings.textLayerGlobalOffsetX,
    textLayerGlobalOffsetY: old.textLayerGlobalOffsetY ?? defaultSettings.textLayerGlobalOffsetY,
  }
}
