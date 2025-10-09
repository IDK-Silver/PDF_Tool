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
  // 低清渲染（快速預覽）
  enableLowRes: boolean                   // 是否啟用低清渲染（關閉則直接高清）
  lowResDpi: number                       // 一般頁面低清 DPI
  largePageLowResDpi: number              // 大頁面專用低清 DPI（A3/A2 降級）
  useLowResDpr: boolean                   // 低清是否考慮 DPR（Retina 螢幕適配）
  lowResDprMultiplier: number             // 低清 DPR 倍數（預設 1.0，Retina 可用 1.5）
  
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
  // 檔案操作
  deleteBehavior: 'saveAsNew',

  // 插入空白頁預設
  insertPaper: 'A4',
  insertOrientation: 'portrait',
  insertCustomWidthMm: 210,
  insertCustomHeightMm: 297,

  // 渲染品質
  // 低清渲染
  enableLowRes: true,         // 啟用低清渲染（關閉則直接高清，更清晰但首次顯示慢）
  lowResDpi: 60,              // 一般頁面低清 DPI（A4: 0.6M像素，90ms）
  largePageLowResDpi: 48,     // 大頁面低清 DPI（A3: 0.44M像素，80ms）
  useLowResDpr: false,        // 低清是否考慮 DPR（Retina 適配，預設關閉保持快速）
  lowResDprMultiplier: 1.0,   // 低清 DPR 倍數（開啟時建議 1.0-1.5，避免過大）
  
  // 高清渲染
  renderFormat: 'raw',
  highResDpiCap: 300,          // 高清 DPI 上限（A3: 96dpi=1.78M像素=300ms，144dpi=4M像素=700ms）
  dprCap: 2.0,
  maxOutputWidth: 1920,
  actualModeDpiCap: 300,
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
    deleteBehavior: old.deleteBehavior ?? defaultSettings.deleteBehavior,
    
    insertPaper: old.insertPaper ?? defaultSettings.insertPaper,
    insertOrientation: old.insertOrientation ?? defaultSettings.insertOrientation,
    insertCustomWidthMm: old.insertCustomWidthMm ?? defaultSettings.insertCustomWidthMm,
    insertCustomHeightMm: old.insertCustomHeightMm ?? defaultSettings.insertCustomHeightMm,
    
    // 低清渲染
    enableLowRes: old.enableLowRes ?? defaultSettings.enableLowRes,
    lowResDpi: old.lowResDpi ?? defaultSettings.lowResDpi,
    largePageLowResDpi: old.largePageLowResDpi ?? defaultSettings.largePageLowResDpi,
    useLowResDpr: old.useLowResDpr ?? defaultSettings.useLowResDpr,
    lowResDprMultiplier: old.lowResDprMultiplier ?? defaultSettings.lowResDprMultiplier,
    
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
