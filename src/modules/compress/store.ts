import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useCompressSettings } from './settings'
import type { CompressionUiState } from './types'

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
    // UI-only: show a friendly notice
    alert('壓縮後端尚未實作，這裡先提供 UI。')
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
