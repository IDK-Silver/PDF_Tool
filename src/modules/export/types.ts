export type ExportImageFormat = 'png' | 'jpeg'

export interface ExportSettingsState {
  imageFormat: ExportImageFormat
  imageDpi: number
  imageQuality: number // 1-100, only for JPEG
}

export const defaultExportSettings: ExportSettingsState = {
  imageFormat: 'png',
  imageDpi: 150,
  imageQuality: 85,
}

