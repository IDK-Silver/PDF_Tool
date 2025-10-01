<script setup lang="ts">
import { computed } from 'vue'
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

defineExpose({
  scrollToPage,
  getPageMetrics,
  scrollToPageOffset,
  getScrollState,
  scrollToPosition,
  prepareZoomAnchor,
  disableTweenOnce: (engine as any).disableTweenOnce,
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
  z-index: 1;
}

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
