export type TargetWidthPolicy = 'container' | 'scale'

export interface SettingsState {
  // Rendering strategy
  lowQualityFirst: boolean
  lowQualityFormat: 'jpeg' | 'png'
  lowQualityScale: number // relative to container width
  highQualityDelayMs: number
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

  // Warm window prefetch radii
  lowRadius: number
  highRadius: number
}

export const defaultSettings: SettingsState = {
  lowQualityFirst: true,
  lowQualityFormat: 'jpeg',
  lowQualityScale: 0.5,
  highQualityDelayMs: 120,
  highQualityFormat: 'png',
  dprCap: 2.0,

  targetWidthPolicy: 'container',
  baseWidth: 1200,

  maxConcurrentRenders: 3,
  prefetchPx: 800,

  devPerfOverlay: false,

  jpegQuality: 82,
  pngFast: true,

  lowRadius: 8,
  highRadius: 2,
}
