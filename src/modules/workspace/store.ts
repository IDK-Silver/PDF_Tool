import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { open, confirm as confirmDialog } from '@tauri-apps/plugin-dialog'
import type { FileItem } from '@/components/FileList/types'
import { readLocalJson, writeLocalJson } from '@/modules/persist/local'
import { createBookmarkForState, ensureBookmarkedAccess, stopAccess } from '@/modules/bookmark/service'
import { createMediaSession, type MediaSession } from '@/modules/media/session'
import { workspaceDeleteFile, workspaceListMediaFiles, workspaceMoveFile } from './service'
import type { WorkspaceFileEntry, WorkspaceItem, WorkspacePaneKey, WorkspacePaneState } from './types'

const STORAGE_KEY = 'workspaces'

function createPaneState(): WorkspacePaneState {
  return {
    folderPath: null,
    folderName: null,
    bookmark: undefined,
    order: [],
    selectedPath: null,
  }
}

function createWorkspaceName(index: number): string {
  return `工作台 ${index}`
}

function createWorkspace(index: number): WorkspaceItem {
  return {
    id: `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: createWorkspaceName(index),
    activePane: 'left',
    left: createPaneState(),
    right: createPaneState(),
  }
}

function clonePaneState(input?: Partial<WorkspacePaneState> | null): WorkspacePaneState {
  return {
    folderPath: input?.folderPath ?? null,
    folderName: input?.folderName ?? null,
    bookmark: input?.bookmark,
    order: Array.isArray(input?.order) ? input!.order.filter((value): value is string => typeof value === 'string') : [],
    selectedPath: input?.selectedPath ?? null,
  }
}

function normalizeWorkspace(raw: Partial<WorkspaceItem> | null | undefined, index: number): WorkspaceItem {
  return {
    id: typeof raw?.id === 'string' ? raw.id : `workspace-${index}`,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : createWorkspaceName(index + 1),
    activePane: raw?.activePane === 'right' ? 'right' : 'left',
    left: clonePaneState(raw?.left),
    right: clonePaneState(raw?.right),
  }
}

function paneLabel(pane: WorkspacePaneKey): WorkspacePaneKey {
  return pane
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const items = ref<WorkspaceItem[]>([])
  const currentId = ref<string | null>(null)
  const ready = ref(false)
  const paneFiles = reactive<Record<WorkspacePaneKey, WorkspaceFileEntry[]>>({
    left: [],
    right: [],
  })
  const sessions: Record<WorkspacePaneKey, MediaSession> = {
    left: createMediaSession(),
    right: createMediaSession(),
  }

  const currentWorkspace = computed(() => items.value.find(item => item.id === currentId.value) ?? null)

  function getPaneState(pane: WorkspacePaneKey): WorkspacePaneState | null {
    const workspace = currentWorkspace.value
    if (!workspace) return null
    return pane === 'left' ? workspace.left : workspace.right
  }

  function getPaneSession(pane: WorkspacePaneKey): MediaSession {
    return sessions[pane]
  }

  function getPaneItems(pane: WorkspacePaneKey): WorkspaceFileEntry[] {
    return paneFiles[pane]
  }

  async function stopWorkspaceAccess(workspace: WorkspaceItem | null) {
    if (!workspace) return
    for (const pane of ['left', 'right'] as WorkspacePaneKey[]) {
      const state = pane === 'left' ? workspace.left : workspace.right
      if (state.folderPath) {
        await stopAccess(state.folderPath)
      }
    }
  }

  function baseName(path: string | null | undefined): string | null {
    if (!path) return null
    const parts = path.split(/[\\/]/)
    return parts[parts.length - 1] || path
  }

  async function persist() {
    await writeLocalJson(STORAGE_KEY, {
      currentId: currentId.value,
      items: items.value,
    })
  }

  let persistTimer: number | null = null
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
      void persist()
      persistTimer = null
    }, 200)
  }

  watch(items, () => schedulePersist(), { deep: true })
  watch(currentId, () => schedulePersist())

  async function loadFromStorage() {
    const stored = await readLocalJson<{ currentId?: string | null; items?: WorkspaceItem[] }>(STORAGE_KEY, {})
    const list = Array.isArray(stored.items) ? stored.items.map((item, index) => normalizeWorkspace(item, index)) : []
    items.value = list.length > 0 ? list : [createWorkspace(1)]
    currentId.value = items.value.some(item => item.id === stored.currentId) ? stored.currentId ?? items.value[0].id : items.value[0].id
    ready.value = true
    await loadWorkspaceSessions()
  }

  async function whenReady(): Promise<void> {
    if (ready.value) return
    await new Promise<void>((resolve) => {
      const stop = watch(ready, (value) => {
        if (!value) return
        stop()
        resolve()
      })
    })
  }

  function setActivePane(pane: WorkspacePaneKey) {
    const workspace = currentWorkspace.value
    if (!workspace) return
    workspace.activePane = pane
  }

  async function clearSession(pane: WorkspacePaneKey) {
    const session = sessions[pane]
    try { await session.closeDoc() } catch (_) {}
    session.clear()
  }

  async function clearPaneSession(pane: WorkspacePaneKey) {
    paneFiles[pane].splice(0, paneFiles[pane].length)
    await clearSession(pane)
  }

  async function openPanePath(pane: WorkspacePaneKey, path: string | null) {
    const session = sessions[pane]
    if (!path) {
      await clearPaneSession(pane)
      return
    }

    const item = paneFiles[pane].find(entry => entry.path === path)
    if (!item) {
      await clearSession(pane)
      return
    }

    session.selected = item
    const result = await session.loadDescriptor(path)
    if (result !== 'success') {
      await clearSession(pane)
      return
    }
  }

  function mergeOrder(existing: string[], nextItems: WorkspaceFileEntry[]): string[] {
    const known = new Map(nextItems.map(item => [item.path, item]))
    const merged = existing.filter(path => known.has(path))
    for (const item of nextItems) {
      if (!merged.includes(item.path)) merged.push(item.path)
    }
    return merged
  }

  async function ensurePaneFolderAccess(paneState: WorkspacePaneState): Promise<string> {
    if (!paneState.folderPath) return ''
    const target = {
      path: paneState.folderPath,
      bookmark: paneState.bookmark,
    }
    const accessPath = await ensureBookmarkedAccess(target)
    paneState.folderPath = accessPath
    paneState.bookmark = target.bookmark
    return accessPath
  }

  async function createPaneFolderBookmark(paneState: WorkspacePaneState): Promise<void> {
    if (!paneState.folderPath) return
    const target = {
      path: paneState.folderPath,
      bookmark: paneState.bookmark,
    }
    await createBookmarkForState(target)
    paneState.bookmark = target.bookmark
  }

  async function refreshPane(pane: WorkspacePaneKey, fallbackIndex?: number) {
    const paneState = getPaneState(pane)
    if (!paneState || !paneState.folderPath) {
      await clearPaneSession(pane)
      return
    }

    const accessPath = await ensurePaneFolderAccess(paneState)
    paneState.folderPath = accessPath
    paneState.folderName = baseName(accessPath)

    const listed = await workspaceListMediaFiles(accessPath)
    paneState.order = mergeOrder(paneState.order, listed)
    const ordered = paneState.order
      .map(path => listed.find(item => item.path === path) ?? null)
      .filter((item): item is WorkspaceFileEntry => !!item)

    paneFiles[pane].splice(0, paneFiles[pane].length, ...ordered)

    if (!paneState.selectedPath || !ordered.some(item => item.path === paneState.selectedPath)) {
      if (typeof fallbackIndex === 'number' && ordered.length > 0) {
        const idx = Math.min(Math.max(0, fallbackIndex), ordered.length - 1)
        paneState.selectedPath = ordered[idx].path
      } else {
        paneState.selectedPath = ordered[0]?.path ?? null
      }
    }

    await openPanePath(pane, paneState.selectedPath)
  }

  async function loadWorkspaceSessions() {
    await clearPaneSession('left')
    await clearPaneSession('right')
    await refreshPane('left')
    await refreshPane('right')
  }

  async function selectWorkspace(id: string) {
    if (currentId.value === id) return
    const previous = currentWorkspace.value
    await stopWorkspaceAccess(previous)
    currentId.value = id
    await loadWorkspaceSessions()
  }

  async function addWorkspace() {
    const previous = currentWorkspace.value
    await stopWorkspaceAccess(previous)
    const next = createWorkspace(items.value.length + 1)
    items.value.unshift(next)
    currentId.value = next.id
    await loadWorkspaceSessions()
  }

  function renameCurrentWorkspace(name: string) {
    const workspace = currentWorkspace.value
    const nextName = name.trim()
    if (!workspace || !nextName) return
    workspace.name = nextName
  }

  async function removeWorkspace(id: string) {
    if (items.value.length <= 1) {
      const only = items.value[0]
      if (!only) return
      await stopWorkspaceAccess(only)
      only.name = createWorkspaceName(1)
      only.left = createPaneState()
      only.right = createPaneState()
      only.activePane = 'left'
      currentId.value = only.id
      await loadWorkspaceSessions()
      return
    }

    const index = items.value.findIndex(item => item.id === id)
    if (index < 0) return
    const [removed] = items.value.splice(index, 1)
    for (const pane of ['left', 'right'] as WorkspacePaneKey[]) {
      const state = pane === 'left' ? removed.left : removed.right
      if (state.folderPath) {
        await stopAccess(state.folderPath)
      }
    }

    if (currentId.value === id) {
      currentId.value = items.value[0]?.id ?? null
      await loadWorkspaceSessions()
    }
  }

  async function pickFolder(pane: WorkspacePaneKey) {
    const selected = await open({
      directory: true,
      multiple: false,
      recursive: true,
    })
    if (!selected || Array.isArray(selected)) return
    await setPaneFolder(pane, selected)
  }

  async function setPaneFolder(pane: WorkspacePaneKey, path: string) {
    const paneState = getPaneState(pane)
    if (!paneState) return

    if (paneState.folderPath && paneState.folderPath !== path) {
      await stopAccess(paneState.folderPath)
    }

    paneState.folderPath = path
    paneState.folderName = baseName(path)
    paneState.order = []
    paneState.selectedPath = null
    paneState.bookmark = undefined
    await createPaneFolderBookmark(paneState)
    setActivePane(pane)
    await refreshPane(pane)
  }

  async function selectPaneItem(pane: WorkspacePaneKey, path: string) {
    const paneState = getPaneState(pane)
    if (!paneState) return
    paneState.selectedPath = path
    setActivePane(pane)
    await openPanePath(pane, path)
  }

  function reorderPaneItems(pane: WorkspacePaneKey, nextItems: FileItem[]) {
    const paneState = getPaneState(pane)
    if (!paneState) return
    const nextOrder = nextItems
      .map(item => item.path)
      .filter((path): path is string => typeof path === 'string')
    paneState.order = nextOrder
    const mapped = nextOrder
      .map(path => paneFiles[pane].find(item => item.path === path) ?? null)
      .filter((item): item is WorkspaceFileEntry => !!item)
    paneFiles[pane].splice(0, paneFiles[pane].length, ...mapped)
  }

  function reorderWorkspaces(nextItems: FileItem[]) {
    const idOrder = nextItems.map(item => item.id)
    const next = idOrder
      .map(id => items.value.find(item => item.id === id) ?? null)
      .filter((item): item is WorkspaceItem => !!item)
    items.value = next
  }

  function getOtherPane(pane: WorkspacePaneKey): WorkspacePaneKey {
    return pane === 'left' ? 'right' : 'left'
  }

  async function moveSelectedFile(sourcePane: WorkspacePaneKey, overwrite = false): Promise<'success' | 'needs_overwrite' | 'skipped'> {
    const sourceState = getPaneState(sourcePane)
    const targetPane = getOtherPane(sourcePane)
    const targetState = getPaneState(targetPane)
    if (!sourceState?.selectedPath || !targetState?.folderPath) return 'skipped'
    if (targetState.folderPath === sourceState.folderPath) return 'skipped'

    const sourceList = paneFiles[sourcePane]
    const removedIndex = sourceList.findIndex(item => item.path === sourceState.selectedPath)

    let movedToPath: string
    try {
      const result = await workspaceMoveFile({
        srcPath: sourceState.selectedPath,
        destDir: targetState.folderPath,
        overwrite,
      })
      movedToPath = result.path
    } catch (error: any) {
      const code = typeof error?.code === 'string' ? error.code : ''
      if (code === 'target_exists') return 'needs_overwrite'
      throw error
    }

    await refreshPane(sourcePane, removedIndex >= 0 ? removedIndex : 0)
    // Pre-set the target's selection to the moved file so refreshPane keeps it.
    targetState.selectedPath = movedToPath
    await refreshPane(targetPane)
    setActivePane(targetPane)
    return 'success'
  }

  async function deleteSelectedFile(pane: WorkspacePaneKey) {
    const paneState = getPaneState(pane)
    if (!paneState?.selectedPath) return false

    const ok = await confirmDialog(`確定要把「${baseName(paneState.selectedPath) || paneState.selectedPath}」移到垃圾桶？`, {
      title: '移到垃圾桶',
      okLabel: '移到垃圾桶',
      cancelLabel: '取消',
    })
    if (!ok) return false

    const list = paneFiles[pane]
    const removedIndex = list.findIndex(item => item.path === paneState.selectedPath)

    await workspaceDeleteFile(paneState.selectedPath)
    await refreshPane(pane, removedIndex >= 0 ? removedIndex : 0)
    return true
  }

  async function navigatePaneByOffset(pane: WorkspacePaneKey, offset: number) {
    const paneState = getPaneState(pane)
    const list = paneFiles[pane]
    if (!paneState || list.length === 0) return

    const currentIndex = Math.max(0, list.findIndex(item => item.path === paneState.selectedPath))
    const nextIndex = Math.min(list.length - 1, Math.max(0, currentIndex + offset))
    const next = list[nextIndex]
    if (!next) return
    await selectPaneItem(pane, next.path)
  }

  async function navigateActivePane(offset: number) {
    const workspace = currentWorkspace.value
    if (!workspace) return
    await navigatePaneByOffset(workspace.activePane, offset)
  }

  ;(async () => {
    await loadFromStorage()
  })()

  return {
    items,
    currentId,
    currentWorkspace,
    ready,
    whenReady,
    getPaneState,
    getPaneSession,
    getPaneItems,
    selectWorkspace,
    addWorkspace,
    renameCurrentWorkspace,
    removeWorkspace,
    reorderWorkspaces,
    pickFolder,
    setPaneFolder,
    refreshPane,
    selectPaneItem,
    reorderPaneItems,
    moveSelectedFile,
    deleteSelectedFile,
    setActivePane,
    navigatePaneByOffset,
    navigateActivePane,
    paneLabel,
  }
})
