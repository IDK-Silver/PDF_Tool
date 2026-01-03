import { createI18n } from 'vue-i18n'
import zhTW from './zh-TW.json'
import en from './en.json'

export type SupportedLocale = 'zh-TW' | 'en'
export type LanguageSetting = 'system' | SupportedLocale

// Detect system language
export function getSystemLocale(): SupportedLocale {
  const lang = navigator.language
  if (lang.startsWith('zh')) return 'zh-TW'
  return 'en'
}

// Resolve language setting to actual locale
export function resolveLocale(setting: LanguageSetting): SupportedLocale {
  if (setting === 'system') return getSystemLocale()
  return setting
}

// Get initial locale from localStorage or system
function getInitialLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem('settings')
    if (stored) {
      const settings = JSON.parse(stored)
      if (settings.language === 'system') {
        return getSystemLocale()
      }
      if (settings.language === 'zh-TW' || settings.language === 'en') {
        return settings.language
      }
    }
  } catch {
    // Ignore parse errors
  }
  return getSystemLocale()
}

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'zh-TW',
  messages: { 'zh-TW': zhTW, en }
})

export function setLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale
}

export function getLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale
}
