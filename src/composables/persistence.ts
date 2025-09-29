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
    windowWidthPx?: number
    windowHeightPx?: number
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
  if (!store) {
    console.warn('[persistence] Store not available, cannot save state')
    return
  }

  const stateInfo = {
    mode: state.lastMode,
    viewFiles: state.files.view.length,
    convertFiles: state.files.convert.length,
    composeFiles: state.files.compose.length,
    activeView: state.active.view,
    activeConvert: state.active.convert,
    activeCompose: state.active.compose,
    windowWidth: state.ui?.windowWidthPx ?? null,
    windowHeight: state.ui?.windowHeightPx ?? null
  }

  console.log('[persistence] Saving state:', stateInfo)

  try {
    await store.set(KEY, state)
    await store.save()
    console.log('[persistence] State saved successfully')

    // 驗證儲存：立即讀回來檢查
    const verified = await store.get(KEY) as PersistedState | undefined
    if (verified && verified.active.view === state.active.view) {
      console.log('[persistence] Save verification successful')
    } else {
      console.error('[persistence] Save verification failed!')
    }
  } catch (e) {
    console.error('[persistence] Failed to save state:', e)
    throw e // 重新拋出錯誤以便呼叫者處理
  }
}

// Debounced save helper (default 1000ms)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingState: PersistedState | null = null
export function saveAppStateDebounced(state: PersistedState, delayMs = 1000) {
  pendingState = state
  console.log(`[persistence] Scheduling debounced save in ${delayMs}ms`)

  if (debounceTimer) {
    console.log('[persistence] Clearing previous debounce timer')
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null
    if (pendingState) {
      console.log('[persistence] Executing debounced save')
      try {
        await saveAppState(pendingState)
        console.log('[persistence] Debounced save completed')
      } catch (e) {
        console.error('[persistence] Debounced save failed:', e)
      } finally {
        pendingState = null
      }
    } else {
      console.log('[persistence] No pending state for debounced save')
    }
  }, delayMs)
}

export async function loadAppState(): Promise<PersistedState | null> {
  const store = await getStore()
  if (!store) {
    console.warn('[persistence] Store not available, cannot load state')
    return null
  }

  try {
    console.log('[persistence] Loading state from store')
    const data = (await store.get(KEY)) as PersistedState | undefined

    if (!data) {
      console.log('[persistence] No saved state found')
      return null
    }

    if (data.version !== 1) {
      console.warn('[persistence] Incompatible state version:', data.version)
      return null
    }

    const stateInfo = {
      mode: data.lastMode,
      viewFiles: data.files.view.length,
      convertFiles: data.files.convert.length,
      composeFiles: data.files.compose.length,
      activeView: data.active.view,
      activeConvert: data.active.convert,
      activeCompose: data.active.compose,
      viewFileNames: data.files.view.map(f => f.name)
    }

    console.log('[persistence] Loaded state:', stateInfo)
    return data
  } catch (e) {
    console.error('[persistence] Failed to load state:', e)
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
