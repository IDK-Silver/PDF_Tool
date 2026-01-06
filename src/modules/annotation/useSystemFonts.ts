import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { FontInfo } from './types'

const systemFonts = ref<FontInfo[]>([])
const loaded = ref(false)
const loading = ref(false)

export function useSystemFonts() {
  async function loadFonts() {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      systemFonts.value = await invoke<FontInfo[]>('list_system_fonts')
      loaded.value = true
    } catch (e) {
      console.error('Failed to load system fonts:', e)
    } finally {
      loading.value = false
    }
  }

  // CJK fonts (Chinese/Japanese/Korean)
  const cjkFonts = computed(() => systemFonts.value.filter((f) => f.isCjk))

  // Latin/other fonts
  const latinFonts = computed(() => systemFonts.value.filter((f) => !f.isCjk))

  // PDF built-in fonts (always available)
  const builtinFonts: FontInfo[] = [
    { family: 'Helvetica', isCjk: false },
    { family: 'Times', isCjk: false },
    { family: 'Courier', isCjk: false },
  ]

  return {
    systemFonts,
    cjkFonts,
    latinFonts,
    builtinFonts,
    loadFonts,
    loaded,
    loading,
  }
}
