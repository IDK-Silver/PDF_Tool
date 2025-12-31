import { useAnnotationStore } from '../store'

/**
 * Handle keyboard events for the select tool.
 * Returns true if the event was handled.
 */
export function handleSelectToolKeyboard(e: KeyboardEvent): boolean {
  const annotation = useAnnotationStore()

  if (annotation.activeTool !== 'select') return false
  if (!annotation.hasSelection) return false

  // Delete selected annotations
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    annotation.deleteSelected()
    return true
  }

  // Escape to deselect
  if (e.key === 'Escape') {
    e.preventDefault()
    annotation.clearSelection()
    return true
  }

  // Arrow keys for nudging
  const NUDGE_AMOUNT = e.shiftKey ? 10 : 1 // PDF points
  const arrowMap: Record<string, { dx: number; dy: number }> = {
    ArrowUp: { dx: 0, dy: NUDGE_AMOUNT },
    ArrowDown: { dx: 0, dy: -NUDGE_AMOUNT },
    ArrowLeft: { dx: -NUDGE_AMOUNT, dy: 0 },
    ArrowRight: { dx: NUDGE_AMOUNT, dy: 0 },
  }

  if (arrowMap[e.key]) {
    e.preventDefault()
    const { dx, dy } = arrowMap[e.key]
    for (const obj of annotation.selectedObjects) {
      annotation.updateAnnotation(obj.id, {
        x: obj.x + dx,
        y: obj.y + dy,
      })
    }
    return true
  }

  return false
}

/**
 * Activate the select tool.
 */
export function activateSelectTool() {
  const annotation = useAnnotationStore()
  annotation.setActiveTool('select')
}

/**
 * Deactivate the select tool.
 */
export function deactivateSelectTool() {
  const annotation = useAnnotationStore()
  annotation.clearSelection()
  annotation.setActiveTool(null)
}
