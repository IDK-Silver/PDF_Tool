<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, markRaw, toRaw } from 'vue'
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
}

const containerRef = ref<HTMLDivElement | null>(null)
const pages = ref<PageView[]>([])

const displayScale = computed(() => props.scale ?? 1.2)

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

    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined

    await cancelTask(pageView.renderTask)
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

watch(
  () => [props.doc as PDFDocumentProxy | null, displayScale.value] as const,
  async ([doc]) => {
    await resetPages()
    if (!doc) return

    emit('doc-loading')
    const total = doc.numPages
    pages.value = Array.from({ length: total }, (_, index) =>
      reactive<PageView>({
        pageNumber: index + 1,
        width: 0,
        height: 0,
        scale: displayScale.value,
        canvas: null,
        renderTask: null,
        container: null,
      }),
    )
    await nextTick()
    for (const pageView of pages.value) {
      const currentDoc = toRaw(props.doc) as PDFDocumentProxy | null
      if (!currentDoc || doc !== currentDoc) break
      pageView.scale = displayScale.value
      await renderPage(currentDoc, pageView)
    }
    const finalDoc = toRaw(props.doc) as PDFDocumentProxy | null
    if (finalDoc && doc === finalDoc) {
      emit('doc-loaded', total)
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
  if (page.container && io) io.observe(page.container)
}

// IntersectionObserver to detect most visible page
let io: IntersectionObserver | null = null
let visibleRatios = new Map<Element, number>()
function ensureIO() {
  if (io) return
  const root = containerRef.value || undefined
  io = new IntersectionObserver((entries) => {
    for (const e of entries) visibleRatios.set(e.target, e.intersectionRatio)
    let bestEl: Element | null = null
    let best = 0
    for (const [el, ratio] of visibleRatios.entries()) {
      if (ratio > best) { best = ratio; bestEl = el }
    }
    if (bestEl) {
      const pv = pages.value.find(p => p.container === bestEl)
      if (pv) emit('visible-page', pv.pageNumber)
    }
  }, { root, threshold: [0, 0.25, 0.5, 0.75, 1] })
}

watch(containerRef, () => { ensureIO() })

onBeforeUnmount(() => {
  try { io?.disconnect() } catch {}
  io = null
})

function scrollToPage(pageNumber: number) {
  const container = containerRef.value
  if (!container) return
  const clamped = Math.max(1, Math.min(pages.value.length || 1, pageNumber))
  const pv = pages.value.find(p => p.pageNumber === clamped)
  if (!pv || !pv.container) return
  const rect = pv.container.getBoundingClientRect()
  const root = container.getBoundingClientRect()
  const top = container.scrollTop + (rect.top - root.top)
  container.scrollTo({ top, behavior: 'smooth' })
}

defineExpose({ scrollToPage })

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
        <div class="page-inner">
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
