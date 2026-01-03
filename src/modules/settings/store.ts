import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { SettingsState } from './types'
import { defaultSettings } from './types'
import { readLocalJson, writeLocalJson } from '@/modules/persist/local'
import { setLocale, resolveLocale } from '@/locales'
import { invoke } from '@tauri-apps/api/core'

type ThemeSetting = 'system' | 'light' | 'dark'
type ActualTheme = 'light' | 'dark'

/**
 * Detect system theme preference
 */
function getSystemTheme(): ActualTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/**
 * Resolve theme setting to actual theme
 */
function resolveTheme(setting: ThemeSetting): ActualTheme {
  if (setting === 'system') return getSystemTheme()
  return setting
}

/**
 * Apply theme to <html> element
 */
function applyTheme(theme: ActualTheme) {
  const html = document.documentElement
  if (theme === 'dark') {
    html.classList.add('dark')
  } else {
    html.classList.remove('dark')
  }
}

const STORAGE_KEY = 'settings'

export const useSettingsStore = defineStore('settings', () => {
  const s = ref<SettingsState>({ ...defaultSettings })

  // Track current actual theme for reactivity
  const actualTheme = ref<ActualTheme>(resolveTheme(s.value.theme))

  // Listen for system theme changes
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (s.value.theme === 'system') {
        actualTheme.value = getSystemTheme()
        applyTheme(actualTheme.value)
      }
    })
  }

  // Initial load (localStorage)
  ;(async () => {
    const loaded = await readLocalJson<SettingsState>(STORAGE_KEY, { ...defaultSettings })
    Object.assign(s.value, loaded)
    actualTheme.value = resolveTheme(s.value.theme)
    applyTheme(actualTheme.value)
    // Set initial locale (vue-i18n already initialized from localStorage in locales/index.ts,
    // but sync here to ensure Tauri menu uses correct language)
    const actualLocale = resolveLocale(s.value.language)
    try {
      await invoke('set_app_language', { language: actualLocale })
    } catch {
      // Tauri not available (dev mode) or command not yet registered
    }
  })()

  // Apply theme on initialization
  applyTheme(actualTheme.value)

  // Debounced persistence to avoid jank when editing numbers rapidly
  let persistTimer: number | null = null
  function schedulePersist(v: SettingsState) {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      void writeLocalJson(STORAGE_KEY, v)
      persistTimer = null
    }, 200)
  }

  watch(s, v => {
    schedulePersist(v)
  }, { deep: true })

  // Watch theme setting changes, apply resolved theme to <html>
  watch(() => s.value.theme, (themeSetting) => {
    actualTheme.value = resolveTheme(themeSetting)
    applyTheme(actualTheme.value)
  })

  // 監聽語言變更，同步至 vue-i18n 和 Tauri 選單
  watch(() => s.value.language, async (langSetting) => {
    const actualLocale = resolveLocale(langSetting)
    setLocale(actualLocale)
    try {
      await invoke('set_app_language', { language: actualLocale })
    } catch (err) {
      console.error('[settings] Failed to set app language', err)
    }
  })

  // Clear text cache when text layer settings change
  watch(() => ({
    overlap: s.value.textLayerOverlapThreshold,
    minSpacing: s.value.textLayerMinSpacing,
    smallGap: s.value.textLayerSmallGapThreshold,
    smallGapSpacing: s.value.textLayerSmallGapSpacing,
    offsetX: s.value.textLayerGlobalOffsetX,
  }), () => {
    // Import media store dynamically to avoid circular dependency
    import('@/modules/media/store').then(({ useMediaStore }) => {
      const mediaStore = useMediaStore()
      mediaStore.resetPageTextCache()
    })
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
    actualTheme,
    set,
    reset,
  }
})
