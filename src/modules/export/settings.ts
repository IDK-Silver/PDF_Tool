import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ExportSettingsState } from './types'
import { defaultExportSettings } from './types'

const LS_KEY = 'kano_pdf_export_settings_v1'

function loadFromStorage(): ExportSettingsState {
  try {
    const txt = localStorage.getItem(LS_KEY)
    if (!txt) return { ...defaultExportSettings }
    const obj = JSON.parse(txt)
    return { ...defaultExportSettings, ...obj }
  } catch {
    return { ...defaultExportSettings }
  }
}

export const useExportSettings = defineStore('export-settings', () => {
  const s = ref<ExportSettingsState>(loadFromStorage())

  let persistTimer: number | null = null
  function schedulePersist(v: ExportSettingsState) {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(v)) } catch {}
      persistTimer = null
    }, 200)
  }

  watch(s, v => schedulePersist(v), { deep: true })

  function reset() { Object.assign(s.value, defaultExportSettings) }

  return { s, reset }
})

