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
const renderedSpans = shallowRef<Array<{ text: string, style: any, idx: number }>>([])
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
  return content.spans.map((span, idx) => {
    const left = span.x
    // PDF 原點在左下，HTML 在左上，這裡用原始 pt 計算
    const top = pageH - span.y - span.height
    const fontSize = Math.max(0, span.height)
    const width = Math.max(0, span.width)

    // 計算水平拉伸 (解決字型差異)
    const measuredW = getMeasuredWidth(span.text, fontSize)
    let scaleX = 1
    if (measuredW > 0 && width > 0) {
      scaleX = width / measuredW
    }

    return {
      text: span.text,
      idx,
      style: {
        left: `${left}px`,
        top: `${top}px`,
        fontSize: `${fontSize}px`,
        height: `${fontSize}px`,
        lineHeight: '1',
        transform: `scaleX(${scaleX})`,
        transformOrigin: '0 0'
      }
    }
  })
}

watch(
  () => [props.docId, props.pageIndex],
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
        textContent.value = Object.freeze(result)
        // 收到資料後，計算一次樣式並快取起來
        renderedSpans.value = precomputeSpans(result)
        readyEmitted.value = false
      } else {
        error.value = '無法取得頁面文字'
      }
    } catch (err) {
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

// 高亮邏輯
const highlightedSpanIndices = computed<Set<number>>(() => {
  const set = new Set<number>()
  const ranges = props.highlightRanges ?? []
  if (!ranges.length || !textContent.value) return set

  const content = textContent.value
  let charOffset = 0
  for (let spanIdx = 0; spanIdx < content.spans.length; spanIdx++) {
    const span = content.spans[spanIdx]
    const spanEnd = charOffset + span.text.length - 1
    for (const range of ranges) {
      if (!range) continue
      const start = Math.min(range.start, range.end)
      const end = Math.max(range.start, range.end)
      if (charOffset <= end && spanEnd >= start) {
        set.add(spanIdx)
        break
      }
    }
    charOffset += span.text.length
  }
  return set
})

const activeSpanIndices = computed<Set<number>>(() => {
  const set = new Set<number>()
  const ranges = props.highlightRanges ?? []
  const activeRanges = ranges.filter(r => r?.active)
  if (!activeRanges.length || !textContent.value) return set

  const content = textContent.value
  let charOffset = 0
  for (let spanIdx = 0; spanIdx < content.spans.length; spanIdx++) {
    const span = content.spans[spanIdx]
    const spanEnd = charOffset + span.text.length - 1
    for (const range of activeRanges) {
      if (!range) continue
      const start = Math.min(range.start, range.end)
      const end = Math.max(range.start, range.end)
      if (charOffset <= end && spanEnd >= start) {
        set.add(spanIdx)
        break
      }
    }
    charOffset += span.text.length
  }
  return set
})

function getSpanClass(idx: number) {
  if (activeSpanIndices.value.has(idx)) return 'match-active'
  if (highlightedSpanIndices.value.has(idx)) return 'match-highlight'
  return ''
}
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
      :class="getSpanClass(item.idx)"
      :style="item.style"
      :data-span-index="item.idx"
    >{{ item.text }}</span>
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
