<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMediaStore } from '@/modules/media/store'
import type { PageTextContent, TextChar } from '@/modules/media/types'

const props = defineProps<{
  docId: number
  pageIndex: number
  pageWidthPt: number
  pageHeightPt: number
  pxPerPointX: number
  pxPerPointY: number
  layerWidthPx: number
  layerHeightPx: number
  highlightRanges?: Array<{ start: number; end: number; active?: boolean }>
}>()

const media = useMediaStore()
const { pageText } = storeToRefs(media)
const textContent = computed<PageTextContent | null>(() => {
  const info = pageText.value[props.pageIndex]
  return info ?? null
})
const loading = ref(false)
const error = ref<string | null>(null)
let fetchToken = 0

const safeWidth = computed(() => {
  const w = props.layerWidthPx
  return Number.isFinite(w) && w > 0 ? w : props.pageWidthPt * Math.max(props.pxPerPointX, 0.001)
})
const safeHeight = computed(() => {
  const h = props.layerHeightPx
  return Number.isFinite(h) && h > 0 ? h : props.pageHeightPt * Math.max(props.pxPerPointY, 0.001)
})

// Load text when docId or pageIndex changes
watch(
  () => [props.docId, props.pageIndex],
  async () => {
    if (!props.docId || props.pageIndex < 0) return

    loading.value = true
    error.value = null
    const token = ++fetchToken

    try {
      const result = await media.getPageTextContent(props.pageIndex)
      if (token !== fetchToken) return
      if (result) {
        console.log(`[PdfTextLayer] Loaded ${result.chars.length} chars for page ${props.pageIndex}`)
      } else {
        error.value = '無法取得頁面文字'
      }
    } catch (err) {
      console.error('[PdfTextLayer] Failed to load text:', err)
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (token === fetchToken) {
        loading.value = false
      }
    }
  },
  { immediate: true }
)

// Convert PDF coordinates to display coordinates
function getCharStyle(char: TextChar) {
  const scaleX = Number.isFinite(props.pxPerPointX) && props.pxPerPointX > 0
    ? props.pxPerPointX
    : safeWidth.value / Math.max(props.pageWidthPt, 0.001)
  const scaleY = Number.isFinite(props.pxPerPointY) && props.pxPerPointY > 0
    ? props.pxPerPointY
    : safeHeight.value / Math.max(props.pageHeightPt, 0.001)

  // PDF 座標是從左下角開始，需要轉換為從左上角開始
  // 使用更高精度來減少累積誤差
  // Note: char.x already includes global offset from backend
  const left = Math.round(char.x * scaleX * 100) / 100
  const width = Math.max(0, Math.round(char.width * scaleX * 100) / 100)
  const height = Math.max(0, Math.round(char.height * scaleY * 100) / 100)
  const top = Math.round((props.pageHeightPt - char.y - char.height) * scaleY * 100) / 100
  const fontSize = Math.max(0, Math.round(char.fontSize * scaleY * 100) / 100)

  // Return as string to allow !important
  return `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; font-size: ${fontSize}px; line-height: ${height}px; white-space: pre; user-select: text !important; -webkit-user-select: text !important; color: transparent; -webkit-text-fill-color: transparent; background: transparent; cursor: text; pointer-events: auto !important;`
}

const highlightMap = computed<Record<number, 'active' | 'match'>>(() => {
  const ranges = props.highlightRanges ?? []
  const map: Record<number, 'active' | 'match'> = {}
  const total = textContent.value?.chars.length ?? 0
  if (!ranges.length || total <= 0) return map
  const maxIndex = total - 1
  for (const range of ranges) {
    if (!range) continue
    let start = Number.isFinite(range.start) ? Math.floor(range.start) : 0
    let end = Number.isFinite(range.end) ? Math.floor(range.end) : start
    if (start > end) [start, end] = [end, start]
    start = Math.max(0, Math.min(start, maxIndex))
    end = Math.max(0, Math.min(end, maxIndex))
    const role: 'active' | 'match' = range.active ? 'active' : 'match'
    for (let i = start; i <= end; i++) {
      if (map[i] === 'active') continue
      map[i] = role
    }
  }
  return map
})

function getCharClass(idx: number) {
  const role = highlightMap.value[idx]
  if (role === 'active') return 'match-active'
  if (role === 'match') return 'match-highlight'
  return ''
}
</script>

<template>
  <div
    class="pdf-text-layer"
    :style="{
      position: 'absolute',
      left: 0,
      top: 0,
      width: `${safeWidth}px`,
      height: `${safeHeight}px`,
      userSelect: 'text',
      WebkitUserSelect: 'text',
      overflow: 'hidden',
      zIndex: 10,
    }"
  >
    <div
      v-if="loading"
      style="position: absolute; top: 10px; left: 10px; background: rgba(255,255,0,0.5); padding: 4px; font-size: 10px;"
    >
      載入文字中...
    </div>
    <div
      v-if="error"
      style="position: absolute; top: 10px; left: 10px; background: rgba(255,0,0,0.5); padding: 4px; font-size: 10px; color: white;"
    >
      錯誤: {{ error }}
    </div>
    <div
      v-if="textContent"
      style="position: relative; width: 100%; height: 100%;"
    >
      <span
        v-for="(char, idx) in textContent.chars"
        :key="idx"
        :style="getCharStyle(char)"
        :class="['text-char', getCharClass(idx)]"
        :data-char-index="idx"
      >{{ char.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.pdf-text-layer {
  /* Allow text selection in this layer - use !important to override global styles */
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  pointer-events: auto !important;
}

.pdf-text-layer span {
  /* Each character is selectable */
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
  cursor: text !important;
  pointer-events: auto !important;
}

.pdf-text-layer span::selection {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  background: rgba(0, 120, 215, 0.3) !important;
}

.pdf-text-layer span::-moz-selection {
  color: transparent !important;
  background: rgba(0, 120, 215, 0.3) !important;
}

.match-highlight {
  background: rgba(255, 246, 0, 0.35) !important;
}

.match-active {
  background: rgba(255, 184, 0, 0.55) !important;
}
</style>
