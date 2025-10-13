import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ExportSettingsState } from './types'
import { defaultExportSettings } from './types'
import { readLocalJson, writeLocalJson } from '@/modules/persist/local'

const STORAGE_KEY = 'export-settings'

export const useExportSettings = defineStore('export-settings', () => {
  const s = ref<ExportSettingsState>({ ...defaultExportSettings })

  // 初始載入（localStorage）
  ;(async () => {
    const loaded = await readLocalJson<ExportSettingsState>(STORAGE_KEY, { ...defaultExportSettings })
    Object.assign(s.value, loaded)
  })()

  let persistTimer: number | null = null
  function schedulePersist(v: ExportSettingsState) {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      void writeLocalJson(STORAGE_KEY, v)
      persistTimer = null
    }, 200)
  }

  watch(s, v => schedulePersist(v), { deep: true })

  function reset() { Object.assign(s.value, defaultExportSettings) }

  return { s, reset }
})
