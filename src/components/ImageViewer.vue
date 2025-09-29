<template>
  <div class="image-viewer" ref="containerRef" @contextmenu.prevent="onContextMenu">
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
import { computed, ref, watch, onBeforeUnmount, defineExpose } from 'vue'
import { readFile } from '@tauri-apps/plugin-fs'

const props = defineProps<{ path: string; alt?: string; scale?: number }>()
const emit = defineEmits<{
  (e: 'loading'): void
  (e: 'loaded', payload: { width: number; height: number }): void
  (e: 'error', message: string): void
  (e: 'page-contextmenu', payload: any): void
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
const imgStyle = computed(() => {
  if (!naturalWidth.value || !naturalHeight.value) return {}
  return {
    width: `${Math.max(1, Math.round(naturalWidth.value * displayScale.value))}px`,
    height: 'auto'
  } as any
})

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
  const container = containerRef.value
  if (!container) return
  container.scrollTo({ top: Math.max(0, offsetPx), behavior: 'auto' })
}
defineExpose({ getPageMetrics, scrollToPageOffset })
</script>

<style scoped>
.image-viewer {
  width: 100%;
  height: 100%;
  overflow: auto;            /* 讓大圖被容器裁切並可滾動 */
  display: block;            /* 取消 flex 置中，確保裁切從左上角開始 */
  padding: 0;
  box-sizing: border-box;
  background: var(--hover, #f3f4f6);
}

.image-viewer img {
  display: block;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}
</style>
