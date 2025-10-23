<script setup lang="ts">
import { ref, watch } from 'vue'
import { pdfGetPageText } from '@/modules/media/service'
import type { PageTextContent, TextChar } from '@/modules/media/types'

const props = defineProps<{
  docId: number
  pageIndex: number
  pageWidthPt: number
  pageHeightPt: number
  displayScale: number
}>()

const textContent = ref<PageTextContent | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Load text when docId or pageIndex changes
watch(
  () => [props.docId, props.pageIndex],
  async () => {
    if (!props.docId || props.pageIndex < 0) return

    loading.value = true
    error.value = null

    try {
      textContent.value = await pdfGetPageText(props.docId, props.pageIndex)
      console.log(`[PdfTextLayer] Loaded ${textContent.value.chars.length} chars for page ${props.pageIndex}`)
    } catch (err) {
      console.error('[PdfTextLayer] Failed to load text:', err)
      error.value = err instanceof Error ? err.message : String(err)
      textContent.value = null
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

// Convert PDF coordinates to display coordinates
function getCharStyle(char: TextChar) {
  const scale = props.displayScale

  // PDF 座標是從左下角開始，需要轉換為從左上角開始
  const left = char.x * scale
  const top = (props.pageHeightPt - char.y - char.height) * scale
  const width = char.width * scale
  const height = char.height * scale

  // Return as string to allow !important
  return `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; font-size: ${char.fontSize * scale}px; line-height: ${height}px; white-space: pre; user-select: text !important; -webkit-user-select: text !important; color: transparent; cursor: text; pointer-events: auto !important;`
}
</script>

<template>
  <div
    class="pdf-text-layer"
    :style="{
      position: 'absolute',
      left: 0,
      top: 0,
      width: `${pageWidthPt * displayScale}px`,
      height: `${pageHeightPt * displayScale}px`,
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
        class="text-char"
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
</style>
