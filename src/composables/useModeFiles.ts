import { ref, computed, type Ref } from 'vue'
import type { Mode, PdfFile } from '../types/pdf'

export function useModeFiles(mode: Ref<Mode>) {
  // independent lists per mode
  const filesView = ref<PdfFile[]>([])
  const filesConvert = ref<PdfFile[]>([])
  const filesCompose = ref<PdfFile[]>([])

  // independent active ids per mode
  const activeViewId = ref<string | null>(null)
  const activeConvertId = ref<string | null>(null)
  const activeComposeId = ref<string | null>(null)

  const currentFiles = computed(() => {
    switch (mode.value) {
      case 'view': return filesView.value
      case 'convert': return filesConvert.value
      case 'compose': return filesCompose.value
    }
  })

  const currentActiveId = computed(() => {
    switch (mode.value) {
      case 'view': return activeViewId.value
      case 'convert': return activeConvertId.value
      case 'compose': return activeComposeId.value
    }
  })

  const activeFile = computed(() => currentFiles.value.find(f => f.id === currentActiveId.value) || null)

  function getListRef(m?: Mode) {
    const mm = m ?? mode.value
    return mm === 'view' ? filesView : mm === 'convert' ? filesConvert : filesCompose
  }

  function hasPath(m: Mode, path: string) {
    return getListRef(m).value.some(f => f.path === path)
  }

  function setActiveId(id: string | null, m?: Mode) {
    const mm = m ?? mode.value
    if (mm === 'view') {
      console.log('[useModeFiles] Setting activeViewId from', activeViewId.value, 'to', id)
      activeViewId.value = id
    }
    else if (mm === 'convert') activeConvertId.value = id
    else activeComposeId.value = id
  }

  function addTo(m: Mode, file: Pick<PdfFile, 'path' | 'name'>) {
    const list = getListRef(m)
    if (!hasPath(m, file.path)) {
      const id = Math.random().toString(36).slice(2, 9)
      // 使用 unshift 將新檔案加到列表開頭
      list.value.unshift({ id, path: file.path, name: file.name })
      // 如果是當前模式，自動選擇新增的檔案
      if (m === mode.value) {
        setActiveId(id, m)
      }
      return id
    }
    // 如果檔案已存在，找到它的 ID 並選擇它
    const existingFile = list.value.find(f => f.path === file.path)
    if (existingFile && m === mode.value) {
      setActiveId(existingFile.id, m)
      return existingFile.id
    }
    return null
  }

  function removeFrom(m: Mode, id: string) {
    const list = getListRef(m)
    const idx = list.value.findIndex(f => f.id === id)
    if (idx >= 0) list.value.splice(idx, 1)
    if (m === mode.value && currentActiveId.value === id) setActiveId(null, m)
  }

  function removeFromCurrent(id: string) { removeFrom(mode.value, id) }

  return {
    // per-mode lists and active ids (exposed for persistence if needed)
    filesView, filesConvert, filesCompose,
    activeViewId, activeConvertId, activeComposeId,
    // current derived states
    currentFiles, currentActiveId, activeFile,
    // helpers
    getListRef, setActiveId, hasPath, addTo, removeFrom, removeFromCurrent,
  }
}
