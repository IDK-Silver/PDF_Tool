export const SETTINGS_SECTION_IDS = {
  language: 'language',
  update: 'update',
  appearance: 'appearance',
  workspace: 'workspace',
  highResRendering: 'high-res-rendering',
  performance: 'performance',
  zoomInteraction: 'zoom-interaction',
  fileOps: 'fileops',
  compressionSave: 'compression-save',
  insertDefaults: 'insert-defaults',
  textLayer: 'text-layer',
  export: 'export',
  encoding: 'encoding',
  debug: 'debug',
} as const

export type SettingsSectionKey = keyof typeof SETTINGS_SECTION_IDS

export interface SettingsSection {
  key: SettingsSectionKey
  id: string
  navLabelKey: string
  hiddenOnAppStore?: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'language', id: SETTINGS_SECTION_IDS.language, navLabelKey: 'settings.nav.language' },
  { key: 'update', id: SETTINGS_SECTION_IDS.update, navLabelKey: 'settings.nav.update', hiddenOnAppStore: true },
  { key: 'appearance', id: SETTINGS_SECTION_IDS.appearance, navLabelKey: 'settings.nav.appearance' },
  { key: 'workspace', id: SETTINGS_SECTION_IDS.workspace, navLabelKey: 'settings.nav.workspace' },
  { key: 'highResRendering', id: SETTINGS_SECTION_IDS.highResRendering, navLabelKey: 'settings.nav.highResRendering' },
  { key: 'performance', id: SETTINGS_SECTION_IDS.performance, navLabelKey: 'settings.nav.performance' },
  { key: 'zoomInteraction', id: SETTINGS_SECTION_IDS.zoomInteraction, navLabelKey: 'settings.nav.zoomInteraction' },
  { key: 'fileOps', id: SETTINGS_SECTION_IDS.fileOps, navLabelKey: 'settings.nav.fileOps' },
  { key: 'compressionSave', id: SETTINGS_SECTION_IDS.compressionSave, navLabelKey: 'settings.nav.compressionSave' },
  { key: 'insertDefaults', id: SETTINGS_SECTION_IDS.insertDefaults, navLabelKey: 'settings.nav.insertDefaults' },
  { key: 'textLayer', id: SETTINGS_SECTION_IDS.textLayer, navLabelKey: 'settings.nav.textLayer' },
  { key: 'export', id: SETTINGS_SECTION_IDS.export, navLabelKey: 'settings.nav.export' },
  { key: 'encoding', id: SETTINGS_SECTION_IDS.encoding, navLabelKey: 'settings.nav.encoding' },
  { key: 'debug', id: SETTINGS_SECTION_IDS.debug, navLabelKey: 'settings.nav.debug' },
]
