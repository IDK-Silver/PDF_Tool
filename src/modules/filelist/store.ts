import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { FileItem } from '@/components/FileList/types'

const LS_KEY = 'kano_recent_files_v1'

function baseName(p: string) {
  const parts = p.split(/[\\\/]/)
  return parts[parts.length - 1] || p
}

function loadFromStorage(): FileItem[] {
  try {
    const txt = localStorage.getItem(LS_KEY)
    if (!txt) return []
    const arr = JSON.parse(txt) as Array<{ path: string; name?: string; id?: string; lastPage?: number }>
    const seen = new Set<string>()
    const items: FileItem[] = []
    for (const e of arr) {
      if (!e || !e.path) continue
      if (seen.has(e.path)) continue
      seen.add(e.path)
      const name = e.name || baseName(e.path)
      const lastPage = (typeof e.lastPage === 'number' && e.lastPage > 0) ? Math.floor(e.lastPage) : undefined
      items.push({ id: e.path, name, path: e.path, lastPage })
    }
    return items
  } catch {
    return []
  }
}

export const useFileListStore = defineStore('filelist', () => {
  const items = ref<FileItem[]>(loadFromStorage())

  // Debounced persistence
  let timer: number | null = null
  function schedulePersist() {
    if (timer) { clearTimeout(timer); timer = null }
    timer = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(items.value)) } catch {}
      timer = null
    }, 200)
  }

  watch(items, () => schedulePersist(), { deep: true })

  function upsertToTop(path: string): FileItem {
    const idx = items.value.findIndex(i => i.path === path)
    if (idx >= 0) {
      const [existing] = items.value.splice(idx, 1)
      items.value.unshift(existing)
      return existing
    }
    const it: FileItem = { id: path, name: baseName(path), path }
    items.value.unshift(it)
    return it
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

  return {
    items,
    add,
    addPaths,
    remove,
    clear,
    setLastPage,
    getLastPage,
  }
})
