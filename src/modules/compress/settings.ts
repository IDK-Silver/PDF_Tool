import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { CompressImageSettings, CompressPdfSettings, CompressSettingsState } from './types'
import { readJson, writeJson } from '@/modules/persist/json'

export const defaultImageSettings: CompressImageSettings = {
  format: 'preserve',
  quality: 82,
  maxWidth: 2560,
  maxHeight: 2560,
  stripMetadata: true,
}

export const defaultPdfSettings: CompressPdfSettings = {
  targetEffectiveDpi: 150,
  downsampleRule: 'always',
  thresholdEffectiveDpi: 200,
  format: 'jpeg',
  quality: 82,
  losslessOptimize: true,
  removeMetadata: true,
}

const FILE_NAME = 'compress-settings.json'

export const useCompressSettings = defineStore('compress-settings', () => {
  const s = ref<CompressSettingsState>({ saveBehavior: 'saveAsNew', image: { ...defaultImageSettings }, pdf: { ...defaultPdfSettings } })

  // 初始載入 JSON 設定（不做相容處理）
  ;(async () => {
    const loaded = await readJson<CompressSettingsState>(FILE_NAME, { saveBehavior: 'saveAsNew', image: { ...defaultImageSettings }, pdf: { ...defaultPdfSettings } })
    // 僅確保 > 0，不做額外限制或四捨五入
    const t1 = Number(loaded.pdf.targetEffectiveDpi)
    const t2 = Number(loaded.pdf.thresholdEffectiveDpi)
    if (!Number.isFinite(t1) || t1 <= 0) loaded.pdf.targetEffectiveDpi = defaultPdfSettings.targetEffectiveDpi
    if (!Number.isFinite(t2) || t2 <= 0) loaded.pdf.thresholdEffectiveDpi = defaultPdfSettings.thresholdEffectiveDpi
    if (loaded.saveBehavior !== 'overwrite' && loaded.saveBehavior !== 'saveAsNew') loaded.saveBehavior = 'saveAsNew'
    Object.assign(s.value, loaded)
  })()

  let persistTimer: number | null = null
  function schedulePersist() {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      void writeJson(FILE_NAME, s.value)
      persistTimer = null
    }, 200)
  }

  watch(s, () => schedulePersist(), { deep: true })

  function resetImage() { s.value.image = { ...defaultImageSettings } }
  function resetPdf() { s.value.pdf = { ...defaultPdfSettings } }

  return { s, resetImage, resetPdf }
})
