export type TargetWidthPolicy = 'container' | 'scale'

export interface SettingsState {
  // File operations
  deleteBehavior: 'saveAsNew' | 'overwrite'
  // Rendering
  highQualityFormat: 'png' | 'jpeg'
  dprCap: number
  highQualityDelayMs: number
  // Caps to control output size
  maxTargetWidth: number
  actualDpiCap: number
  preloadDprCap: number

  // Width policy
  targetWidthPolicy: TargetWidthPolicy
  baseWidth: number

  // Performance
  maxConcurrentRenders: number
  prefetchPx: number
  // Background preloading
  preloadAllPages: boolean
  preloadRange: number
  preloadIdleMs: number
  // Background preloading (advanced)
  preloadBatchSize: number
  preloadStartDelayMs: number
  pausePreloadOnInteraction: boolean

  // Debug
  devPerfOverlay: boolean

  // Encoding quality
  jpegQuality: number // 1-100
  pngFast: boolean

  // Warm window prefetch radius (high-quality only)
  highRadius: number
}

export const defaultSettings: SettingsState = {
  deleteBehavior: 'saveAsNew',
  highQualityFormat: 'png',
  dprCap: 2.0,
  highQualityDelayMs: 120,
  maxTargetWidth: 1920,
  actualDpiCap: 144,
  preloadDprCap: 1.0,

  targetWidthPolicy: 'container',
  baseWidth: 1200,

  maxConcurrentRenders: 3,
  prefetchPx: 800,
  preloadAllPages: false,
  preloadRange: 8,
  preloadIdleMs: 300,
  preloadBatchSize: 2,
  preloadStartDelayMs: 500,
  pausePreloadOnInteraction: true,

  devPerfOverlay: false,

  jpegQuality: 82,
  pngFast: true,
  highRadius: 2,
}
