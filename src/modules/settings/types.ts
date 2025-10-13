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
  zoomDebounceMs: number                 // 縮放停止後重渲染延遲

  // === 效能控制 ===
  maxConcurrentRenders: number      // 最大並行渲染數
  highResOverscan: number           // 高清預載範圍（向上下預載的頁數，預設 2）
  rawHighResCacheSize: number       // Raw 高清快取上限（激進模式用，預設 10）

  // === 編碼品質 ===
  jpegQuality: number               // 1-100
  pngCompression: 'fast' | 'balanced' | 'best'

  // === 開發工具 ===
  devPerfOverlay: boolean
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
  zoomDebounceMs: 10,

  // 效能控制
  maxConcurrentRenders: 4,    // 激進降至 2（大檔案單頁 500ms）
  highResOverscan: 4,         // 高清預載範圍（向上下預載 2 頁）
  rawHighResCacheSize: 10,    // Raw 模式快取（10 頁約 30-120MB）

  // 編碼品質
  jpegQuality: 85,
  pngCompression: 'balanced',

  // 開發工具
  devPerfOverlay: false,
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
    zoomDebounceMs: old.highQualityDelayMs ?? defaultSettings.zoomDebounceMs,
    
    maxConcurrentRenders: old.maxConcurrentRenders ?? defaultSettings.maxConcurrentRenders,
    highResOverscan: old.highResOverscan ?? old.highRadius ?? old.preloadRange ?? defaultSettings.highResOverscan,
    rawHighResCacheSize: old.rawHighResCacheSize ?? defaultSettings.rawHighResCacheSize,
    
    jpegQuality: old.jpegQuality ?? defaultSettings.jpegQuality,
    pngCompression: old.pngFast ? 'fast' : 'balanced',
    
    devPerfOverlay: old.devPerfOverlay ?? defaultSettings.devPerfOverlay,
  }
}
