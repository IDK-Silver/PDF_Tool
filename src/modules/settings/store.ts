import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { SettingsState } from './types'
import { defaultSettings, migrateFromV1 } from './types'

const LS_KEY = 'kano_pdf_settings_v2'
const LS_KEY_OLD = 'kano_pdf_settings_v1'

function loadFromStorage(): SettingsState {
  try {
    // 嘗試載入 v2
    const v2 = localStorage.getItem(LS_KEY)
    if (v2) {
      const obj = JSON.parse(v2)
      return { ...defaultSettings, ...obj }
    }
    
    // 回退：嘗試從 v1 遷移
    const v1 = localStorage.getItem(LS_KEY_OLD)
    if (v1) {
      const oldObj = JSON.parse(v1)
      const migrated = migrateFromV1(oldObj)
      // 立即存為 v2
      localStorage.setItem(LS_KEY, JSON.stringify(migrated))
      localStorage.removeItem(LS_KEY_OLD) // 清除舊版
      return migrated
    }
    
    return { ...defaultSettings }
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

  // 移除 prefetchRootMargin（已不需要，IntersectionObserver 內建處理）

  function set<K extends keyof SettingsState>(key: K, val: SettingsState[K]) {
    (s.value as any)[key] = val
  }

  function reset() {
    // 保持物件身份不變，避免使用端持有舊引用而不更新
    Object.assign(s.value, defaultSettings)
  }

  return {
    s,
    set,
    reset,
  }
})
