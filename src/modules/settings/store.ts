import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { SettingsState } from './types'
import { defaultSettings } from './types'

const LS_KEY = 'kano_pdf_settings_v1'

function loadFromStorage(): SettingsState {
  try {
    const txt = localStorage.getItem(LS_KEY)
    if (!txt) return { ...defaultSettings }
    const obj = JSON.parse(txt)
    return { ...defaultSettings, ...obj }
  } catch {
    return { ...defaultSettings }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const s = ref<SettingsState>(loadFromStorage())

  watch(s, v => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(v)) } catch {}
  }, { deep: true })

  const prefetchRootMargin = computed(() => `${s.value.prefetchPx}px 0px`)

  function set<K extends keyof SettingsState>(key: K, val: SettingsState[K]) {
    (s.value as any)[key] = val
  }

  return {
    s,
    prefetchRootMargin,
    set,
  }
})
