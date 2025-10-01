<template>
  <div class="image-viewer" :class="{ hcenter: hCenter, vcenter: vCenter }" ref="containerRef" @contextmenu.prevent="onContextMenu">
    <img
      v-if="imageSrc"
      ref="imgRef"
      :src="imageSrc"
      :alt="alt"
      :style="imgStyle"
      @load="handleLoad"
      @error="handleError"
    />
  </div>
  
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, defineExpose } from 'vue'
import { readFile } from '@tauri-apps/plugin-fs'

const props = defineProps<{ path: string; alt?: string; scale?: number }>()
type PinchZoomPayload = {
  deltaY: number
  anchorX: number
  anchorY: number
  viewportX: number
  viewportY: number
}

const emit = defineEmits<{
  (e: 'loading'): void
  (e: 'loaded', payload: { width: number; height: number }): void
  (e: 'error', message: string): void
  (e: 'page-contextmenu', payload: any): void
  (e: 'pinch-zoom', payload: PinchZoomPayload): void
}>()

const imageSrc = ref<string | null>(null)
const alt = computed(() => props.alt ?? '檢視圖片')
let objectUrl: string | null = null
let token = 0
const containerRef = ref<HTMLDivElement | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const displayScale = computed(() => props.scale ?? 1)
const scaledWidth = computed(() => Math.max(1, Math.round((naturalWidth.value || 0) * (displayScale.value || 1))))
const scaledHeight = computed(() => Math.max(1, Math.round((naturalHeight.value || 0) * (displayScale.value || 1))))
const imgStyle = computed(() => {
  if (!naturalWidth.value || !naturalHeight.value) return {}
  return {
    width: `${scaledWidth.value}px`,
    height: 'auto'
  } as any
})

// Container size for smart centering
const containerW = ref(0)
const containerH = ref(0)
let resizeObs: ResizeObserver | null = null
function normalizeWheelDelta(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * 360
  return event.deltaY
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

function handleWheel(event: WheelEvent) {
  if (!event.ctrlKey) return
  const container = containerRef.value
  if (!container) return
  event.preventDefault()
  const deltaY = normalizeWheelDelta(event)
  if (!Number.isFinite(deltaY)) return

  const rect = container.getBoundingClientRect()
  const viewportX = event.clientX - rect.left
  const viewportY = event.clientY - rect.top
  const contentWidth = Math.max(container.scrollWidth, scaledWidth.value || 1)
  const contentHeight = Math.max(container.scrollHeight, scaledHeight.value || 1)

  const anchorX = clamp01((container.scrollLeft + viewportX) / contentWidth)
  const anchorY = clamp01((container.scrollTop + viewportY) / contentHeight)

  const payload: PinchZoomPayload = {
    deltaY,
    anchorX,
    anchorY,
    viewportX,
    viewportY,
  }

  emit('pinch-zoom', payload)
}

onMounted(() => {
  const el = containerRef.value
  if (el && 'ResizeObserver' in window) {
    const update = () => {
      containerW.value = el.clientWidth
      containerH.value = el.clientHeight
    }
    resizeObs = new ResizeObserver(update)
    resizeObs.observe(el)
    update()
  }
  el?.addEventListener('wheel', handleWheel, { passive: false })
})
onBeforeUnmount(() => {
  try { resizeObs?.disconnect() } catch {}
  const el = containerRef.value
  try { el?.removeEventListener('wheel', handleWheel) } catch {}
})

// Center only when the scaled image fits on that axis
const hCenter = computed(() => !!scaledWidth.value && scaledWidth.value <= containerW.value)
const vCenter = computed(() => !!scaledHeight.value && scaledHeight.value <= containerH.value)

// 永遠垂直置中：純 CSS flex；此處不需量測容器

function revokeUrl() {
  if (objectUrl) {
    try { URL.revokeObjectURL(objectUrl) } catch {}
    objectUrl = null
  }
}

function reset() {
  revokeUrl()
  imageSrc.value = null
}

function guessMime(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'image/tiff'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'image/*'
}

watch(() => props.path, async (path) => {
  reset()
  if (!path) return
  const runToken = ++token
  emit('loading')
  try {
    const bytes = await readFile(path)
    if (runToken !== token) return
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)
    const blob = new Blob([data], { type: guessMime(path) })
    revokeUrl()
    objectUrl = URL.createObjectURL(blob)
    imageSrc.value = objectUrl
  } catch (error) {
    if (runToken !== token) return
    reset()
    const message = error instanceof Error ? error.message : String(error)
    emit('error', message)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  reset()
})

function handleLoad() {
  const img = imgRef.value
  if (img) {
    naturalWidth.value = img.naturalWidth || img.width
    naturalHeight.value = img.naturalHeight || img.height
    emit('loaded', { width: naturalWidth.value, height: naturalHeight.value })
  } else {
    emit('loaded', { width: 0, height: 0 })
  }
}

function handleError(event: Event) {
  const target = event.target as HTMLImageElement | null
  reset()
  emit('error', target?.src ? `無法載入圖片：${target.src}` : '無法載入圖片')
}

function onContextMenu(e: MouseEvent) {
  const img = imgRef.value
  const container = containerRef.value
  if (!img || !container) return
  const rect = img.getBoundingClientRect()
  const imgX = e.clientX - rect.left
  const imgY = e.clientY - rect.top
  const payload = {
    pageNumber: 1,
    pageIndex: 0,
    scale: displayScale.value,
    width: Math.round(naturalWidth.value * displayScale.value),
    height: Math.round(naturalHeight.value * displayScale.value),
    offsetX: imgX,
    offsetY: imgY,
    clientX: e.clientX,
    clientY: e.clientY,
    pdfX: imgX / (displayScale.value || 1),
    pdfY: imgY / (displayScale.value || 1),
  }
  emit('page-contextmenu', payload)
}

function getPageMetrics(_pageNumber: number) {
  const container = containerRef.value
  const img = imgRef.value
  if (!container || !img) return null
  const pageTop = 0
  const pageHeight = img.offsetHeight || Math.round(naturalHeight.value * displayScale.value)
  return { pageTop, pageHeight, scrollTop: container.scrollTop }
}
function scrollToPageOffset(_pageNumber: number, offsetPx: number) {
  scrollToPosition({ top: Math.max(0, offsetPx) })
}

function getScrollState() {
  const container = containerRef.value
  if (!container) return null
  return {
    scrollLeft: container.scrollLeft,
    scrollTop: container.scrollTop,
    scrollWidth: container.scrollWidth,
    scrollHeight: container.scrollHeight,
    clientWidth: container.clientWidth,
    clientHeight: container.clientHeight,
  }
}

function scrollToPosition(pos: { left?: number; top?: number }) {
  const container = containerRef.value
  if (!container) return
  const targetLeft = pos.left ?? container.scrollLeft
  const targetTop = pos.top ?? container.scrollTop
  container.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' })
}

function getContainerWidth() {
  const el = containerRef.value
  return el ? el.clientWidth : 0
}
defineExpose({ getPageMetrics, scrollToPageOffset, getContainerWidth, getScrollState, scrollToPosition })
</script>

<style scoped>
.image-viewer {
  width: 100%;
  height: 100%;
  overflow: auto;            /* 大圖可滾動 */
  display: flex;             /* 彈性容器 */
  justify-content: flex-start;/* 預設靠左 */
  align-items: flex-start;    /* 預設靠上 */
  padding: 0;
  box-sizing: border-box;
  background: var(--hover, #f3f4f6);
}

.image-viewer.hcenter { justify-content: center; }
.image-viewer.vcenter { align-items: center; }

.image-viewer img {
  display: block;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  flex: 0 0 auto; /* 保留原始尺寸，避免 flex 擠壓導致無法完整捲動 */
}
</style>
