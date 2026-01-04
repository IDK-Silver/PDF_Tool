import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AnnotationObject, AnnotationState, ToolType, ToolSettings } from './types'
import { defaultToolSettings } from './types'
import { useMediaStore } from '@/modules/media/store'

function generateId(): string {
  return crypto.randomUUID()
}

export const useAnnotationStore = defineStore('annotation', () => {
  const media = useMediaStore()

  // Current state
  const objects = ref<Record<number, AnnotationObject[]>>({})
  const selectedIds = ref<string[]>([])
  const activeTool = ref<ToolType | null>(null)
  const toolSettings = ref<ToolSettings>({ ...defaultToolSettings })
  const pendingObject = ref<AnnotationObject | null>(null)

  // History for undo/redo
  const history = ref<AnnotationState[]>([])
  const historyIndex = ref(-1)
  const MAX_HISTORY = 50

  // Get current objects state (only what needs to be in history)
  function getObjectsSnapshot(): Record<number, AnnotationObject[]> {
    return JSON.parse(JSON.stringify(objects.value))
  }

  // Computed
  const currentState = computed<AnnotationState>(() => ({
    objects: objects.value,
    selectedIds: selectedIds.value,
    activeTool: activeTool.value,
    toolSettings: toolSettings.value,
    pendingObject: pendingObject.value,
  }))

  const selectedObjects = computed(() => {
    const result: AnnotationObject[] = []
    for (const pageObjs of Object.values(objects.value)) {
      for (const obj of pageObjs) {
        if (selectedIds.value.includes(obj.id)) {
          result.push(obj)
        }
      }
    }
    return result
  })

  const hasSelection = computed(() => selectedIds.value.length > 0)

  const hasAnnotations = computed(() => {
    return Object.values(objects.value).some(pageObjs => pageObjs.length > 0)
  })

  // Get annotations for a specific page
  function getPageAnnotations(pageIndex: number): AnnotationObject[] {
    return objects.value[pageIndex] || []
  }

  // History management - only track objects state
  // History stores snapshots of objects, not full AnnotationState

  // Save state before making changes
  function saveStateBeforeChange() {
    // Initialize history with current state if empty
    if (history.value.length === 0) {
      history.value = [{ objects: getObjectsSnapshot() } as AnnotationState]
      historyIndex.value = 0
    }
  }

  // Push state after making changes
  function pushState() {
    saveStateBeforeChange()

    // Truncate redo history (remove states after current index)
    history.value = history.value.slice(0, historyIndex.value + 1)

    // Push current state
    history.value.push({ objects: getObjectsSnapshot() } as AnnotationState)

    // Limit history length
    if (history.value.length > MAX_HISTORY) {
      history.value.shift()
    } else {
      historyIndex.value++
    }
  }

  function restoreState(state: AnnotationState) {
    objects.value = JSON.parse(JSON.stringify(state.objects))
    // Clear selection when restoring
    selectedIds.value = []
    pendingObject.value = null
  }

  // Actions
  function addAnnotation(obj: Omit<AnnotationObject, 'id'>) {
    // Save state before change (initializes history if needed)
    saveStateBeforeChange()

    // Execute operation
    const annotation: AnnotationObject = {
      ...obj,
      id: generateId(),
    }
    if (!objects.value[annotation.pageIndex]) {
      objects.value[annotation.pageIndex] = []
    }
    objects.value[annotation.pageIndex].push(annotation)

    // Save state after change
    pushState()
    media.markDirty()
    return annotation
  }

  function updateAnnotation(id: string, updates: Partial<AnnotationObject>) {
    // Save state before change
    saveStateBeforeChange()

    for (const pageObjs of Object.values(objects.value)) {
      const idx = pageObjs.findIndex(o => o.id === id)
      if (idx !== -1) {
        pageObjs[idx] = { ...pageObjs[idx], ...updates }
        // Save state after change
        pushState()
        media.markDirty()
        return
      }
    }
  }

  function deleteAnnotation(id: string) {
    // Save state before change
    saveStateBeforeChange()

    for (const [_pageIndex, pageObjs] of Object.entries(objects.value)) {
      const idx = pageObjs.findIndex(o => o.id === id)
      if (idx !== -1) {
        pageObjs.splice(idx, 1)
        selectedIds.value = selectedIds.value.filter(sid => sid !== id)
        // Save state after change
        pushState()
        media.markDirty()
        return
      }
    }
  }

  function deleteSelected() {
    if (selectedIds.value.length === 0) return

    // Save state before change
    saveStateBeforeChange()

    for (const id of [...selectedIds.value]) {
      for (const pageObjs of Object.values(objects.value)) {
        const idx = pageObjs.findIndex(o => o.id === id)
        if (idx !== -1) {
          pageObjs.splice(idx, 1)
          break
        }
      }
    }
    selectedIds.value = []

    // Save state after change
    pushState()
    media.markDirty()
  }

  function select(id: string, append = false) {
    if (append) {
      if (!selectedIds.value.includes(id)) {
        selectedIds.value.push(id)
      }
    } else {
      selectedIds.value = [id]
    }
  }

  function deselect(id: string) {
    selectedIds.value = selectedIds.value.filter(sid => sid !== id)
  }

  function clearSelection() {
    selectedIds.value = []
  }

  function setActiveTool(tool: ToolType | null) {
    activeTool.value = tool
    if (tool !== 'select') {
      clearSelection()
    }
    pendingObject.value = null
  }

  function setPendingObject(obj: AnnotationObject | null) {
    pendingObject.value = obj
  }

  function updateToolSettings(updates: Partial<ToolSettings>) {
    toolSettings.value = { ...toolSettings.value, ...updates }
  }

  function undo() {
    if (historyIndex.value > 0) {
      historyIndex.value--
      restoreState(history.value[historyIndex.value])
      // Mark dirty if we have changes, or clean if back to initial
      if (historyIndex.value > 0 || Object.keys(objects.value).some(k => objects.value[Number(k)]?.length > 0)) {
        media.markDirty()
      }
    }
  }

  function redo() {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++
      restoreState(history.value[historyIndex.value])
      media.markDirty()
    }
  }

  const canUndo = computed(() => historyIndex.value > 0)

  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  // Reset state when switching documents
  function reset() {
    objects.value = {}
    selectedIds.value = []
    activeTool.value = null
    pendingObject.value = null
    history.value = []
    historyIndex.value = -1
  }

  // Get all annotations for embedding into PDF
  function getAllAnnotations(): AnnotationObject[] {
    const result: AnnotationObject[] = []
    for (const pageObjs of Object.values(objects.value)) {
      result.push(...pageObjs)
    }
    return result
  }

  return {
    // State
    objects,
    selectedIds,
    activeTool,
    toolSettings,
    pendingObject,

    // Computed
    currentState,
    selectedObjects,
    hasSelection,
    hasAnnotations,

    // Getters
    getPageAnnotations,
    getAllAnnotations,
    canUndo,
    canRedo,

    // Actions
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    deleteSelected,
    select,
    deselect,
    clearSelection,
    setActiveTool,
    setPendingObject,
    updateToolSettings,
    undo,
    redo,
    reset,
  }
})
