export type ImageFormatOption = 'preserve' | 'jpeg' | 'png' | 'webp'

export interface CompressImageSettings {
  format: ImageFormatOption
  quality: number // 1-100 (only for jpeg/webp)
  maxWidth?: number
  maxHeight?: number
  stripMetadata: boolean
}

export interface CompressPdfSettings {
  // 目標「有效 DPI」（影像在頁面呈現時的實際像素密度），
  // 影像高於此門檻會被下採樣至該 DPI 附近。
  targetEffectiveDpi: number
  // 下採樣規則：
  // - always：一律以 targetEffectiveDpi 作為上限
  // - whenAbove：僅當有效 DPI >= thresholdEffectiveDpi 才下採樣至 targetEffectiveDpi
  downsampleRule: 'always' | 'whenAbove'
  thresholdEffectiveDpi: number
  // 彩色/灰階影像的重新編碼格式：JPEG 或保留原格式
  format: 'jpeg' | 'keep'
  // 有損品質（1-100），僅在 JPEG 時生效
  quality: number
  // 無損結構最佳化（重新壓縮 streams、object streams、壓縮 xref、去冗）
  losslessOptimize: boolean
  // 移除文件與影像 metadata
  removeMetadata: boolean
}

export interface CompressionUiState {
  activeTab: 'pdf' | 'image'
}
