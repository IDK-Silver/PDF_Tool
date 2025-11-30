<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import type { PageTextContent, TextSpan } from '@/modules/media/types'

// Canvas 測量工具（模組層級，避免 Vue 響應式代理）
// 用於計算瀏覽器實際渲染文字的寬度，解決字型渲染差異
const measureCanvas = document.createElement('canvas')
const measureCtx = measureCanvas.getContext('2d')!
const widthCache = new Map<string, number>()

function getMeasuredWidth(text: string, fontSize: number): number {
  const key = `${fontSize}:${text}`
  if (widthCache.has(key)) return widthCache.get(key)!

  measureCtx.font = `${fontSize}px sans-serif`
  const w = measureCtx.measureText(text).width
  widthCache.set(key, w)
  return w
}

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

// 使用 shallowRef + freeze：避免為大量 spans 建立 Proxy
const textContent = shallowRef<PageTextContent | null>(null)
// 直接顯示所有 spans（因為已經在 Rust 端合併，數量大幅減少）
const displayedSpans = shallowRef<TextSpan[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let fetchToken = 0

// 計算 CSS Transform 的縮放比例
// 文字永遠以 PDF 原始座標（pt）渲染，縮放交給 GPU 處理
const layerTransform = computed(() => {
  const sx = Number.isFinite(props.pxPerPointX) && props.pxPerPointX > 0
    ? props.pxPerPointX
    : 1
  const sy = Number.isFinite(props.pxPerPointY) && props.pxPerPointY > 0
    ? props.pxPerPointY
    : 1
  return `scale(${sx}, ${sy})`
})

watch(
  () => [props.docId, props.pageIndex],
  async () => {
    if (!props.docId || props.pageIndex < 0) return

    loading.value = true
    error.value = null
    const token = ++fetchToken

    // 切換頁面時先清空，避免殘影
    textContent.value = null
    displayedSpans.value = []
    widthCache.clear() // 清空測量緩存

    try {
      const result = await media.getPageTextContent(props.pageIndex)
      if (token !== fetchToken) return
      if (result) {
        textContent.value = Object.freeze(result)
        // 直接使用 spans（已在 Rust 端合併，數量少很多）
        displayedSpans.value = result.spans
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
  // 清理
  textContent.value = null
  displayedSpans.value = []
  widthCache.clear()
})

// 使用原始 PDF 座標（pt），並用 scaleX 強制對齊文字寬度
// 這是解決字型渲染差異的根本方案（PDF.js 標準技術）
function getSpanStyle(span: TextSpan, pageH: number) {
  const left = span.x
  const width = Math.max(0, span.width)
  const height = Math.max(0, span.height) // 這就是 fontSize
  // PDF 座標系原點在左下，HTML 在左上
  const top = pageH - span.y - span.height

  // 測量瀏覽器認為這串字應該多寬
  const measuredW = getMeasuredWidth(span.text, height)

  // 計算縮放比例：PDF 要的寬度 / 瀏覽器算出的寬度
  // 如果 measuredW 為 0（例如空字串），則 scaleX 為 1 避免錯誤
  let scaleX = 1
  if (measuredW > 0 && width > 0) {
    scaleX = width / measuredW
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
    height: `${height}px`,
    fontSize: `${height}px`,
    lineHeight: '1',
    // 使用 scaleX 強制拉伸/壓縮文字以符合 PDF 寬度
    transform: `scaleX(${scaleX})`,
    // 變形原點設為左側，保證左對齊正確，向右拉伸
    transformOrigin: '0 0',
  }
}

// 搜尋高亮：計算每個 span 的高亮狀態
// 注意：highlightRanges 現在是字元索引，需要轉換為 span 索引
// 暫時先用簡化版本：如果 span 包含任何高亮字元，整個 span 高亮
const highlightedSpanIndices = computed<Set<number>>(() => {
  const set = new Set<number>()
  const ranges = props.highlightRanges ?? []
  if (!ranges.length) return set

  const content = textContent.value
  if (!content) return set

  // 建立字元索引到 span 索引的映射
  let charOffset = 0
  for (let spanIdx = 0; spanIdx < content.spans.length; spanIdx++) {
    const span = content.spans[spanIdx]
    const spanStart = charOffset
    const spanEnd = charOffset + span.text.length - 1

    // 檢查是否與任何 range 重疊
    for (const range of ranges) {
      if (!range) continue
      const start = Math.min(range.start, range.end)
      const end = Math.max(range.start, range.end)
      // 判斷是否重疊
      if (spanStart <= end && spanEnd >= start) {
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
  if (!activeRanges.length) return set

  const content = textContent.value
  if (!content) return set

  let charOffset = 0
  for (let spanIdx = 0; spanIdx < content.spans.length; spanIdx++) {
    const span = content.spans[spanIdx]
    const spanStart = charOffset
    const spanEnd = charOffset + span.text.length - 1

    for (const range of activeRanges) {
      if (!range) continue
      const start = Math.min(range.start, range.end)
      const end = Math.max(range.start, range.end)
      if (spanStart <= end && spanEnd >= start) {
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
    :style="{
      width: `${props.pageWidthPt}px`,
      height: `${props.pageHeightPt}px`,
      transform: layerTransform,
      transformOrigin: 'top left',
    }"
  >
    <div v-if="loading" class="layer-status">載入文字中…</div>
    <div v-if="error" class="layer-status error">錯誤: {{ error }}</div>

    <span
      v-for="(span, idx) in displayedSpans"
      :key="idx"
      class="text-span"
      :class="getSpanClass(idx)"
      :style="getSpanStyle(span, props.pageHeightPt)"
      :data-span-index="idx"
    >{{ span.text }}</span>
  </div>
</template>

<style scoped>
.pdf-text-layer {
  position: absolute;
  left: 0;
  top: 0;
  user-select: text !important;
  -webkit-user-select: text !important;
  overflow: hidden;
  z-index: 10;
  contain: layout style;
  /* 啟用 GPU 加速，縮放時不觸發 Layout */
  will-change: transform;
}

.text-span {
  position: absolute;
  /* 使用 pre 確保空格被保留且具有寬度 */
  white-space: pre;

  /* 讓文字透明，但保留選取能力 */
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: transparent;

  cursor: text;
  pointer-events: auto !important;
  user-select: text !important;
  -webkit-user-select: text !important;
  box-sizing: border-box;

  /* 設定通用無襯線字體，跟 Canvas 測量一致 */
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
