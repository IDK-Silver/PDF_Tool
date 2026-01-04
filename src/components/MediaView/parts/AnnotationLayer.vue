<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAnnotationStore } from '@/modules/annotation/store'
import type { AnnotationObject, CoordinateContext, StrokeStyle } from '@/modules/annotation/types'
import { pdfToSvg, pdfSizeToSvg, screenToPdf, svgToPdf } from '@/modules/annotation/coordinateUtils'

// Stroke dash arrays for different styles
const strokeDashArrays: Record<StrokeStyle, string> = {
  solid: '',
  dashed: '8 4',
  dotted: '2 4',
}

function getStrokeDashArray(style?: StrokeStyle): string | undefined {
  if (!style || style === 'solid') return undefined
  return strokeDashArrays[style]
}

const props = defineProps<{
  pageIndex: number
  displayWidth: number
  displayHeight: number
  pageWidthPt: number
  pageHeightPt: number
}>()

// Events can be added later when needed
// const emit = defineEmits<{
//   (e: 'annotation-click', id: string, event: MouseEvent): void
// }>()

const annotation = useAnnotationStore()

const coordCtx = computed<CoordinateContext>(() => ({
  pageWidthPt: props.pageWidthPt,
  pageHeightPt: props.pageHeightPt,
  displayWidth: props.displayWidth,
  displayHeight: props.displayHeight,
}))

const pageAnnotations = computed(() => annotation.getPageAnnotations(props.pageIndex))

const isInteractive = computed(() => annotation.activeTool !== null)
const isSelectMode = computed(() => annotation.activeTool === 'select')

// Drag state for moving annotations
const dragState = ref<{
  id: string
  startX: number
  startY: number
  origX: number
  origY: number
  origPoints?: number[]
} | null>(null)

// Resize state
const resizeState = ref<{
  id: string
  handle: string
  startX: number
  startY: number
  origX: number
  origY: number
  origWidth: number
  origHeight: number
} | null>(null)

// Drawing state for shapes
const drawState = ref<{
  startX: number
  startY: number
  currentX: number
  currentY: number
} | null>(null)

function getSvgPosition(obj: AnnotationObject) {
  // For line, use bounding box for position
  if (obj.type === 'line' && obj.points && obj.points.length >= 4) {
    const [x1, y1] = obj.points
    return pdfToSvg(x1, y1, coordCtx.value)
  }
  return pdfToSvg(obj.x, obj.y, coordCtx.value)
}

function getSvgSize(obj: AnnotationObject) {
  return pdfSizeToSvg(obj.width, obj.height, coordCtx.value)
}

function isSelected(id: string): boolean {
  return annotation.selectedIds.includes(id)
}

function onAnnotationMouseDown(obj: AnnotationObject, e: MouseEvent) {
  // Only allow selection/drag in select mode
  if (annotation.activeTool !== 'select') return

  e.stopPropagation()
  e.preventDefault()

  annotation.select(obj.id, e.shiftKey)

  // Start drag - for lines/arrows, we need to track points separately
  const isLineType = obj.type === 'line' || obj.type === 'arrow'

  dragState.value = {
    id: obj.id,
    startX: e.clientX,
    startY: e.clientY,
    origX: obj.x,
    origY: obj.y,
    // Store original points for lines/arrows
    origPoints: isLineType && obj.points ? [...obj.points] : undefined,
  }

  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (!dragState.value) return
  const dx = e.clientX - dragState.value.startX
  const dy = e.clientY - dragState.value.startY

  // Convert delta to PDF coordinates
  const scale = props.pageWidthPt / props.displayWidth
  const pdfDx = dx * scale
  const pdfDy = -dy * scale // Flip Y

  const newX = dragState.value.origX + pdfDx
  const newY = dragState.value.origY + pdfDy

  // For lines/arrows, also update the points
  if (dragState.value.origPoints && dragState.value.origPoints.length >= 4) {
    const [x1, y1, x2, y2] = dragState.value.origPoints
    const newPoints = [x1 + pdfDx, y1 + pdfDy, x2 + pdfDx, y2 + pdfDy]
    annotation.updateAnnotation(dragState.value.id, {
      x: newX,
      y: newY,
      points: newPoints,
    })
  } else {
    annotation.updateAnnotation(dragState.value.id, { x: newX, y: newY })
  }
}

function onDragEnd() {
  dragState.value = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

function onResizeMouseDown(obj: AnnotationObject, handle: string, e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()

  resizeState.value = {
    id: obj.id,
    handle,
    startX: e.clientX,
    startY: e.clientY,
    origX: obj.x,
    origY: obj.y,
    origWidth: obj.width,
    origHeight: obj.height,
  }

  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  if (!resizeState.value) return
  const dx = e.clientX - resizeState.value.startX
  const dy = e.clientY - resizeState.value.startY

  const scale = props.pageWidthPt / props.displayWidth
  const pdfDx = dx * scale
  const pdfDy = -dy * scale

  const { handle, origX, origY, origWidth, origHeight } = resizeState.value
  let newX = origX
  let newY = origY
  let newWidth = origWidth
  let newHeight = origHeight

  // Handle resize based on which corner/edge
  // Note: In PDF coords, y is the TOP edge (max Y). pdfDy is positive when dragging up on screen.
  if (handle.includes('e')) {
    newWidth = Math.max(10, origWidth + pdfDx)
  }
  if (handle.includes('w')) {
    const delta = Math.min(pdfDx, origWidth - 10)
    newX = origX + delta
    newWidth = origWidth - delta
  }
  if (handle.includes('n')) {
    // North resize: move top edge, bottom edge stays fixed
    const delta = Math.max(-origHeight + 10, pdfDy)
    newY = origY + delta
    newHeight = origHeight + delta
  }
  if (handle.includes('s')) {
    // South resize: top edge stays fixed, only height changes
    // Dragging down on screen: dy > 0, pdfDy < 0, height increases
    newHeight = Math.max(10, origHeight - pdfDy)
  }

  annotation.updateAnnotation(resizeState.value.id, {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  })
}

function onResizeEnd() {
  resizeState.value = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

function onSvgMouseDown(e: MouseEvent) {
  const tool = annotation.activeTool
  if (!tool) return

  if (tool === 'select') {
    // Click on empty area - deselect
    annotation.clearSelection()
    return
  }

  // Image/signature placement
  if ((tool === 'image' || tool === 'signature') && annotation.pendingObject) {
    const svg = e.currentTarget as SVGElement
    const pdfPos = screenToPdf(e.clientX, e.clientY, svg as unknown as HTMLElement, coordCtx.value)

    const pending = annotation.pendingObject
    // Center the object on click position
    const finalX = pdfPos.x - pending.width / 2
    const finalY = pdfPos.y + pending.height / 2

    annotation.addAnnotation({
      ...pending,
      pageIndex: props.pageIndex,
      x: finalX,
      y: finalY,
    })
    annotation.setPendingObject(null)
    annotation.setActiveTool('select')
    return
  }

  // Shape drawing (rect, ellipse, line, arrow)
  if (tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow') {
    e.preventDefault()
    const svg = e.currentTarget as SVGElement
    const rect = svg.getBoundingClientRect()
    drawState.value = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top,
    }
    window.addEventListener('mousemove', onDrawMove)
    window.addEventListener('mouseup', onDrawEnd)
  }
}

function onDrawMove(e: MouseEvent) {
  if (!drawState.value) return
  const svg = document.querySelector(`[data-annotation-layer="${props.pageIndex}"]`) as SVGElement
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  drawState.value.currentX = e.clientX - rect.left
  drawState.value.currentY = e.clientY - rect.top
}

function onDrawEnd(_e: MouseEvent) {
  if (!drawState.value) return
  window.removeEventListener('mousemove', onDrawMove)
  window.removeEventListener('mouseup', onDrawEnd)

  const { startX, startY, currentX, currentY } = drawState.value
  const tool = annotation.activeTool

  // Convert to PDF coordinates
  const start = svgToPdf(startX, startY, coordCtx.value)
  const end = svgToPdf(currentX, currentY, coordCtx.value)

  const minSize = 5 // Minimum size in PDF points

  if (tool === 'line' || tool === 'arrow') {
    const dx = Math.abs(end.x - start.x)
    const dy = Math.abs(end.y - start.y)
    if (dx > minSize || dy > minSize) {
      annotation.addAnnotation({
        type: tool,
        pageIndex: props.pageIndex,
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
        points: [start.x, start.y, end.x, end.y],
        stroke: annotation.toolSettings.color,
        strokeWidth: annotation.toolSettings.strokeWidth,
        strokeStyle: annotation.toolSettings.strokeStyle,
        opacity: annotation.toolSettings.opacity,
      })
    }
  } else if (tool === 'rect' || tool === 'ellipse') {
    const x = Math.min(start.x, end.x)
    const y = Math.max(start.y, end.y) // PDF Y is flipped
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)

    if (width > minSize && height > minSize) {
      annotation.addAnnotation({
        type: tool,
        pageIndex: props.pageIndex,
        x,
        y,
        width,
        height,
        fill: 'none',
        stroke: annotation.toolSettings.color,
        strokeWidth: annotation.toolSettings.strokeWidth,
        strokeStyle: annotation.toolSettings.strokeStyle,
        opacity: annotation.toolSettings.opacity,
      })
    }
  }

  drawState.value = null
}

// Preview shape while drawing
interface DrawPreviewBase {
  type: string | null
}
interface LinePreview extends DrawPreviewBase {
  type: 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}
interface ShapePreview extends DrawPreviewBase {
  type: 'rect' | 'ellipse' | string | null
  x: number
  y: number
  width: number
  height: number
}

function isLinePreview(p: LinePreview | ShapePreview | null): p is LinePreview {
  return p?.type === 'line' || p?.type === 'arrow'
}

function isShapePreview(p: LinePreview | ShapePreview | null): p is ShapePreview {
  return p !== null && p.type !== 'line' && p.type !== 'arrow' && 'x' in p
}

const drawPreview = computed<LinePreview | ShapePreview | null>(() => {
  if (!drawState.value) return null
  const { startX, startY, currentX, currentY } = drawState.value
  const tool = annotation.activeTool

  if (tool === 'line' || tool === 'arrow') {
    return {
      type: tool as 'line',
      x1: startX,
      y1: startY,
      x2: currentX,
      y2: currentY,
    }
  }

  const x = Math.min(startX, currentX)
  const y = Math.min(startY, currentY)
  const width = Math.abs(currentX - startX)
  const height = Math.abs(currentY - startY)

  return {
    type: tool,
    x,
    y,
    width,
    height,
  }
})

// Pending object preview (image/signature waiting to be placed)
// TODO: Implement cursor preview for pending image/signature
// const pendingPreview = computed(() => {
//   if (!annotation.pendingObject) return null
//   return annotation.pendingObject
// })

// Resize handles for selected objects
function getResizeHandles(obj: AnnotationObject) {
  if (obj.type === 'line') return [] // Lines don't have resize handles yet

  const pos = getSvgPosition(obj)
  const size = getSvgSize(obj)
  const handleSize = 8

  return [
    { id: 'nw', x: pos.x - handleSize / 2, y: pos.y - handleSize / 2 },
    { id: 'ne', x: pos.x + size.width - handleSize / 2, y: pos.y - handleSize / 2 },
    { id: 'sw', x: pos.x - handleSize / 2, y: pos.y + size.height - handleSize / 2 },
    { id: 'se', x: pos.x + size.width - handleSize / 2, y: pos.y + size.height - handleSize / 2 },
  ]
}
</script>

<template>
  <svg
    :width="displayWidth"
    :height="displayHeight"
    :viewBox="`0 0 ${displayWidth} ${displayHeight}`"
    :class="['annotation-layer', { interactive: isInteractive, 'select-mode': isSelectMode }]"
    :data-annotation-layer="pageIndex"
    @mousedown="onSvgMouseDown"
  >
    <!-- Arrow marker definitions -->
    <defs>
      <!-- Preview marker -->
      <marker
        id="arrowhead-preview"
        markerWidth="10"
        markerHeight="7"
        refX="9"
        refY="3.5"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <polygon points="0 0, 10 3.5, 0 7" :fill="annotation.toolSettings.color" />
      </marker>
      <!-- Markers for each arrow annotation -->
      <template v-for="obj in pageAnnotations" :key="`marker-${obj.id}`">
        <marker
          v-if="obj.type === 'arrow'"
          :id="`arrowhead-${obj.id}`"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <polygon points="0 0, 10 3.5, 0 7" :fill="obj.stroke" />
        </marker>
      </template>
    </defs>

    <!-- Render annotations -->
    <template v-for="obj in pageAnnotations" :key="obj.id">
      <!-- Image/Signature -->
      <image
        v-if="obj.type === 'image' || obj.type === 'signature'"
        :x="getSvgPosition(obj).x"
        :y="getSvgPosition(obj).y"
        :width="getSvgSize(obj).width"
        :height="getSvgSize(obj).height"
        :href="obj.imageData"
        :opacity="obj.opacity"
        :class="{ selected: isSelected(obj.id) }"
        preserveAspectRatio="none"
        style="pointer-events: all; cursor: move;"
        @mousedown="onAnnotationMouseDown(obj, $event)"
      />

      <!-- Rectangle -->
      <rect
        v-else-if="obj.type === 'rect'"
        :x="getSvgPosition(obj).x"
        :y="getSvgPosition(obj).y"
        :width="getSvgSize(obj).width"
        :height="getSvgSize(obj).height"
        :fill="obj.fill === 'none' ? 'transparent' : obj.fill"
        :stroke="obj.stroke"
        :stroke-width="obj.strokeWidth"
        :stroke-dasharray="getStrokeDashArray(obj.strokeStyle)"
        :opacity="obj.opacity"
        :class="{ selected: isSelected(obj.id) }"
        style="pointer-events: all; cursor: move;"
        @mousedown="onAnnotationMouseDown(obj, $event)"
      />

      <!-- Ellipse -->
      <ellipse
        v-else-if="obj.type === 'ellipse'"
        :cx="getSvgPosition(obj).x + getSvgSize(obj).width / 2"
        :cy="getSvgPosition(obj).y + getSvgSize(obj).height / 2"
        :rx="getSvgSize(obj).width / 2"
        :ry="getSvgSize(obj).height / 2"
        :fill="obj.fill === 'none' ? 'transparent' : obj.fill"
        :stroke="obj.stroke"
        :stroke-width="obj.strokeWidth"
        :stroke-dasharray="getStrokeDashArray(obj.strokeStyle)"
        :opacity="obj.opacity"
        :class="{ selected: isSelected(obj.id) }"
        style="pointer-events: all; cursor: move;"
        @mousedown="onAnnotationMouseDown(obj, $event)"
      />

      <!-- Line (with hit area for easier selection) -->
      <g v-else-if="obj.type === 'line' && obj.points && obj.points.length >= 4" style="cursor: move;">
        <!-- Invisible hit area -->
        <line
          :x1="pdfToSvg(obj.points[0], obj.points[1], coordCtx).x"
          :y1="pdfToSvg(obj.points[0], obj.points[1], coordCtx).y"
          :x2="pdfToSvg(obj.points[2], obj.points[3], coordCtx).x"
          :y2="pdfToSvg(obj.points[2], obj.points[3], coordCtx).y"
          stroke="transparent"
          :stroke-width="Math.max(20, (obj.strokeWidth || 2) + 16)"
          style="pointer-events: all; cursor: move;"
          @mousedown="onAnnotationMouseDown(obj, $event)"
        />
        <!-- Visible line -->
        <line
          :x1="pdfToSvg(obj.points[0], obj.points[1], coordCtx).x"
          :y1="pdfToSvg(obj.points[0], obj.points[1], coordCtx).y"
          :x2="pdfToSvg(obj.points[2], obj.points[3], coordCtx).x"
          :y2="pdfToSvg(obj.points[2], obj.points[3], coordCtx).y"
          fill="none"
          :stroke="obj.stroke"
          :stroke-width="obj.strokeWidth"
          :stroke-dasharray="getStrokeDashArray(obj.strokeStyle)"
          :opacity="obj.opacity"
          :class="{ selected: isSelected(obj.id) }"
          style="pointer-events: none;"
        />
      </g>

      <!-- Arrow (with hit area for easier selection) -->
      <g v-else-if="obj.type === 'arrow' && obj.points && obj.points.length >= 4" style="cursor: move;">
        <!-- Invisible hit area -->
        <line
          :x1="pdfToSvg(obj.points[0], obj.points[1], coordCtx).x"
          :y1="pdfToSvg(obj.points[0], obj.points[1], coordCtx).y"
          :x2="pdfToSvg(obj.points[2], obj.points[3], coordCtx).x"
          :y2="pdfToSvg(obj.points[2], obj.points[3], coordCtx).y"
          stroke="transparent"
          :stroke-width="Math.max(20, (obj.strokeWidth || 2) + 16)"
          style="pointer-events: all; cursor: move;"
          @mousedown="onAnnotationMouseDown(obj, $event)"
        />
        <!-- Visible arrow -->
        <line
          :x1="pdfToSvg(obj.points[0], obj.points[1], coordCtx).x"
          :y1="pdfToSvg(obj.points[0], obj.points[1], coordCtx).y"
          :x2="pdfToSvg(obj.points[2], obj.points[3], coordCtx).x"
          :y2="pdfToSvg(obj.points[2], obj.points[3], coordCtx).y"
          fill="none"
          :stroke="obj.stroke"
          :stroke-width="obj.strokeWidth"
          :stroke-dasharray="getStrokeDashArray(obj.strokeStyle)"
          :opacity="obj.opacity"
          :marker-end="`url(#arrowhead-${obj.id})`"
          :class="{ selected: isSelected(obj.id) }"
          style="pointer-events: none;"
        />
      </g>

      <!-- Selection outline and resize handles -->
      <template v-if="isSelected(obj.id) && obj.type !== 'line' && obj.type !== 'arrow'">
        <rect
          :x="getSvgPosition(obj).x"
          :y="getSvgPosition(obj).y"
          :width="getSvgSize(obj).width"
          :height="getSvgSize(obj).height"
          fill="none"
          stroke="#0066ff"
          stroke-width="2"
          stroke-dasharray="4 2"
          class="selection-outline"
        />
        <rect
          v-for="handle in getResizeHandles(obj)"
          :key="handle.id"
          :x="handle.x"
          :y="handle.y"
          width="8"
          height="8"
          fill="#ffffff"
          stroke="#0066ff"
          stroke-width="1"
          class="resize-handle"
          :data-handle="handle.id"
          @mousedown="onResizeMouseDown(obj, handle.id, $event)"
        />
      </template>
    </template>

    <!-- Drawing preview (shows exactly what final shape will look like) -->
    <template v-if="drawPreview">
      <line
        v-if="isLinePreview(drawPreview)"
        :x1="drawPreview.x1"
        :y1="drawPreview.y1"
        :x2="drawPreview.x2"
        :y2="drawPreview.y2"
        :stroke="annotation.toolSettings.color"
        :stroke-width="annotation.toolSettings.strokeWidth"
        :stroke-dasharray="getStrokeDashArray(annotation.toolSettings.strokeStyle)"
        :opacity="annotation.toolSettings.opacity"
        :marker-end="drawPreview.type === 'arrow' ? 'url(#arrowhead-preview)' : undefined"
        class="drawing-preview"
      />
      <rect
        v-else-if="isShapePreview(drawPreview) && drawPreview.type === 'rect'"
        :x="drawPreview.x"
        :y="drawPreview.y"
        :width="drawPreview.width"
        :height="drawPreview.height"
        fill="none"
        :stroke="annotation.toolSettings.color"
        :stroke-width="annotation.toolSettings.strokeWidth"
        :stroke-dasharray="getStrokeDashArray(annotation.toolSettings.strokeStyle)"
        :opacity="annotation.toolSettings.opacity"
        class="drawing-preview"
      />
      <ellipse
        v-else-if="isShapePreview(drawPreview) && drawPreview.type === 'ellipse'"
        :cx="drawPreview.x + drawPreview.width / 2"
        :cy="drawPreview.y + drawPreview.height / 2"
        :rx="drawPreview.width / 2"
        :ry="drawPreview.height / 2"
        fill="none"
        :stroke="annotation.toolSettings.color"
        :stroke-width="annotation.toolSettings.strokeWidth"
        :stroke-dasharray="getStrokeDashArray(annotation.toolSettings.strokeStyle)"
        :opacity="annotation.toolSettings.opacity"
        class="drawing-preview"
      />
    </template>
  </svg>
</template>

<style scoped>
.annotation-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 5;
}

.annotation-layer.interactive {
  pointer-events: auto;
  cursor: crosshair;
}

/* In select mode, use default cursor on layer so shapes can show move cursor */
.annotation-layer.select-mode {
  cursor: default;
}

/* Show move cursor for annotation elements in select mode */
.annotation-layer.select-mode image,
.annotation-layer.select-mode rect:not(.selection-outline):not(.resize-handle),
.annotation-layer.select-mode ellipse,
.annotation-layer.select-mode line:not(.drawing-preview),
.annotation-layer.select-mode g {
  cursor: move;
}

.resize-handle {
  cursor: nwse-resize;
}

.resize-handle[data-handle="ne"],
.resize-handle[data-handle="sw"] {
  cursor: nesw-resize;
}

.selected {
  filter: drop-shadow(0 0 2px rgba(0, 102, 255, 0.5));
}

.drawing-preview {
  pointer-events: none;
}
</style>
