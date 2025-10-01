import { onMounted, ref } from 'vue'
import type { PersistedState } from '../persistence'
import { loadAppState, saveAppStateDebounced } from '../persistence'

export interface PageHistoryEntry {
  currentPage: number
  lastViewed: number
}

export type PageHistoryMap = Record<string, PageHistoryEntry>

function createEmptyState(): PersistedState {
  return {
    version: 1,
    lastMode: 'view',
    files: { view: [], convert: [], compose: [] },
    active: { view: null, convert: null, compose: null },
    queries: { view: '', convert: '', compose: '' },
    ui: undefined,
    pageHistory: {},
  }
}

interface UsePageHistoryOptions {
  /** Optional hook that fires after the history finishes loading */
  onLoaded?: (history: PageHistoryMap) => void
}

export function usePageHistory(options: UsePageHistoryOptions = {}) {
  const pageHistory = ref<PageHistoryMap>({})
  const pageHistoryLoaded = ref(false)

  let persistPromise: Promise<void> | null = null

  async function persist(delayMs = 1000) {
    try {
      const state = await loadAppState()
      if (state) {
        const merged: PersistedState = {
          ...state,
          pageHistory: {
            ...(state.pageHistory ?? {}),
            ...pageHistory.value,
          },
        }
        saveAppStateDebounced(merged, delayMs)
      } else {
        const empty = createEmptyState()
        empty.pageHistory = { ...pageHistory.value }
        saveAppStateDebounced(empty, delayMs)
      }
    } catch (error) {
      console.warn('[usePageHistory] Failed to save page history:', error)
    }
  }

  function schedulePersist(delayMs = 1000) {
    if (persistPromise) return
    persistPromise = (async () => {
      try {
        await persist(delayMs)
      } finally {
        persistPromise = null
      }
    })()
  }

  function getSavedPage(path: string | null | undefined, fallback = 1) {
    if (!path) return fallback
    const entry = pageHistory.value[path]
    return entry && entry.currentPage > 0 ? entry.currentPage : fallback
  }

  function rememberPage(path: string, pageNumber: number) {
    pageHistory.value[path] = {
      currentPage: Math.max(1, Math.floor(pageNumber)),
      lastViewed: Date.now(),
    }
    schedulePersist()
  }

  function removePage(path: string) {
    if (!(path in pageHistory.value)) return
    delete pageHistory.value[path]
    schedulePersist()
  }

  onMounted(async () => {
    try {
      const state = await loadAppState()
      if (state?.pageHistory) {
        pageHistory.value = { ...state.pageHistory }
        options.onLoaded?.(pageHistory.value)
      }
    } catch (error) {
      console.warn('[usePageHistory] Failed to load page history:', error)
    } finally {
      pageHistoryLoaded.value = true
    }
  })

  return {
    pageHistory,
    pageHistoryLoaded,
    getSavedPage,
    rememberPage,
    removePage,
    persist: schedulePersist,
  }
}
