import { computed, ref, type Ref } from 'vue'
import type { Mode, PdfFile } from '../types/pdf'

export function useModeFiles(mode: Ref<Mode>) {
  const fileLists: Record<Mode, Ref<PdfFile[]>> = {
    view: ref<PdfFile[]>([]),
    convert: ref<PdfFile[]>([]),
    compose: ref<PdfFile[]>([]),
  }

  const activeIds: Record<Mode, Ref<string | null>> = {
    view: ref<string | null>(null),
    convert: ref<string | null>(null),
    compose: ref<string | null>(null),
  }

  const currentFiles = computed(() => fileLists[mode.value].value)
  const currentActiveId = computed(() => activeIds[mode.value].value)
  const activeFile = computed(() => currentFiles.value.find(file => file.id === currentActiveId.value) ?? null)

  function getListRef(targetMode?: Mode) {
    const resolved = targetMode ?? mode.value
    return fileLists[resolved]
  }

  function getActiveRef(targetMode?: Mode) {
    const resolved = targetMode ?? mode.value
    return activeIds[resolved]
  }

  function hasPath(targetMode: Mode, path: string) {
    return fileLists[targetMode].value.some(file => file.path === path)
  }

  function setActiveId(id: string | null, targetMode?: Mode) {
    getActiveRef(targetMode).value = id
  }

  function addTo(targetMode: Mode, file: Pick<PdfFile, 'path' | 'name' | 'kind'>) {
    const listRef = fileLists[targetMode]
    const existing = listRef.value.find(item => item.path === file.path)
    if (existing) {
      if (targetMode === mode.value) setActiveId(existing.id, targetMode)
      return existing.id
    }

    const id = Math.random().toString(36).slice(2, 9)
    const next: PdfFile = { id, path: file.path, name: file.name, kind: file.kind }
    listRef.value = [next, ...listRef.value]

    if (targetMode === mode.value) setActiveId(id, targetMode)
    return id
  }

  function removeFrom(targetMode: Mode, id: string) {
    const listRef = fileLists[targetMode]
    const next = listRef.value.filter(file => file.id !== id)
    if (next.length !== listRef.value.length) {
      listRef.value = next
      const activeRef = activeIds[targetMode]
      if (activeRef.value === id) activeRef.value = null
    }
  }

  function removeFromCurrent(id: string) {
    removeFrom(mode.value, id)
  }

  return {
    filesView: fileLists.view,
    filesConvert: fileLists.convert,
    filesCompose: fileLists.compose,
    activeViewId: activeIds.view,
    activeConvertId: activeIds.convert,
    activeComposeId: activeIds.compose,
    currentFiles,
    currentActiveId,
    activeFile,
    getListRef,
    setActiveId,
    hasPath,
    addTo,
    removeFrom,
    removeFromCurrent,
  }
}
