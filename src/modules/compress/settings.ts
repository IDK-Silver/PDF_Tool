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
    // 輕度正規化（維持基本安全範圍）
    loaded.pdf.targetEffectiveDpi = Math.max(72, Math.min(600, Math.round(loaded.pdf.targetEffectiveDpi)))
    loaded.pdf.thresholdEffectiveDpi = Math.max(72, Math.min(600, Math.round(loaded.pdf.thresholdEffectiveDpi)))
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
