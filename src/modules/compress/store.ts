import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useCompressSettings } from './settings'
import type { CompressionUiState } from './types'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useFileListStore } from '@/modules/filelist/store'
import { compressImage, compressPdfLossless } from '@/modules/media/service'

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
        const base = (d.name || 'image').replace(/\.[^.]+$/,'') + ' (compressed).' + ext
        const destPath = await saveDialog({ defaultPath: base, filters: [{ name: 'Image', extensions: ['jpg','jpeg','png','webp'] }] })
        if (!destPath) return
        const res = await compressImage({
          srcPath,
          destPath,
          format: s.format === 'preserve' ? 'preserve' : (s.format as any),
          quality: s.quality,
          maxWidth: s.maxWidth,
          maxHeight: s.maxHeight,
          stripMetadata: s.stripMetadata,
        })
        try { filelist.add(res.path) } catch {}
        await media.selectPath(res.path)
      } else if (d.type === 'pdf') {
        // v1: structure optimize (pure Rust placeholder; JPEG/Flate pass to follow)
        const srcPath = d.path
        const base = (d.name || 'document').replace(/\.[^.]+$/,'') + ' (optimized).pdf'
        const destPath = await saveDialog({ defaultPath: base, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
        if (!destPath) return
        const res = await compressPdfLossless({ srcPath, destPath, linearize: true })
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
