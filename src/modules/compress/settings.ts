import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { CompressImageSettings, CompressPdfSettings } from './types'

const LS_KEY = 'kano_compress_settings_v1'

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

function loadFromStorage(): { image: CompressImageSettings; pdf: CompressPdfSettings } {
  try {
    const txt = localStorage.getItem(LS_KEY)
    if (!txt) return { image: { ...defaultImageSettings }, pdf: { ...defaultPdfSettings } }
    const obj = JSON.parse(txt)
    const image: CompressImageSettings = { ...defaultImageSettings, ...(obj?.image || {}) }
    const pdf: any = { ...defaultPdfSettings, ...(obj?.pdf || {}) }
    // normalize legacy/invalid values
    if (!['jpeg','keep'].includes(pdf.format)) pdf.format = defaultPdfSettings.format
    if (!['always','whenAbove'].includes(pdf.downsampleRule)) pdf.downsampleRule = defaultPdfSettings.downsampleRule
    pdf.targetEffectiveDpi = Math.max(72, Math.min(600, Math.round(pdf.targetEffectiveDpi || defaultPdfSettings.targetEffectiveDpi)))
    pdf.thresholdEffectiveDpi = Math.max(72, Math.min(600, Math.round(pdf.thresholdEffectiveDpi || defaultPdfSettings.thresholdEffectiveDpi)))
    return { image, pdf }
  } catch {
    return { image: { ...defaultImageSettings }, pdf: { ...defaultPdfSettings } }
  }
}

export const useCompressSettings = defineStore('compress-settings', () => {
  const s = ref(loadFromStorage())

  let persistTimer: number | null = null
  function schedulePersist() {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(s.value)) } catch {}
      persistTimer = null
    }, 200)
  }

  watch(s, () => schedulePersist(), { deep: true })

  function resetImage() { s.value.image = { ...defaultImageSettings } }
  function resetPdf() { s.value.pdf = { ...defaultPdfSettings } }

  return { s, resetImage, resetPdf }
})
