import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ExportSettingsState } from './types'
import { defaultExportSettings } from './types'
import { readJson, writeJson } from '@/modules/persist/json'

const FILE_NAME = 'export-settings.json'

export const useExportSettings = defineStore('export-settings', () => {
  const s = ref<ExportSettingsState>({ ...defaultExportSettings })

  // 初始載入 JSON 設定（不做相容處理）
  ;(async () => {
    const loaded = await readJson<ExportSettingsState>(FILE_NAME, { ...defaultExportSettings })
    Object.assign(s.value, loaded)
  })()

  let persistTimer: number | null = null
  function schedulePersist(v: ExportSettingsState) {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      void writeJson(FILE_NAME, v)
      persistTimer = null
    }, 200)
  }

  watch(s, v => schedulePersist(v), { deep: true })

  function reset() { Object.assign(s.value, defaultExportSettings) }

  return { s, reset }
})
