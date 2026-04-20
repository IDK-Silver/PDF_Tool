import { invoke } from '@tauri-apps/api/core'

export interface BookmarkResolveResult {
  path: string
  is_stale: boolean
}

export interface BookmarkedPathState {
  path: string
  bookmark?: string
}

export async function createBookmark(path: string): Promise<string | null> {
  try {
    return await invoke<string>('bookmark_create', { path })
  } catch (e) {
    console.warn('[bookmark] Failed to create bookmark:', e)
    return null
  }
}

export async function resolveBookmark(bookmarkData: string): Promise<BookmarkResolveResult | null> {
  try {
    return await invoke<BookmarkResolveResult>('bookmark_resolve', { bookmarkData })
  } catch (e) {
    console.warn('[bookmark] Failed to resolve bookmark:', e)
    return null
  }
}

export async function stopAccess(path: string): Promise<void> {
  try {
    await invoke('bookmark_stop_access', { path })
  } catch (e) {
    console.warn('[bookmark] Failed to stop bookmark access:', e)
  }
}

export async function createBookmarkForState(state: BookmarkedPathState): Promise<void> {
  if (!state.path || state.bookmark) return
  const bookmark = await createBookmark(state.path)
  if (bookmark) state.bookmark = bookmark
}

export async function ensureBookmarkedAccess(state: BookmarkedPathState): Promise<string> {
  if (!state.bookmark) return state.path

  const result = await resolveBookmark(state.bookmark)
  if (!result) {
    state.bookmark = undefined
    return state.path
  }

  if (result.path !== state.path) {
    state.path = result.path
  }

  if (result.is_stale) {
    const next = await createBookmark(result.path)
    if (next) state.bookmark = next
  }

  return state.path
}
