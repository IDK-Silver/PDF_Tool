import type { Mode, PdfFile } from '../types/pdf'
import { Store } from '@tauri-apps/plugin-store'

type StoredFile = Omit<PdfFile, 'kind'> & { kind?: PdfFile['kind'] }

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
      lastViewed: number
    }
  }
}

type PersistedStateRaw = Omit<PersistedState, 'files'> & {
  files: {
    view: StoredFile[]
    convert: StoredFile[]
    compose: StoredFile[]
  }
}

const FILE_NAME = 'state.json'
const KEY = 'appState'

let storePromise: Promise<Store | null> | null = null

async function resolveStore(): Promise<Store | null> {
  if (!storePromise) {
    storePromise = Store.load(FILE_NAME).catch((error) => {
      console.warn('Store load failed; persistence disabled', error)
      return null
    })
  }
  return storePromise
}

function normalizeState(raw: PersistedStateRaw): PersistedState {
  return {
    ...raw,
    files: {
      view: normalizeFileList(raw.files.view),
      convert: normalizeFileList(raw.files.convert),
      compose: normalizeFileList(raw.files.compose),
    },
  }
}

function normalizeFileList(list: StoredFile[] | undefined): PdfFile[] {
  if (!Array.isArray(list)) return []
  return list
    .filter(Boolean)
    .map((file) => ({
      ...file,
      kind: file.kind ?? 'pdf',
    }))
}

function describeState(state: PersistedState) {
  return {
    mode: state.lastMode,
    viewFiles: state.files.view.length,
    convertFiles: state.files.convert.length,
    composeFiles: state.files.compose.length,
    activeView: state.active.view,
    activeConvert: state.active.convert,
    activeCompose: state.active.compose,
    windowWidth: state.ui?.windowWidthPx ?? null,
    windowHeight: state.ui?.windowHeightPx ?? null,
  }
}

function cloneState(state: PersistedState): PersistedState {
  return {
    version: 1,
    lastMode: state.lastMode,
    files: {
      view: state.files.view.map((file) => ({ ...file })),
      convert: state.files.convert.map((file) => ({ ...file })),
      compose: state.files.compose.map((file) => ({ ...file })),
    },
    active: { ...state.active },
    queries: { ...state.queries },
    ui: state.ui ? { ...state.ui } : undefined,
    pageHistory: state.pageHistory
      ? Object.fromEntries(Object.entries(state.pageHistory).map(([path, entry]) => [path, { ...entry }]))
      : undefined,
  }
}

async function readRawState(store: Store): Promise<PersistedStateRaw | null> {
  const raw = (await store.get(KEY)) as PersistedStateRaw | undefined
  return raw ?? null
}

async function writeState(store: Store, state: PersistedState): Promise<void> {
  console.log('[persistence] Saving state:', describeState(state))
  await store.set(KEY, state)
  await store.save()

  const verifiedRaw = await readRawState(store)
  const verified = verifiedRaw ? normalizeState(verifiedRaw) : null
  if (!verified || verified.active.view !== state.active.view) {
    console.error('[persistence] Save verification failed')
  } else {
    console.log('[persistence] State saved successfully')
  }
}

type DebouncedSaver = (state: PersistedState, delayMs?: number) => void

function createDebouncedSaver(fn: (state: PersistedState) => Promise<void>): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: PersistedState | null = null

  return (state, delayMs = 1000) => {
    pending = state
    if (timer) clearTimeout(timer)

    timer = setTimeout(async () => {
      timer = null
      if (!pending) return
      try {
        await fn(pending)
      } catch (error) {
        console.error('[persistence] Debounced save failed:', error)
      } finally {
        pending = null
      }
    }, delayMs)
  }
}

export async function saveAppState(state: PersistedState): Promise<void> {
  const store = await resolveStore()
  if (!store) {
    console.warn('[persistence] Store not available, cannot save state')
    return
  }

  try {
    const plain = cloneState(state)
    if (!plain.pageHistory) {
      const current = await readRawState(store)
      if (current?.pageHistory) {
        plain.pageHistory = { ...current.pageHistory }
      }
    }
    await writeState(store, plain)
  } catch (error) {
    console.error('[persistence] Failed to save state:', error)
    throw error
  }
}

const debouncedSave = createDebouncedSaver(saveAppState)

export function saveAppStateDebounced(state: PersistedState, delayMs = 1000) {
  console.log(`[persistence] Scheduling debounced save in ${delayMs}ms`)
  debouncedSave(cloneState(state), delayMs)
}

export async function loadAppState(): Promise<PersistedState | null> {
  const store = await resolveStore()
  if (!store) {
    console.warn('[persistence] Store not available, cannot load state')
    return null
  }

  try {
    console.log('[persistence] Loading state from store')
    const raw = await readRawState(store)
    if (!raw) {
      console.log('[persistence] No saved state found')
      return null
    }

    if (raw.version !== 1) {
      console.warn('[persistence] Incompatible state version:', raw.version)
      return null
    }

    const state = normalizeState(raw)
    console.log('[persistence] Loaded state:', describeState(state))
    return state
  } catch (error) {
    console.error('[persistence] Failed to load state:', error)
    return null
  }
}

export async function clearAppState(): Promise<void> {
  const store = await resolveStore()
  if (!store) return
  try {
    if (typeof (store as any).delete === 'function') {
      await (store as any).delete(KEY)
    } else {
      await store.set(KEY, null)
      await store.save()
    }
  } catch (error) {
    console.error('[persistence] Failed to clear state:', error)
  }
}

// ----- App Settings (stored separately to avoid conflicts with appState writes) -----

export type AppSettings = {
  exportDpi: number
  exportFormat: 'png' | 'jpeg'
  jpegQuality?: number
  defaultZoomMode?: 'actual' | 'fit'
}

const SETTINGS_KEY = 'appSettings'

function defaultSettings(): AppSettings {
  return { exportDpi: 300, exportFormat: 'png', jpegQuality: 0.9, defaultZoomMode: 'fit' }
}

export async function loadSettings(): Promise<AppSettings> {
  const store = await resolveStore()
  if (!store) return defaultSettings()
  try {
    const data = (await store.get(SETTINGS_KEY)) as AppSettings | undefined
    return { ...defaultSettings(), ...(data ?? {}) }
  } catch {
    return defaultSettings()
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await resolveStore()
  if (!store) return
  try {
    await store.set(SETTINGS_KEY, settings)
    await store.save()
  } catch (error) {
    console.warn('Failed to save settings', error)
  }
}

let settingsTimer: ReturnType<typeof setTimeout> | null = null
let pendingSettings: AppSettings | null = null

export function saveSettingsDebounced(settings: AppSettings, delayMs = 500) {
  pendingSettings = settings
  if (settingsTimer) clearTimeout(settingsTimer)
  settingsTimer = setTimeout(async () => {
    settingsTimer = null
    if (!pendingSettings) return
    try {
      await saveSettings(pendingSettings)
    } finally {
      pendingSettings = null
    }
  }, delayMs)
}
