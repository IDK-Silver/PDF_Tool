<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import type { PageTextContent } from '@/modules/media/types'

// Canvas 測量工具
const measureCanvas = document.createElement('canvas')
const measureCtx = measureCanvas.getContext('2d')!
const widthCache = new Map<string, number>()

function getMeasuredWidth(text: string, fontSize: number): number {
  const kSize = Math.round(fontSize * 100) / 100
  const key = `${kSize}:${text}`
  if (widthCache.has(key)) return widthCache.get(key)!

  measureCtx.font = `${kSize}px sans-serif`
  const w = measureCtx.measureText(text).width
  widthCache.set(key, w)
  return w
}

const props = defineProps<{
  docId: number
  pageIndex: number
  pageWidthPt: number  // PDF 原始寬度 (pt)
  pageHeightPt: number // PDF 原始高度 (pt)
  pxPerPointX: number  // X 軸縮放比例
  pxPerPointY: number  // Y 軸縮放比例
  layerWidthPx: number // 實際顯示寬度
  layerHeightPx: number
  highlightRanges?: Array<{ start: number; end: number; active?: boolean }>
}>()

const media = useMediaStore()
const emit = defineEmits<{
  (e: 'selection-change', payload: { pageIndex: number; range: { start: number; end: number } | null }): void
  (e: 'layer-ready', payload: { pageIndex: number }): void
}>()

const textContent = shallowRef<PageTextContent | null>(null)
// 緩存處理過的 spans 樣式，避免每次 render 重算
type TextSegment = { text: string; className: string }
type RenderedSpan = { text: string; style: Record<string, string>; idx: number; start: number; end: number }

const renderedSpans = shallowRef<RenderedSpan[]>([])
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)
let fetchToken = 0
const rootEl = shallowRef<HTMLDivElement | null>(null)
const readyEmitted = shallowRef(false)

// [核心] 容器層級的 Transform
// 當 props.pxPerPointX 改變時（縮放），Vue 只需要更新這個 style 字串
// 瀏覽器會用 GPU 縮放整個圖層，內部的數百個 spans 完全不需要動，效能極高
const layerStyle = computed(() => {
  return {
    width: `${props.pageWidthPt}px`,
    height: `${props.pageHeightPt}px`,
    // 強制設定 transform-origin 為左上角，配合 scale 進行縮放
    transform: `scale(${props.pxPerPointX}, ${props.pxPerPointY})`,
    transformOrigin: '0 0',
  }
})

// 預先計算 Span 樣式
// 這些樣式只依賴 PDF 原始資料，縮放時**不會**重新計算
function precomputeSpans(content: PageTextContent) {
  const pageH = props.pageHeightPt
  const list: RenderedSpan[] = []
  let charOffset = 0
  for (let idx = 0; idx < content.spans.length; idx++) {
    const span = content.spans[idx]
    const left = span.x
    // PDF 原點在左下，HTML 在左上，這裡用原始 pt 計算
    const top = pageH - span.y - span.height
    const fontSize = Math.max(0, span.height)
    const width = Math.max(0, span.width)
    const text = span.text || ''
    const textLen = text.length
    const start = charOffset
    const end = textLen > 0 ? charOffset + textLen - 1 : charOffset - 1

    // 計算水平拉伸 (解決字型差異)
    const measuredW = getMeasuredWidth(text, fontSize)
    let scaleX = 1
    if (measuredW > 0 && width > 0) {
      scaleX = width / measuredW
    }

    list.push({
      text,
      idx,
      start,
      end,
      style: {
        left: `${left}px`,
        top: `${top}px`,
        fontSize: `${fontSize}px`,
        height: `${fontSize}px`,
        lineHeight: '1',
        transform: `scaleX(${scaleX})`,
        transformOrigin: '0 0'
      }
    })
    charOffset += textLen
  }
  return list
}

watch(
  // 監聽 pageWidthPt/pageHeightPt：當頁面旋轉時寬高會交換，需要重新獲取文字內容
  () => [props.docId, props.pageIndex, props.pageWidthPt, props.pageHeightPt],
  async () => {
    if (!props.docId || props.pageIndex < 0) return

    loading.value = true
    error.value = null
    const token = ++fetchToken

    textContent.value = null
    renderedSpans.value = []
    widthCache.clear()

    try {
      const result = await media.getPageTextContent(props.pageIndex)
      if (token !== fetchToken) return
      if (result) {
        textContent.value = result
        // 收到資料後，計算一次樣式並快取起來
        renderedSpans.value = precomputeSpans(result)
        readyEmitted.value = false
      }
      // 如果 result 為 null，表示頁面沒有文字內容（如純圖片頁面），這是正常情況，不顯示錯誤
    } catch (err) {
      // 只有真正的 API 錯誤才顯示錯誤訊息
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (token === fetchToken) {
        loading.value = false
      }
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  textContent.value = null
  renderedSpans.value = []
  widthCache.clear()
  document.removeEventListener('selectionchange', handleSelectionChange)
})

// Debug：觀察掛載/卸載狀態
if (import.meta.env.DEV) {
  console.log('[PdfTextLayer] mount', { pageIndex: props.pageIndex, docId: props.docId })
  onBeforeUnmount(() => {
    console.log('[PdfTextLayer] unmount', { pageIndex: props.pageIndex, docId: props.docId })
  })
}

function toCharIndex(spanIdx: number, offsetInSpan: number): number | null {
  if (!textContent.value) return null
  let acc = 0
  for (let i = 0; i < textContent.value.spans.length; i++) {
    const span = textContent.value.spans[i]
    const len = span?.text?.length ?? 0
    if (i === spanIdx) {
      return acc + Math.max(0, Math.min(len, offsetInSpan))
    }
    acc += len
  }
  return null
}

function nodeToSpanInfo(node: Node | null, offset: number): { spanIdx: number; offset: number } | null {
  if (!node) return null
  const spanEl = (node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement)?.closest('.text-span') as HTMLElement | null
  if (!spanEl || !rootEl.value || !rootEl.value.contains(spanEl)) return null
  const spanIdx = Number(spanEl.dataset.spanIndex)
  if (!Number.isFinite(spanIdx)) return null
  const textLen = (spanEl.textContent ?? '').length
  return { spanIdx, offset: Math.max(0, Math.min(textLen, offset)) }
}

function handleSelectionChange() {
  const selection = window.getSelection()
  const root = rootEl.value
  if (!selection || selection.rangeCount === 0 || !root) return
  const anchorInfo = nodeToSpanInfo(selection.anchorNode, selection.anchorOffset)
  const focusInfo = nodeToSpanInfo(selection.focusNode, selection.focusOffset)
  if (!anchorInfo || !focusInfo) return
  if (selection.isCollapsed) {
    emit('selection-change', { pageIndex: props.pageIndex, range: null })
    return
  }
  const startIdx = toCharIndex(anchorInfo.spanIdx, anchorInfo.offset)
  const endIdx = toCharIndex(focusInfo.spanIdx, focusInfo.offset)
  if (startIdx == null || endIdx == null) return
  const start = Math.min(startIdx, endIdx)
  const end = Math.max(startIdx, endIdx)
  emit('selection-change', { pageIndex: props.pageIndex, range: { start, end } })
}

onMounted(() => {
  document.addEventListener('selectionchange', handleSelectionChange)
})

watch(renderedSpans, (spans) => {
  if (!readyEmitted.value && spans.length > 0) {
    readyEmitted.value = true
    emit('layer-ready', { pageIndex: props.pageIndex })
  }
})

function normalizeRange(range: { start: number; end: number; active?: boolean }) {
  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  return { start, end, active: !!range.active }
}

function buildSegmentsForSpan(span: RenderedSpan, ranges: Array<{ start: number; end: number; active: boolean }>): TextSegment[] | null {
  if (!ranges.length) return null
  const text = span.text
  if (!text) return null

  const spanStart = span.start
  const spanEnd = span.end
  const activeIntervals: Array<{ start: number; end: number }> = []
  const highlightIntervals: Array<{ start: number; end: number }> = []

  for (const range of ranges) {
    const overlapStart = Math.max(spanStart, range.start)
    const overlapEnd = Math.min(spanEnd, range.end)
    if (overlapStart > overlapEnd) continue
    if (range.active) activeIntervals.push({ start: overlapStart, end: overlapEnd })
    else highlightIntervals.push({ start: overlapStart, end: overlapEnd })
  }

  if (!activeIntervals.length && !highlightIntervals.length) return null

  const boundarySet = new Set<number>()
  boundarySet.add(spanStart)
  boundarySet.add(spanEnd + 1)
  for (const interval of activeIntervals) {
    boundarySet.add(interval.start)
    boundarySet.add(interval.end + 1)
  }
  for (const interval of highlightIntervals) {
    boundarySet.add(interval.start)
    boundarySet.add(interval.end + 1)
  }
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b)

  const contains = (list: Array<{ start: number; end: number }>, pos: number) => {
    for (const interval of list) {
      if (pos >= interval.start && pos <= interval.end) return true
    }
    return false
  }

  const segments: TextSegment[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const segStart = boundaries[i]
    const segEnd = boundaries[i + 1]
    if (segStart >= segEnd) continue
    if (segStart < spanStart || segStart > spanEnd) continue
    const className = contains(activeIntervals, segStart)
      ? 'match-active'
      : (contains(highlightIntervals, segStart) ? 'match-highlight' : '')
    const localStart = segStart - spanStart
    const localEnd = segEnd - spanStart
    const segmentText = text.slice(localStart, localEnd)
    if (!segmentText) continue
    segments.push({ text: segmentText, className })
  }

  return segments.length ? segments : null
}

const spanSegments = computed(() => {
  const ranges = props.highlightRanges ?? []
  if (!ranges.length) return null
  const normalized = ranges.map(normalizeRange)
  const map = new Map<number, TextSegment[]>()
  for (const span of renderedSpans.value) {
    const segments = buildSegmentsForSpan(span, normalized)
    if (segments) map.set(span.idx, segments)
  }
  return map
})
</script>

<template>
  <div
    class="pdf-text-layer"
    ref="rootEl"
    :style="layerStyle"
  >
    <!-- <div v-if="loading" class="layer-status">載入文字中…</div> -->
    <div v-if="error" class="layer-status error">錯誤: {{ error }}</div>

    <span
      v-for="item in renderedSpans"
      :key="item.idx"
      class="text-span"
      :style="item.style"
      :data-span-index="item.idx"
      :data-char-start="item.start"
      :data-char-end="item.end"
    >
      <template v-if="spanSegments && spanSegments.get(item.idx)">
        <span
          v-for="(segment, segIdx) in spanSegments.get(item.idx)"
          :key="`${item.idx}-${segIdx}`"
          :class="segment.className"
        >{{ segment.text }}</span>
      </template>
      <template v-else>{{ item.text }}</template>
    </span>
  </div>
</template>

<style scoped>
.pdf-text-layer {
  position: absolute;
  left: 0;
  top: 0;
  /* 關鍵 CSS:
    這確保了即使 transform 縮放後，瀏覽器仍能正確處理游標選取 
  */
  user-select: text !important;
  -webkit-user-select: text !important;
  z-index: 10;
  /* 告訴瀏覽器這個元素會變形，啟用 GPU 優化 */
  will-change: transform;
}

.text-span {
  position: absolute;
  white-space: pre;
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: transparent;
  cursor: text;
  pointer-events: auto !important;
  user-select: text !important;
  -webkit-user-select: text !important;
  box-sizing: border-box;
  font-family: sans-serif;
}

.text-span::selection {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  background: rgba(0, 120, 215, 0.3) !important;
}

.match-highlight {
  background: rgba(255, 246, 0, 0.35) !important;
}

.match-active {
  background: rgba(255, 184, 0, 0.55) !important;
}

.layer-status {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(255, 255, 0, 0.5);
  padding: 4px;
  font-size: 10px;
  pointer-events: none;
}

.layer-status.error {
  background: rgba(255, 0, 0, 0.5);
  color: white;
}
</style>
