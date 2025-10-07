export type TargetWidthPolicy = 'container' | 'scale'

export interface SettingsState {
  // Rendering
  highQualityFormat: 'png' | 'jpeg'
  dprCap: number

  // Width policy
  targetWidthPolicy: TargetWidthPolicy
  baseWidth: number

  // Performance
  maxConcurrentRenders: number
  prefetchPx: number

  // Debug
  devPerfOverlay: boolean

  // Encoding quality
  jpegQuality: number // 1-100
  pngFast: boolean

  // Warm window prefetch radius (high-quality only)
  highRadius: number
}

export const defaultSettings: SettingsState = {
  highQualityFormat: 'png',
  dprCap: 2.0,

  targetWidthPolicy: 'container',
  baseWidth: 1200,

  maxConcurrentRenders: 3,
  prefetchPx: 800,

  devPerfOverlay: false,

  jpegQuality: 82,
  pngFast: true,
  highRadius: 2,
}
