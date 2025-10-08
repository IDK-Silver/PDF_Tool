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
  renderFormat: 'png' | 'jpeg' | 'webp'  // 統一格式（新增 WebP 支援）
  dprCap: number                          // DPR 上限（避免超高清輸出）
  maxOutputWidth: number                  // 最大輸出寬度（px）
  actualModeDpiCap: number               // 實際大小模式 DPI 上限
  zoomDebounceMs: number                 // 縮放停止後重渲染延遲

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
  renderFormat: 'webp',
  dprCap: 2.0,
  maxOutputWidth: 1920,
  actualModeDpiCap: 144,
  zoomDebounceMs: 300,

  // 效能控制
  maxConcurrentRenders: 2,    // 激進降至 2（大檔案單頁 500ms）
  visibleMarginPages: 0,      // 只渲染可見頁面（無預載）

  // 編碼品質
  jpegQuality: 85,
  pngCompression: 'balanced',

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
