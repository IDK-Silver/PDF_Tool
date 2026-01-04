import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AnnotationObject, AnnotationState, ToolType, ToolSettings, Point } from './types'
import { defaultToolSettings } from './types'
import { useMediaStore } from '@/modules/media/store'
import { simplifyPath, pointsToPathData, calculateBoundingBox } from './pathUtils'

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

  // Drawing state for pen/highlighter
  const isDrawing = ref(false)
  const drawingPoints = ref<Point[]>([])
  const drawingPageIndex = ref<number | null>(null)

  // Text editing state
  const editingTextId = ref<string | null>(null)

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
    isDrawing: isDrawing.value,
    drawingPoints: drawingPoints.value,
    drawingPageIndex: drawingPageIndex.value,
    editingTextId: editingTextId.value,
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

  // Drawing actions for pen/highlighter
  function startDrawing(point: Point, pageIndex: number) {
    isDrawing.value = true
    drawingPoints.value = [point]
    drawingPageIndex.value = pageIndex
  }

  function addDrawingPoint(point: Point) {
    if (isDrawing.value) {
      drawingPoints.value.push(point)
    }
  }

  function finishDrawing() {
    if (!isDrawing.value || drawingPoints.value.length < 2 || drawingPageIndex.value === null) {
      isDrawing.value = false
      drawingPoints.value = []
      drawingPageIndex.value = null
      return
    }

    // Simplify path to reduce points
    const epsilon = 1.0 // tolerance in PDF points
    const simplified = simplifyPath(drawingPoints.value, epsilon)

    // Create path annotation
    const pathData = pointsToPathData(simplified)
    const bbox = calculateBoundingBox(simplified)

    const isPen = activeTool.value === 'pen'
    const stroke = toolSettings.value.color
    const strokeWidth = toolSettings.value.strokeWidth
    const opacity = isPen ? 1.0 : 0.4

    const annotation: Omit<AnnotationObject, 'id'> = {
      type: 'path',
      pageIndex: drawingPageIndex.value,
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      pathData,
      stroke,
      strokeWidth,
      opacity,
      lineCap: 'round',
      lineJoin: 'round',
      pathSource: isPen ? 'pen' : 'highlighter',
    }

    addAnnotation(annotation)

    // Reset drawing state
    isDrawing.value = false
    drawingPoints.value = []
    drawingPageIndex.value = null
  }

  function cancelDrawing() {
    isDrawing.value = false
    drawingPoints.value = []
    drawingPageIndex.value = null
  }

  // Text editing actions
  function startEditingText(id: string) {
    editingTextId.value = id
  }

  function stopEditingText() {
    editingTextId.value = null
  }

  // Measure text width using canvas
  function measureTextWidth(text: string, fontSize: number, fontFamily: string): number {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // Fallback estimation
      return estimateTextWidth(text, fontSize)
    }
    ctx.font = `${fontSize}px ${fontFamily}`
    return ctx.measureText(text).width
  }

  // Fallback estimation for text width
  function estimateTextWidth(text: string, fontSize: number): number {
    let width = 0
    for (const char of text) {
      // CJK characters are typically 1em wide
      if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
        width += fontSize
      } else {
        // Latin and other characters are typically 0.5-0.6em
        width += fontSize * 0.55
      }
    }
    return Math.max(20, width)
  }

  function updateTextContent(id: string, text: string) {
    // If text is empty, delete the annotation
    if (!text.trim()) {
      deleteAnnotation(id)
      stopEditingText()
      return
    }

    // Update the text content
    for (const pageObjs of Object.values(objects.value)) {
      const obj = pageObjs.find(o => o.id === id)
      if (obj) {
        // Measure actual text width
        const fontSize = obj.fontSize || toolSettings.value.fontSize
        const fontFamily = obj.fontFamily || 'system-ui'
        const newWidth = measureTextWidth(text, fontSize, fontFamily)
        updateAnnotation(id, { text, width: newWidth })
        break
      }
    }
    stopEditingText()
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
    isDrawing.value = false
    drawingPoints.value = []
    drawingPageIndex.value = null
    editingTextId.value = null
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

    // Drawing state
    isDrawing,
    drawingPoints,
    drawingPageIndex,

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

    // Drawing actions
    startDrawing,
    addDrawingPoint,
    finishDrawing,
    cancelDrawing,

    // Text editing
    editingTextId,
    startEditingText,
    stopEditingText,
    updateTextContent,
  }
})
