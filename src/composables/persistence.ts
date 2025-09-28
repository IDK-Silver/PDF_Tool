import type { Mode, PdfFile } from '../types/pdf'
import { Store } from '@tauri-apps/plugin-store'

export type PersistedState = {
  version: 1
  lastMode: Mode
  files: {
    view: PdfFile[]
    convert: PdfFile[]
    compose: PdfFile[]
  }
  active: {
    view: string | null
    convert: string | null
    compose: string | null
  }
  queries: {
    view: string
    convert: string
    compose: string
  }
  ui?: {
    leftWidthPx?: number
    leftCollapsed?: boolean
  }
  pageHistory?: {
    [filePath: string]: {
      currentPage: number
      lastViewed: number // timestamp
    }
  }
}

const FILE_NAME = 'state.json'
const KEY = 'appState'

let storePromise: Promise<Store | null> | null = null
async function getStore(): Promise<Store | null> {
  if (!storePromise) {
    storePromise = Store.load(FILE_NAME).catch((e) => {
      console.warn('Store load failed; persistence disabled', e)
      return null
    })
  }
  return storePromise
}

export async function saveAppState(state: PersistedState): Promise<void> {
  const store = await getStore()
  if (!store) return
  try {
    await store.set(KEY, state)
    await store.save()
  } catch (e) {
    console.warn('Failed to save state', e)
  }
}

// Debounced save helper (default 1000ms)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingState: PersistedState | null = null
export function saveAppStateDebounced(state: PersistedState, delayMs = 1000) {
  pendingState = state
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    debounceTimer = null
    if (pendingState) {
      try {
        await saveAppState(pendingState)
      } finally {
        pendingState = null
      }
    }
  }, delayMs)
}

export async function loadAppState(): Promise<PersistedState | null> {
  const store = await getStore()
  if (!store) return null
  try {
    const data = (await store.get(KEY)) as PersistedState | undefined
    if (data && data.version === 1) return data
    return null
  } catch (e) {
    console.warn('Failed to load state', e)
    return null
  }
}

export async function clearAppState(): Promise<void> {
  const store = await getStore()
  if (!store) return
  try {
    // Prefer delete if available; fallback to set null
    if (typeof (store as any).delete === 'function') {
      await (store as any).delete(KEY)
    } else {
      await store.set(KEY, null)
    }
    await store.save()
  } catch {}
}

// ----- App Settings (stored separately to avoid conflicts with appState writes) -----
export type AppSettings = {
  exportDpi: number
  exportFormat: 'png' | 'jpeg'
  jpegQuality?: number // 0..1 for canvas quality
  defaultZoomMode?: 'actual' | 'fit'
}

const SETTINGS_KEY = 'appSettings'

function defaultSettings(): AppSettings {
  return { exportDpi: 300, exportFormat: 'png', jpegQuality: 0.9, defaultZoomMode: 'fit' }
}

export async function loadSettings(): Promise<AppSettings> {
  const store = await getStore()
  if (!store) return defaultSettings()
  try {
    const data = (await store.get(SETTINGS_KEY)) as AppSettings | undefined
    return { ...defaultSettings(), ...(data ?? {}) }
  } catch {
    return defaultSettings()
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await getStore()
  if (!store) return
  try {
    await store.set(SETTINGS_KEY, settings)
    await store.save()
  } catch (e) {
    console.warn('Failed to save settings', e)
  }
}

let settingsTimer: ReturnType<typeof setTimeout> | null = null
let pendingSettings: AppSettings | null = null
export function saveSettingsDebounced(settings: AppSettings, delayMs = 500) {
  pendingSettings = settings
  if (settingsTimer) clearTimeout(settingsTimer)
  settingsTimer = setTimeout(async () => {
    settingsTimer = null
    if (pendingSettings) {
      try { await saveSettings(pendingSettings) } finally { pendingSettings = null }
    }
  }, delayMs)
}
