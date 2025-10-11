import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useCompressSettings } from './settings'
import type { CompressionUiState } from './types'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { dirname, join } from '@tauri-apps/api/path'
import { useFileListStore } from '@/modules/filelist/store'
import { compressImage, compressPdfSmart } from '@/modules/media/service'

export const useCompressionStore = defineStore('compression', () => {
  const ui = ref<CompressionUiState>({ activeTab: 'pdf' })
  const media = useMediaStore()
  const settings = useCompressSettings()

  const selectedType = computed(() => media.descriptor?.type)

  function ensureTabForSelection() {
    const t = selectedType.value
    if (t === 'pdf') ui.value.activeTab = 'pdf'
    else if (t === 'image') ui.value.activeTab = 'image'
  }

  function setTab(tab: 'pdf' | 'image') { ui.value.activeTab = tab }

  // UI-only placeholders
  const running = ref(false)
  const progress = ref(0)

  async function start() {
    const m = media
    const d = m.descriptor
    if (!d) return
    const filelist = useFileListStore()
    try {
      running.value = true
      progress.value = 0
      if (d.type === 'image') {
        const s = settings.s.image
        const srcPath = d.path
        const ext = s.format === 'preserve' ? (srcPath.split('.').pop() || 'jpg') : (s.format === 'jpeg' ? 'jpg' : s.format)
        const overwrite = settings.s.saveBehavior === 'overwrite'
        let destPath: string | null = null
        if (overwrite) {
          destPath = srcPath
        } else {
          const base = (d.name || 'image').replace(/\.[^.]+$/,'') + ' (compressed).' + ext
          const dir = await dirname(srcPath)
          const suggested = await join(dir, base)
          destPath = await saveDialog({ defaultPath: suggested, filters: [{ name: 'Image', extensions: ['jpg','jpeg','png','webp'] }] })
          if (!destPath) return
        }
        const res = await compressImage({
          srcPath,
          destPath: destPath!,
          format: s.format === 'preserve' ? 'preserve' : (s.format as any),
          quality: s.quality,
          maxWidth: s.maxWidth,
          maxHeight: s.maxHeight,
          stripMetadata: s.stripMetadata,
        })
        try { filelist.add(res.path) } catch {}
        await media.selectPath(res.path)
      } else if (d.type === 'pdf') {
        // v1: JPEG/Flate 重編碼 + 基礎結構最佳化（純 Rust）
        const srcPath = d.path
        const overwrite = settings.s.saveBehavior === 'overwrite'
        let destPath: string | null = null
        if (overwrite) {
          destPath = srcPath
        } else {
          const base = (d.name || 'document').replace(/\.[^.]+$/,'') + ' (optimized).pdf'
          const dir = await dirname(srcPath)
          const suggested = await join(dir, base)
          destPath = await saveDialog({ defaultPath: suggested, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
          if (!destPath) return
        }
        const s = settings.s.pdf
        const res = await compressPdfSmart({
          srcPath,
          destPath: destPath!,
          targetEffectiveDpi: s.targetEffectiveDpi,
          downsampleRule: s.downsampleRule,
          thresholdEffectiveDpi: s.thresholdEffectiveDpi,
          format: s.format,
          quality: s.quality,
          losslessOptimize: s.losslessOptimize,
          removeMetadata: s.removeMetadata,
        })
        try { filelist.add(res.path) } catch {}
        await media.selectPath(res.path)
      }
    } catch (err: any) {
      alert(err?.message || String(err))
    } finally {
      running.value = false
      progress.value = 0
    }
  }

  function cancel() {
    // UI-only
    running.value = false
    progress.value = 0
  }

  // Auto-sync activeTab when selection changes
  watch(selectedType, (t) => {
    if (t === 'pdf') ui.value.activeTab = 'pdf'
    else if (t === 'image') ui.value.activeTab = 'image'
  }, { immediate: true })

  return {
    ui,
    settings,
    selectedType,
    ensureTabForSelection,
    setTab,
    running,
    progress,
    start,
    cancel,
  }
})
