<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, markRaw, toRaw, onMounted } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { PDFDocumentProxy } from '../lib/pdfjs'
import type { PagePointerContext } from '../types/viewer'

const props = defineProps<{
  doc: unknown | null
  scale?: number
}>()

const emit = defineEmits<{
  (e: 'page-contextmenu', payload: PagePointerContext): void
  (e: 'doc-loading'): void
  (e: 'doc-loaded', pageCount: number): void
  (e: 'doc-error', error: unknown): void
  (e: 'visible-page', pageNumber: number): void
}>()

interface PageView {
  pageNumber: number
  width: number
  height: number
  scale: number
  canvas: HTMLCanvasElement | null
  renderTask: any
  container?: HTMLDivElement | null
  // virtualization/render control
  renderToken?: number
  queued?: boolean
  lastRenderedScale?: number
}

const containerRef = ref<HTMLDivElement | null>(null)
const pages = ref<PageView[]>([])

// --- Layout model (predictive) ---
// Base measurements at scale=1
const baseHeights = ref<number[]>([])
const baseWidth = ref<number>(0)

// Fixed gaps/extras (align CSS)
const containerPaddingTop = ref<number>(16) // .pdf-viewer padding-top
const pageListGap = ref<number>(24) // .page-list gap between pages
const pageLabelExtra = ref<number>(20) // 8px gap + label height (~12)
const pageGap = computed(() => pageListGap.value + pageLabelExtra.value)

// Derived for current scale
const scaledHeights = ref<number[]>([])
const tops = ref<number[]>([])

const displayScale = computed(() => props.scale ?? 1.2)

// --- Virtualization + render queue ---
const bufferPages = ref<number>(2)
const maxConcurrentRenders = 3
let inFlight = 0
const renderQueue: PageView[] = []
const currentIndex = ref<number>(0)

function enqueue(pv: PageView) {
  if (pv.queued) return
  pv.queued = true
  renderQueue.push(pv)
  pump()
}

function pump() {
  while (inFlight < maxConcurrentRenders && renderQueue.length) {
    const pv = renderQueue.shift()!
    startRender(pv)
  }
}

async function startRender(pv: PageView) {
  const doc = lastDoc
  if (!doc || !pv.canvas) { pv.queued = false; return }
  inFlight++
  // Bump token to invalidate older attempts
  const token = (pv.renderToken = (pv.renderToken || 0) + 1)
  pv.scale = displayScale.value
  try {
    await renderPage(doc, pv)
    // If token changed during render (superseded), ignore
    if (pv.renderToken !== token) return
    pv.lastRenderedScale = pv.scale
  } finally {
    pv.queued = false
    inFlight--
    pump()
  }
}

function updateRenderWindow() {
  const n = pages.value.length
  if (!n) return
  const idx = currentIndex.value
  const start = Math.max(0, idx - bufferPages.value)
  const end = Math.min(n - 1, idx + bufferPages.value)
  for (let i = 0; i < n; i++) {
    const pv = pages.value[i]
    const inRange = i >= start && i <= end
    if (!pv.canvas) continue
    if (inRange) {
      // schedule render if stale or not yet rendered at current scale
      if (pv.lastRenderedScale !== displayScale.value) enqueue(pv)
    } else {
      // cancel out-of-range render to free resources
      if (pv.renderTask) void cancelTask(pv.renderTask)
      pv.queued = false
    }
  }
}

async function cancelTask(task: any) {
  if (!task) return
  try { task.cancel?.() } catch {}
  try { await task.promise } catch {}
}

async function resetPages() {
  for (const view of pages.value) {
    await cancelTask(view.renderTask)
    view.renderTask = null
  }
  pages.value = []
  baseHeights.value = []
  baseWidth.value = 0
  scaledHeights.value = []
  tops.value = []
}

async function renderPage(doc: PDFDocumentProxy, pageView: PageView) {
  try {
    const pdfPage = await doc.getPage(pageView.pageNumber)
    const viewport = pdfPage.getViewport({ scale: pageView.scale })
    const outputScale = window.devicePixelRatio || 1
    pageView.width = viewport.width
    pageView.height = viewport.height

    if (!pageView.canvas) return

    const canvas = pageView.canvas
    const context = canvas.getContext('2d')
    if (!context) return

    // Ensure any previous render on this canvas is fully cancelled before touching it
    await cancelTask(pageView.renderTask)

    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined

    const renderTask = pdfPage.render({
      canvas,
      canvasContext: context,
      viewport,
      transform,
    })
    pageView.renderTask = markRaw(renderTask)
    await renderTask.promise
  } catch (error: any) {
    const name = error?.name || ''
    const msg = (error?.message || '').toString()
    if (name === 'RenderingCancelledException' || msg.includes('Rendering cancelled')) {
      // Ignore expected cancellations during re-render (e.g., scale/resize changes)
      return
    }
    emit('doc-error', error)
  }
}

let lastDoc: PDFDocumentProxy | null = null
let lastScale = 1
let suppressVisibleUpdate = false

function binarySearchIndex(anchor: number): number {
  const t = tops.value
  const h = scaledHeights.value
  const n = t.length
  if (n === 0) return 0
  if (anchor <= t[0]) return 0
  if (anchor >= t[n - 1] + h[n - 1]) return n - 1
  let lo = 0, hi = n - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const start = t[mid]
    const end = start + h[mid]
    if (anchor < start) hi = mid - 1
    else if (anchor >= end) lo = mid + 1
    else return mid
  }
  return Math.max(0, Math.min(n - 1, lo))
}

function recomputeLayout(scale: number) {
  const n = baseHeights.value.length
  const h = new Array<number>(n)
  const t = new Array<number>(n)
  for (let i = 0; i < n; i++) h[i] = baseHeights.value[i] * scale
  let acc = containerPaddingTop.value
  for (let i = 0; i < n; i++) {
    t[i] = acc
    acc += h[i] + pageGap.value
  }
  scaledHeights.value = h
  tops.value = t
  // Update predicted width/height for page containers
  const w = baseWidth.value * scale
  for (const pv of pages.value) {
    pv.width = w
    pv.height = h[pv.pageNumber - 1] || 0
  }
}

function reanchorToCenter(_oldScale: number, newScale: number) {
  const container = containerRef.value
  if (!container || !pages.value.length) return
  const oldHeights = scaledHeights.value
  const oldTops = tops.value
  const anchor = container.scrollTop + container.clientHeight / 2
  const idx = binarySearchIndex(anchor)
  const within = Math.max(0, anchor - oldTops[idx])
  const ratio = oldHeights[idx] > 0 ? Math.min(1, within / oldHeights[idx]) : 0
  // Recompute layout at new scale before jump
  recomputeLayout(newScale)
  const newAnchorTop = (tops.value[idx] || 0) + (scaledHeights.value[idx] || 0) * ratio - container.clientHeight / 2
  suppressVisibleUpdate = true
  container.scrollTo({ top: Math.max(0, newAnchorTop), behavior: 'auto' })
  // release next frame
  requestAnimationFrame(() => { suppressVisibleUpdate = false })
}

// Measure static extras once DOM exists
onMounted(() => {
  const el = containerRef.value
  if (el) {
    const cs = getComputedStyle(el)
    const pt = parseFloat(cs.paddingTop || '16')
    if (!Number.isNaN(pt)) containerPaddingTop.value = pt
  }
})

watch(
  () => [props.doc as PDFDocumentProxy | null, displayScale.value] as const,
  async ([doc, scale]) => {
    const currentDoc = toRaw(props.doc) as PDFDocumentProxy | null
    if (!doc || !currentDoc) {
      await resetPages()
      lastDoc = null
      return
    }

    // If document changed, rebuild DOM and base layout
    if (doc !== lastDoc) {
      await resetPages()
      // Clear any pending queued renders from previous doc
      renderQueue.length = 0
      inFlight = 0
      emit('doc-loading')
      const total = doc.numPages
      // Measure base sizes at scale=1
      baseHeights.value = []
      baseWidth.value = 0
      for (let i = 1; i <= total; i++) {
        const p = await doc.getPage(i)
        const vp = p.getViewport({ scale: 1 })
        if (i === 1) baseWidth.value = vp.width
        baseHeights.value.push(vp.height)
      }
      // Build page views
      pages.value = Array.from({ length: total }, (_, index) =>
        reactive<PageView>({
          pageNumber: index + 1,
          width: 0,
          height: 0,
          scale,
          canvas: null,
          renderTask: null,
          container: null,
        }),
      )
      // Predictive layout first
      recomputeLayout(scale)
      await nextTick()
      // Measure page label height once if available to refine gap
      try {
        const firstLabel = pages.value[0]?.container?.querySelector<HTMLDivElement>('.page-number')
        if (firstLabel) {
          const lh = Math.ceil(firstLabel.getBoundingClientRect().height)
          if (lh > 0) pageLabelExtra.value = 8 + lh
          // Recompute with refined extras
          recomputeLayout(scale)
        }
      } catch {}
      // Render pages progressively
      lastDoc = doc
      lastScale = scale
      // Initialize visible index and schedule initial renders
      const container = containerRef.value
      if (container) {
        const anchor = container.scrollTop + container.clientHeight / 2
        currentIndex.value = binarySearchIndex(anchor)
      } else {
        currentIndex.value = 0
      }
      updateRenderWindow()
      if (toRaw(props.doc) === doc) emit('doc-loaded', total)
      return
    }

    // Same document, only scale changed: do not rebuild DOM, just re-render pages
    if (scale !== lastScale) {
      emit('doc-loading')
      // Reanchor and update predictive layout immediately
      reanchorToCenter(lastScale, scale)
      // Invalidate rendered scale and schedule only visible window
      for (const pv of pages.value) { pv.lastRenderedScale = undefined }
      updateRenderWindow()
      lastScale = scale
      emit('doc-loaded', pages.value.length)
    }
  },
  { immediate: true },
)

onBeforeUnmount(async () => {
  await resetPages()
})

function setCanvasRef(
  el: HTMLCanvasElement | Element | ComponentPublicInstance | null,
  page: PageView,
) {
  page.canvas = (el as HTMLCanvasElement | null) ?? null
}

function setContainerRef(el: HTMLDivElement | Element | ComponentPublicInstance | null, page: PageView) {
  page.container = (el as HTMLDivElement | null) ?? null
}

// Compute current page using container center + binary search (no DOM reads)
let rafId: number | null = null
function updateCurrentPage() {
  const container = containerRef.value
  if (!container || !pages.value.length) return
  const anchor = container.scrollTop + container.clientHeight / 2
  const idx = binarySearchIndex(anchor)
  currentIndex.value = idx
  emit('visible-page', (idx || 0) + 1)
}
function onScroll() {
  if (suppressVisibleUpdate) return
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => { rafId = null; updateCurrentPage(); updateRenderWindow() })
}
watch(containerRef, (el, prev) => {
  try { prev?.removeEventListener('scroll', onScroll) } catch {}
  el?.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => {
  const el = containerRef.value
  try { el?.removeEventListener('scroll', onScroll) } catch {}
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
})

// Keep anchor stable on container resize
let resizeObs: ResizeObserver | null = null
watch(containerRef, (el) => {
  try { resizeObs?.disconnect() } catch {}
  if (el) {
    resizeObs = new ResizeObserver(() => {
      if (!pages.value.length) return
      // No scale change; anchor to same page/ratio with new viewport height
      const container = containerRef.value!
      const anchor = container.scrollTop + container.clientHeight / 2
      const idx = binarySearchIndex(anchor)
      const within = Math.max(0, anchor - (tops.value[idx] || 0))
      const ratio = (scaledHeights.value[idx] || 1) > 0 ? Math.min(1, within / (scaledHeights.value[idx] || 1)) : 0
      const newAnchorTop = (tops.value[idx] || 0) + (scaledHeights.value[idx] || 0) * ratio - container.clientHeight / 2
      suppressVisibleUpdate = true
      container.scrollTo({ top: Math.max(0, newAnchorTop), behavior: 'auto' })
      requestAnimationFrame(() => { suppressVisibleUpdate = false; updateCurrentPage(); updateRenderWindow() })
    })
    resizeObs.observe(el)
  }
})
onBeforeUnmount(() => { try { resizeObs?.disconnect() } catch {} })

function scrollToPage(pageNumber: number, _opts?: { smooth?: boolean }) {
  const container = containerRef.value
  if (!container) return
  const clamped = Math.max(1, Math.min(pages.value.length || 1, pageNumber))
  if (!tops.value.length) return
  const targetTop = tops.value[clamped - 1]
  container.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
}

function getPageMetrics(pageNumber: number) {
  const container = containerRef.value
  if (!container) return null
  const idx = Math.max(0, Math.min((pages.value.length || 1) - 1, pageNumber - 1))
  const pageTop = tops.value[idx] || 0
  const pageHeight = scaledHeights.value[idx] || 0
  return { pageTop, pageHeight, scrollTop: container.scrollTop }
}

function scrollToPageOffset(pageNumber: number, offsetPx: number) {
  const container = containerRef.value
  if (!container) return
  const idx = Math.max(0, Math.min((pages.value.length || 1) - 1, pageNumber - 1))
  const pageTop = tops.value[idx] || 0
  const target = pageTop + Math.max(0, offsetPx)
  container.scrollTo({ top: Math.max(0, target), behavior: 'auto' })
}

defineExpose({ scrollToPage, getPageMetrics, scrollToPageOffset })

function onPageContextMenu(event: MouseEvent, page: PageView) {
  event.preventDefault()
  const canvas = page.canvas
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const offsetY = event.clientY - rect.top
  const pdfX = offsetX / page.scale
  const pdfY = (page.height - offsetY) / page.scale

  emit('page-contextmenu', {
    pageNumber: page.pageNumber,
    pageIndex: page.pageNumber - 1,
    scale: page.scale,
    width: page.width,
    height: page.height,
    offsetX,
    offsetY,
    clientX: event.clientX,
    clientY: event.clientY,
    pdfX,
    pdfY,
  })
}
</script>

<template>
  <div class="pdf-viewer" ref="containerRef">
    <div v-if="!doc" class="empty-state">
      <p>請在左側選擇一個 PDF 檔案</p>
    </div>
    <div v-else class="page-list">
      <div
        v-for="page in pages"
        :key="page.pageNumber"
        class="page-container"
        :style="{ width: `${page.width || 600}px` }"
        :ref="(el) => setContainerRef(el, page)"
      >
        <div class="page-inner" :style="{ width: `${page.width || 600}px`, height: `${page.height || 0}px` }">
          <canvas :ref="(el) => setCanvasRef(el, page)" class="page-canvas" />
          <div class="page-overlay" @contextmenu="(e) => onPageContextMenu(e, page)"></div>
        </div>
        <div class="page-number">第 {{ page.pageNumber }} 頁</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  position: relative;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--surface, #f9fafb);
}

.empty-state {
  margin: auto;
  color: var(--text-muted, #6b7280);
}

.page-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
}

.page-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.page-inner {
  position: relative;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.page-canvas {
  display: block;
  width: 100%;
  height: auto;
}

.page-overlay {
  position: absolute;
  inset: 0;
}

.page-number {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
}
</style>
