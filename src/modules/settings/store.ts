import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { SettingsState } from './types'
import { defaultSettings } from './types'
import { readJson, writeJson } from '@/modules/persist/json'

/**
 * 套用主題到 <html> 元素
 */
function applyTheme(theme: 'light' | 'dark') {
  const html = document.documentElement
  if (theme === 'dark') {
    html.classList.add('dark')
  } else {
    html.classList.remove('dark')
  }
}

const FILE_NAME = 'settings.json'

export const useSettingsStore = defineStore('settings', () => {
  const s = ref<SettingsState>({ ...defaultSettings })

  // 初始載入 JSON 設定（不做相容處理）
  ;(async () => {
    const loaded = await readJson<SettingsState>(FILE_NAME, { ...defaultSettings })
    Object.assign(s.value, loaded)
    applyTheme(s.value.theme)
  })()

  // 初始化時套用主題
  applyTheme(s.value.theme)

  // Debounced persistence to avoid jank when editing numbers rapidly
  let persistTimer: number | null = null
  function schedulePersist(v: SettingsState) {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      void writeJson(FILE_NAME, v)
      persistTimer = null
    }, 200)
  }

  watch(s, v => {
    schedulePersist(v)
  }, { deep: true })

  // 監聽主題變更，即時套用到 <html>
  watch(() => s.value.theme, (theme) => {
    applyTheme(theme)
  })

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
