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

  // Debounced persistence to avoid jank when editing numbers rapidly
  let persistTimer: number | null = null
  function schedulePersist(v: SettingsState) {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(v)) } catch {}
      persistTimer = null
    }, 200)
  }

  watch(s, v => {
    schedulePersist(v)
  }, { deep: true })

  const prefetchRootMargin = computed(() => `${s.value.prefetchPx}px 0px`)

  function set<K extends keyof SettingsState>(key: K, val: SettingsState[K]) {
    (s.value as any)[key] = val
  }

  function reset() {
    // 保持物件身份不變，避免使用端持有舊引用而不更新
    Object.assign(s.value, defaultSettings)
  }

  return {
    s,
    prefetchRootMargin,
    set,
    reset,
  }
})
