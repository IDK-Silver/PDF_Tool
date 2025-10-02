<script setup lang="ts">
import { computed, nextTick } from 'vue'
import type { PDFDocumentProxy } from '../lib/pdfjs'
import type { PagePointerContext } from '../types/viewer'
import { usePdfViewerEngine } from '../composables/pdfViewer/usePdfViewerEngine'

type PinchZoomPayload = {
  deltaY: number
  anchorX: number
  anchorY: number
  viewportX: number
  viewportY: number
}

const props = defineProps<{
  doc: unknown | null
  scale?: number
  textIdleMs?: number
  renderIdleMs?: number
  zoomTweenMs?: number
}>()

const emit = defineEmits<{
  (e: 'page-contextmenu', payload: PagePointerContext): void
  (e: 'doc-loading'): void
  (e: 'doc-loaded', pageCount: number): void
  (e: 'doc-error', error: unknown): void
  (e: 'visible-page', pageNumber: number): void
  (e: 'pinch-zoom', payload: PinchZoomPayload): void
}>()

const docRef = computed(() => (props.doc as PDFDocumentProxy | null) ?? null)
const scaleRef = computed(() => props.scale ?? 1.2)

const engine = usePdfViewerEngine({
  doc: docRef,
  scale: scaleRef,
  emit: emit as any,
  textIdleMs: props.textIdleMs,
  renderIdleMs: props.renderIdleMs,
  zoomTweenMs: props.zoomTweenMs,
})

const {
  containerRef,
  pages,
  setCanvasRef,
  setContainerRef,
  setInnerRef,
  prepareZoomAnchor,
  scrollToPage,
  getPageMetrics,
  scrollToPageOffset,
  onPageContextMenu,
  getScrollState,
  scrollToPosition,
} = engine

// --- Simple find/highlight helpers (per page) ---
function clearFindHighlights(pageIndex?: number) {
  try {
    const indices = Array.isArray(pages.value) ? pages.value.map((_, i) => i) : []
    const targets = pageIndex != null ? [pageIndex] : indices
    for (const idx of targets) {
      const page = pages.value[idx]
      const host = page?.inner || page?.container
      const overlay = host?.querySelector('.page-overlay') as HTMLElement | null
      if (!overlay) continue
      const existing = overlay.querySelectorAll('.find-highlight, .find-highlight-current')
      existing.forEach((el) => el.parentElement?.removeChild(el))
    }
  } catch {}
}

async function waitForTextLayer(idx: number, tries = 8, delayMs = 50): Promise<HTMLElement | null> {
  for (let i = 0; i < tries; i++) {
    const page = pages.value[idx]
    const host = page?.inner || page?.container
    const tl = host?.querySelector('.textLayer') as HTMLElement | null
    if (tl) return tl
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return null
}

function collectTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let n: Node | null
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) {
    const t = n as Text
    if (t.nodeValue && t.nodeValue.length) nodes.push(t)
  }
  return nodes
}

function indexOfAll(hay: string, needle: string, caseSensitive = false): number[] {
  const h = caseSensitive ? hay : hay.toLowerCase()
  const n = caseSensitive ? needle : needle.toLowerCase()
  const res: number[] = []
  let pos = 0
  if (!n) return res
  while (true) {
    const i = h.indexOf(n, pos)
    if (i < 0) break
    res.push(i)
    pos = i + n.length
  }
  return res
}

function makeHighlightDiv(x: number, y: number, w: number, h: number, current = false): HTMLDivElement {
  const div = document.createElement('div')
  div.className = current ? 'find-highlight-current' : 'find-highlight'
  Object.assign(div.style, {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${Math.max(1, w)}px`,
    height: `${Math.max(1, h)}px`,
    background: current ? 'rgba(255, 196, 0, 0.45)' : 'rgba(255, 235, 59, 0.28)',
    pointerEvents: 'none',
    borderRadius: '2px',
    border: current ? '2px solid rgba(255, 187, 0, 0.9)' : '1px solid rgba(255, 193, 7, 0.75)',
    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.2) inset',
  } as Partial<CSSStyleDeclaration>)
  return div
}

async function highlightInPage(
  pageIndex: number,
  query: string,
  opts?: { caseSensitive?: boolean; activeIndex?: number },
): Promise<{ total: number; active: number | null }> {
  clearFindHighlights(pageIndex)
  const trimmed = (query || '').trim()
  if (!trimmed) return { total: 0, active: null }
  const pageView = pages.value[pageIndex]
  if (!pageView) return { total: 0, active: null }
  const host = pageView.inner || pageView.container
  const overlay = host?.querySelector('.page-overlay') as HTMLElement | null
  if (!host || !overlay) return { total: 0, active: null }
  const textLayer = await waitForTextLayer(pageIndex)
  if (!textLayer) return { total: 0, active: null }
  await nextTick()

  const caseSensitive = !!opts?.caseSensitive
  const matches: Array<{ rects: Array<{ x: number; y: number; w: number; h: number }> }> = []
  const pageRect = (host as HTMLElement).getBoundingClientRect()

  // Build a flat text buffer across all text nodes to support cross-node matches
  const nodes = collectTextNodes(textLayer)
  const indexMap: Array<{ node: Text; start: number; end: number }> = []
  let accLen = 0
  for (const node of nodes) {
    const val = node.nodeValue || ''
    const start = accLen
    const end = start + val.length
    indexMap.push({ node, start, end })
    accLen = end
  }
  const fullText = nodes.map(n => n.nodeValue || '').join('')
  const globalHits = indexOfAll(fullText, trimmed, caseSensitive)
  for (const hit of globalHits) {
    const startPos = hit
    const endPos = hit + trimmed.length
    // Locate start node
    let si = 0
    while (si < indexMap.length && !(startPos >= indexMap[si].start && startPos < indexMap[si].end)) si++
    if (si >= indexMap.length) continue
    // Locate end node (endPos can equal end; clamp to last char in that node)
    let ei = si
    while (ei < indexMap.length && endPos > indexMap[ei].end) ei++
    if (ei >= indexMap.length) ei = indexMap.length - 1
    const startRec = indexMap[si]
    const endRec = indexMap[ei]
    const startOffset = Math.max(0, startPos - startRec.start)
    const endOffset = Math.max(0, Math.min((endPos - endRec.start), (endRec.end - endRec.start)))
    try {
      const range = document.createRange()
      range.setStart(startRec.node, startOffset)
      range.setEnd(endRec.node, endOffset)
      const rects: Array<{ x: number; y: number; w: number; h: number }> = []
      const rectList = range.getClientRects()
      for (const r of Array.from(rectList)) {
        if (!r.width || !r.height) continue
        rects.push({
          x: r.left - pageRect.left,
          y: r.top - pageRect.top,
          w: r.width,
          h: r.height,
        })
      }
      if (rects.length) matches.push({ rects })
    } catch {
      // ignore faulty ranges
    }
  }

  if (!matches.length) return { total: 0, active: null }

  const activeIndex = Math.max(0, Math.min(matches.length - 1, opts?.activeIndex ?? 0))
  matches.forEach((match, matchIndex) => {
    match.rects.forEach((rect) => {
      overlay.appendChild(makeHighlightDiv(rect.x, rect.y, rect.w, rect.h, matchIndex === activeIndex))
    })
  })

  const focusRect = matches[activeIndex]?.rects?.[0]
  if (focusRect) {
    try { scrollToPageOffset(pageIndex + 1, Math.max(0, focusRect.y - 60)) } catch {}
  }
  return { total: matches.length, active: activeIndex }
}

defineExpose({
  scrollToPage,
  getPageMetrics,
  scrollToPageOffset,
  getScrollState,
  scrollToPosition,
  prepareZoomAnchor,
  disableTweenOnce: (engine as any).disableTweenOnce,
  highlightInPage,
  clearFindHighlights,
})
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
        <div class="page-inner" :style="{ width: `${page.width || 600}px`, height: `${page.height || 0}px` }" @contextmenu="(e) => onPageContextMenu(e, page)" :ref="(el) => setInnerRef(el, page)">
          <canvas :ref="(el) => setCanvasRef(el, page)" class="page-canvas" />
          <div class="page-overlay"></div>
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
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--surface, #f9fafb);
}

/* 確保 PDF 檢視器的滾動條也沒有邊線 */
.pdf-viewer::-webkit-scrollbar {
  width: 6px;
}
.pdf-viewer::-webkit-scrollbar-track {
  background: transparent;
  border: none;
}
.pdf-viewer::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb);
  border-radius: 8px;
  border: none;
}
.pdf-viewer::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover);
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
  width: fit-content;
  margin: 0 auto;
}

.page-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: fit-content;
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
  position: relative;
  z-index: 0;
  pointer-events: none; /* 讓選取事件命中文字層 */
}

.page-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none; /* 不阻擋文字選取/點擊 */
  z-index: 3;
}

/* ensure highlights remain visible over dark/light images */

.page-number {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  text-align: center;
  width: 100%;
}

/* PDF.js 文字層（使用 deep 以套用到動態插入的節點） */
:deep(.textLayer) {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: auto;
  z-index: 2;
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}
:deep(.textLayer span) {
  position: absolute;
  transform-origin: 0 0;
  white-space: pre;
  line-height: 1;
  user-select: text;
  -webkit-user-select: text;
}
</style>
