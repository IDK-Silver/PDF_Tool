import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AnnotationObject, AnnotationState, ToolType, ToolSettings } from './types'
import { useMediaStore } from '@/modules/media/store'

const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  fill: '#ffff00',
  stroke: '#000000',
  strokeWidth: 2,
  opacity: 1,
}

function generateId(): string {
  return crypto.randomUUID()
}

function cloneState(state: AnnotationState): AnnotationState {
  return JSON.parse(JSON.stringify(state))
}

export const useAnnotationStore = defineStore('annotation', () => {
  const media = useMediaStore()

  // Current state
  const objects = ref<Record<number, AnnotationObject[]>>({})
  const selectedIds = ref<string[]>([])
  const activeTool = ref<ToolType | null>(null)
  const toolSettings = ref<ToolSettings>({ ...DEFAULT_TOOL_SETTINGS })
  const pendingObject = ref<AnnotationObject | null>(null)

  // History for undo/redo
  const history = ref<AnnotationState[]>([])
  const historyIndex = ref(-1)
  const MAX_HISTORY = 50

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

  // Get annotations for a specific page
  function getPageAnnotations(pageIndex: number): AnnotationObject[] {
    return objects.value[pageIndex] || []
  }

  // History management
  function pushState() {
    // Truncate redo history
    history.value = history.value.slice(0, historyIndex.value + 1)
    history.value.push(cloneState(currentState.value))
    if (history.value.length > MAX_HISTORY) {
      history.value.shift()
    } else {
      historyIndex.value++
    }
  }

  function restoreState(state: AnnotationState) {
    objects.value = state.objects
    selectedIds.value = state.selectedIds
    // Don't restore activeTool and toolSettings - keep current
    pendingObject.value = state.pendingObject
  }

  // Actions
  function addAnnotation(obj: Omit<AnnotationObject, 'id'>) {
    pushState()
    const annotation: AnnotationObject = {
      ...obj,
      id: generateId(),
    }
    if (!objects.value[annotation.pageIndex]) {
      objects.value[annotation.pageIndex] = []
    }
    objects.value[annotation.pageIndex].push(annotation)
    media.markDirty()
    return annotation
  }

  function updateAnnotation(id: string, updates: Partial<AnnotationObject>) {
    pushState()
    for (const pageObjs of Object.values(objects.value)) {
      const idx = pageObjs.findIndex(o => o.id === id)
      if (idx !== -1) {
        pageObjs[idx] = { ...pageObjs[idx], ...updates }
        media.markDirty()
        return
      }
    }
  }

  function deleteAnnotation(id: string) {
    pushState()
    for (const [_pageIndex, pageObjs] of Object.entries(objects.value)) {
      const idx = pageObjs.findIndex(o => o.id === id)
      if (idx !== -1) {
        pageObjs.splice(idx, 1)
        selectedIds.value = selectedIds.value.filter(sid => sid !== id)
        media.markDirty()
        return
      }
    }
  }

  function deleteSelected() {
    if (selectedIds.value.length === 0) return
    pushState()
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
      restoreState(cloneState(history.value[historyIndex.value]))
    }
  }

  function redo() {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++
      restoreState(cloneState(history.value[historyIndex.value]))
    }
  }

  function canUndo() {
    return historyIndex.value > 0
  }

  function canRedo() {
    return historyIndex.value < history.value.length - 1
  }

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
