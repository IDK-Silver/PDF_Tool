// 精簡版 Settings（v2）- 移除過度設計的參數

export interface SettingsState {
  // === 檔案操作 ===
  deleteBehavior: 'saveAsNew' | 'overwrite'

  // === 插入空白頁預設 ===
  insertPaper: 'A4' | 'Letter' | 'A5' | 'Legal' | 'Tabloid' | 'Custom'
  insertOrientation: 'portrait' | 'landscape'
  insertCustomWidthMm: number
  insertCustomHeightMm: number

  // === 渲染品質 ===
  renderFormat: 'png' | 'jpeg'      // 統一格式（移除 highQuality 前綴）
  dprCap: number                     // DPR 上限（避免超高清輸出）
  maxOutputWidth: number             // 最大輸出寬度（px）
  actualModeDpiCap: number          // 實際大小模式 DPI 上限
  zoomDebounceMs: number            // 縮放停止後重渲染延遲

  // === 效能控制 ===
  maxConcurrentRenders: number      // 最大並行渲染數
  visibleMarginPages: number        // 可見區上下預渲染頁數

  // === 編碼品質 ===
  jpegQuality: number               // 1-100
  pngCompression: 'fast' | 'balanced' | 'best'

  // === 開發工具 ===
  devPerfOverlay: boolean
}

export const defaultSettings: SettingsState = {
  // 檔案操作
  deleteBehavior: 'saveAsNew',

  // 插入空白頁預設
  insertPaper: 'A4',
  insertOrientation: 'portrait',
  insertCustomWidthMm: 210,
  insertCustomHeightMm: 297,

  // 渲染品質
  renderFormat: 'png',
  dprCap: 2.0,
  maxOutputWidth: 1920,
  actualModeDpiCap: 144,
  zoomDebounceMs: 180,

  // 效能控制
  maxConcurrentRenders: 3,
  visibleMarginPages: 2,

  // 編碼品質
  jpegQuality: 82,
  pngCompression: 'fast',

  // 開發工具
  devPerfOverlay: false,
}

// 舊版參數映射（用於遷移）
export function migrateFromV1(old: any): SettingsState {
  return {
    deleteBehavior: old.deleteBehavior ?? defaultSettings.deleteBehavior,
    
    insertPaper: old.insertPaper ?? defaultSettings.insertPaper,
    insertOrientation: old.insertOrientation ?? defaultSettings.insertOrientation,
    insertCustomWidthMm: old.insertCustomWidthMm ?? defaultSettings.insertCustomWidthMm,
    insertCustomHeightMm: old.insertCustomHeightMm ?? defaultSettings.insertCustomHeightMm,
    
    renderFormat: old.highQualityFormat ?? defaultSettings.renderFormat,
    dprCap: old.dprCap ?? defaultSettings.dprCap,
    maxOutputWidth: old.maxTargetWidth ?? defaultSettings.maxOutputWidth,
    actualModeDpiCap: old.actualDpiCap ?? defaultSettings.actualModeDpiCap,
    zoomDebounceMs: old.highQualityDelayMs ?? defaultSettings.zoomDebounceMs,
    
    maxConcurrentRenders: old.maxConcurrentRenders ?? defaultSettings.maxConcurrentRenders,
    visibleMarginPages: old.highRadius ?? old.preloadRange ?? defaultSettings.visibleMarginPages,
    
    jpegQuality: old.jpegQuality ?? defaultSettings.jpegQuality,
    pngCompression: old.pngFast ? 'fast' : 'balanced',
    
    devPerfOverlay: old.devPerfOverlay ?? defaultSettings.devPerfOverlay,
  }
}
