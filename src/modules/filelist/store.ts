import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { FileItem } from '@/components/FileList/types'
import { readLocalJson, writeLocalJson } from '@/modules/persist/local'
import { createBookmark, ensureBookmarkedAccess, stopAccess } from '@/modules/bookmark/service'

const STORAGE_KEY = 'recent-files'

function baseName(p: string) {
  const parts = p.split(/[\\\/]/)
  return parts[parts.length - 1] || p
}

function guessFileType(path: string): 'pdf' | 'image' | 'unknown' {
  const lower = path.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(lower)) return 'image'
  return 'unknown'
}

async function loadFromStorage(): Promise<FileItem[]> {
  try {
    const arr = await readLocalJson<Array<{ path: string; name?: string; id?: string; lastPage?: number; type?: 'pdf' | 'image' | 'unknown'; bookmark?: string }>>(STORAGE_KEY, [])
    const seen = new Set<string>()
    const items: FileItem[] = []
    for (const e of arr) {
      if (!e || !e.path) continue
      if (seen.has(e.path)) continue
      seen.add(e.path)
      const name = e.name || baseName(e.path)
      const lastPage = (typeof e.lastPage === 'number' && e.lastPage > 0) ? Math.floor(e.lastPage) : undefined
      const type = e.type || guessFileType(e.path)
      items.push({ id: e.path, name, path: e.path, lastPage, type, bookmark: e.bookmark })
    }
    return items
  } catch {
    return []
  }
}

export const useFileListStore = defineStore('filelist', () => {
  const items = ref<FileItem[]>([])
  const ready = ref(false)

  // 初始載入
  ;(async () => {
    items.value = await loadFromStorage()
    ready.value = true
  })()

  // Debounced persistence
  let timer: number | null = null
  function schedulePersist() {
    if (timer) { clearTimeout(timer); timer = null }
    timer = window.setTimeout(() => {
      void writeLocalJson(STORAGE_KEY, items.value)
      timer = null
    }, 200)
  }

  watch(items, () => schedulePersist(), { deep: true })

  function whenReady(): Promise<void> {
    if (ready.value) return Promise.resolve()
    return new Promise((resolve) => {
      const stop = watch(ready, (v) => {
        if (v) { stop(); resolve() }
      })
    })
  }

  function upsertToTop(path: string): FileItem {
    const idx = items.value.findIndex(i => i.path === path)
    if (idx >= 0) {
      const [existing] = items.value.splice(idx, 1)
      items.value.unshift(existing)
      return existing
    }
    const type = guessFileType(path)
    const it: FileItem = { id: path, name: baseName(path), path, type }
    items.value.unshift(it)
    return it
  }

  // Create bookmark for a file item (call after file is successfully opened)
  async function createBookmarkFor(item: FileItem): Promise<void> {
    if (item.bookmark) return // already has bookmark
    const bm = await createBookmark(item.path)
    if (bm) {
      item.bookmark = bm
      schedulePersist()
    }
  }

  // Ensure file access via security-scoped bookmark (macOS sandbox)
  // Returns the accessible path (may differ if file was moved)
  async function ensureAccess(item: FileItem): Promise<string> {
    const nextPath = await ensureBookmarkedAccess(item)
    if (nextPath !== item.path || nextPath !== item.id) {
      item.path = nextPath
      item.name = baseName(nextPath)
      item.id = nextPath
      item.type = guessFileType(nextPath)
      schedulePersist()
    }
    return nextPath
  }

  function addPaths(paths: string[]) {
    // Insert in reverse so the first path ends up on top
    for (let i = paths.length - 1; i >= 0; i--) upsertToTop(paths[i])
  }

  function add(path: string) {
    upsertToTop(path)
  }

  function remove(path: string) {
    const idx = items.value.findIndex(i => i.path === path)
    if (idx >= 0) items.value.splice(idx, 1)
  }

  function clear() {
    items.value = []
  }

  function setLastPage(path: string, page: number) {
    if (!Number.isFinite(page)) return
    const p = Math.max(1, Math.floor(page))
    const it = items.value.find(i => i.path === path)
    if (it) it.lastPage = p
  }

  function getLastPage(path: string): number | undefined {
    const it = items.value.find(i => i.path === path)
    return it?.lastPage
  }

  function reorder(newItems: FileItem[]) {
    items.value = newItems
  }

  return {
    items,
    ready,
    whenReady,
    add,
    addPaths,
    remove,
    clear,
    reorder,
    setLastPage,
    getLastPage,
    ensureAccess,
    createBookmarkFor,
    stopAccess,
  }
})
