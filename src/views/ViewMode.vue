<script setup lang="ts">
import { computed, inject, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { readFile } from '@tauri-apps/plugin-fs'
import { ChevronDoubleRightIcon } from '@heroicons/vue/24/outline'
import PdfViewer from '../components/PdfViewer.vue'
import ImageViewer from '../components/ImageViewer.vue'
import ContextMenu from '../components/ContextMenu.vue'
import { loadSettings, type AppSettings } from '../composables/persistence'
import { getDocument, type PDFDocumentProxy } from '../lib/pdfjs'
import type { PdfFile } from '../types/pdf'
import type { PagePointerContext } from '../types/viewer'
import { usePageHistory } from '../composables/viewMode/usePageHistory'
import { useExportTools } from '../composables/viewMode/useExportTools'
import { usePageContextMenu } from '../composables/viewMode/usePageContextMenu'

type PinchZoomPayload = {
  deltaY: number
  anchorX: number
  anchorY: number
  viewportX: number
  viewportY: number
}

const props = defineProps<{ activeFile: PdfFile | null }>()

const activeFileRef = computed(() => props.activeFile)

const pdfDoc = ref<PDFDocumentProxy | null>(null)
const loading = ref(false)
const viewerError = ref<string | null>(null)
const pageCount = ref(0)
const currentPage = ref(1)
const suppressVisibleUpdate = ref(false)
// Stores a page index we want to restore once the document finishes loading
const pendingRestorePage = ref<number | null>(null)

const settings = ref<AppSettings>({
  exportDpi: 300,
  exportFormat: 'png',
  jpegQuality: 0.9,
  defaultZoomMode: 'fit',
})

const { pageHistoryLoaded, getSavedPage, rememberPage } = usePageHistory()

const isImageFile = computed(() => activeFileRef.value?.kind === 'image')
const isPdfFile = computed(() => activeFileRef.value?.kind !== 'image')
const loadingLabel = computed(() => (isImageFile.value ? '正在載入圖片…' : '正在載入 PDF…'))

const leftCollapsed = inject('leftCollapsed') as Ref<boolean> | undefined
const setLeftCollapsed = inject('setLeftCollapsed') as ((v?: boolean) => void) | undefined

const scale = ref(1)
const zoomMode = ref<'actual' | 'fit' | 'custom'>('fit')
const minScale = 0.01
const maxScale = 4
const viewerContainerRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(0)
const basePageWidth = ref(0)
const lastAppliedScale = ref(1)
const viewerRef = ref<any>(null)
let pinchChain: Promise<void> = Promise.resolve()

let loadToken = 0
let resizeObs: ResizeObserver | null = null

const {
  exporting,
  exportBanner,
  resetExportState,
  openActiveFileInFolder,
  exportCurrentPage,
  exportCurrentPageAsPdf,
  exportCurrentImageAsPng,
  exportCurrentImageAsPdf,
} = useExportTools({
  activeFile: activeFileRef,
  settings,
  pdfDoc,
  normalizeError,
})

const contextMenu = usePageContextMenu({
  activeFile: activeFileRef,
  exporting,
  isPdfFile,
  isImageFile,
  onOpenFolder: openActiveFileInFolder,
  onExportPdfPage: exportCurrentPage,
  onExportPdfPageAsPdf: exportCurrentPageAsPdf,
  onExportImageAsPng: exportCurrentImageAsPng,
  onExportImageAsPdf: exportCurrentImageAsPdf,
})

watch(
  () => props.activeFile,
  (nextFile, prevFile) => {
    console.log('[ViewMode] activeFile prop changed:', {
      prev: prevFile ? { id: prevFile.id, name: prevFile.name, path: prevFile.path } : null,
      next: nextFile ? { id: nextFile.id, name: nextFile.name, path: nextFile.path } : null,
    })
  },
  { immediate: true, deep: true },
)

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function destroyCurrentDoc() {
  const doc = pdfDoc.value
  if (!doc) return
  pdfDoc.value = null
  try {
    await doc.destroy()
  } catch {
    /* ignore */
  }
}

watch(
  () => activeFileRef.value?.path ?? null,
  async (path, _old, onCleanup) => {
    loadToken += 1
    const token = loadToken
    contextMenu.reset()
    resetExportState()
    pageCount.value = 0
    viewerError.value = null
    pendingRestorePage.value = null

    await destroyCurrentDoc()

    if (!path) {
      loading.value = false
      return
    }

    loading.value = true
    currentPage.value = pageHistoryLoaded.value && activeFileRef.value?.kind !== 'image'
      ? getSavedPage(path, 1)
      : 1

    if (activeFileRef.value?.kind === 'image') {
      loading.value = false
      return
    }

    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    try {
      const bytes = await readFile(path)
      if (cancelled || token !== loadToken) return

      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)
      const loadingTask = getDocument({ data })
      const doc = (await loadingTask.promise) as unknown as PDFDocumentProxy

      if (cancelled || token !== loadToken) {
        await doc.destroy().catch(() => undefined)
        return
      }

      pdfDoc.value = markRaw(doc) as unknown as PDFDocumentProxy
    } catch (error) {
      if (token !== loadToken) return
      console.error('[ViewMode] Error loading PDF:', error)
      viewerError.value = normalizeError(error)
      await destroyCurrentDoc()
    } finally {
      if (token === loadToken) loading.value = false
    }
  },
  { immediate: true },
)

watch(
  () => props.activeFile?.id,
  () => {
    contextMenu.reset()
  },
)

// Restore the last viewed page after historical data is available
watch(pageHistoryLoaded, (loaded) => {
  if (!loaded) return
  const path = activeFileRef.value?.path
  if (!path || activeFileRef.value?.kind === 'image') return
  const saved = getSavedPage(path, 1)
  if (saved > 1) {
    if (pageCount.value >= saved && pdfDoc.value) {
      goToPage(saved)
      pendingRestorePage.value = null
    } else {
      pendingRestorePage.value = saved
    }
  }
})

onMounted(async () => {
  try {
    const loadedSettings = await loadSettings()
    settings.value = loadedSettings
    if (loadedSettings.defaultZoomMode) zoomMode.value = loadedSettings.defaultZoomMode
  } catch (error) {
    console.error('[ViewMode] Error loading settings:', error)
  }

  const el = viewerContainerRef.value
  if (el && 'ResizeObserver' in window) {
    resizeObs = new ResizeObserver(() => {
      containerWidth.value = el.clientWidth
      if (zoomMode.value === 'fit') scale.value = computeFitScale()
    })
    resizeObs.observe(el)
    containerWidth.value = el.clientWidth
  }

  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(async () => {
  await destroyCurrentDoc()
  if (resizeObs) {
    try { resizeObs.disconnect() } catch { /* ignore */ }
    resizeObs = null
  }
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onWindowResize)
})

const labelActual = computed(() => (isImageFile.value ? '1:1（實際像素）' : '實際大小'))
const labelFit = computed(() => (isImageFile.value ? '填滿寬度' : '縮放到適當大小'))

function clampScale(value: number) {
  const upper = scale.value > maxScale ? Math.max(lastAppliedScale.value, scale.value) : maxScale
  return Math.min(upper, Math.max(minScale, value))
}

function computeFitScale(): number {
  const container = viewerContainerRef.value
  if (!basePageWidth.value) return scale.value

  let innerWidth = container ? Math.max(0, container.clientWidth - 32) : 0
  if (isImageFile.value) {
    const viewer: any = viewerRef.value
    const widthFromViewer = viewer?.getContainerWidth?.()
    innerWidth = typeof widthFromViewer === 'number' && widthFromViewer > 0
      ? widthFromViewer
      : (container ? container.clientWidth : 0)
  }

  if (innerWidth <= 0) return scale.value
  const rawScale = innerWidth / basePageWidth.value
  return Number.isFinite(rawScale) && rawScale > 0 ? rawScale : scale.value
}

async function ensureBasePageWidth() {
  try {
    if (!pdfDoc.value) return
    const page = await pdfDoc.value.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    basePageWidth.value = viewport.width
  } catch {
    // ignored
  }
}

async function applyScaleWithAnchor(
  newScale: number,
  mode: 'actual' | 'fit' | 'custom' = 'custom',
  anchor?: { x?: number; y?: number; viewportX?: number; viewportY?: number },
) {
  const viewer: any = viewerRef.value
  const page = currentPage.value || 1
  const before = viewer?.getPageMetrics?.(page)
  const oldOffset = before ? Math.max(0, before.scrollTop - before.pageTop) : 0
  const ratio = lastAppliedScale.value ? newScale / lastAppliedScale.value : 1
  const scrollStateBefore = viewer?.getScrollState?.()
  const fallbackContainer = viewerContainerRef.value
  const viewportWidth = scrollStateBefore?.clientWidth ?? fallbackContainer?.clientWidth ?? 0
  const viewportHeight = scrollStateBefore?.clientHeight ?? fallbackContainer?.clientHeight ?? 0
  const pointerViewportX = anchor?.viewportX ?? (viewportWidth ? viewportWidth / 2 : 0)
  const pointerViewportY = anchor?.viewportY ?? (viewportHeight ? viewportHeight / 2 : 0)

  const contentWidthBefore = Math.max(scrollStateBefore?.scrollWidth ?? 0, 1)
  const contentHeightBefore = Math.max(scrollStateBefore?.scrollHeight ?? 0, 1)
  const anchorX = Math.min(1, Math.max(0, anchor?.x ?? (scrollStateBefore ? (scrollStateBefore.scrollLeft + pointerViewportX) / contentWidthBefore : 0.5)))
  const anchorY = Math.min(1, Math.max(0, anchor?.y ?? (scrollStateBefore ? (scrollStateBefore.scrollTop + pointerViewportY) / contentHeightBefore : 0.5)))

  if (viewer?.prepareZoomAnchor) {
    viewer.prepareZoomAnchor({
      x: anchorX,
      y: anchorY,
      viewportX: pointerViewportX,
      viewportY: pointerViewportY,
    })
  }

  zoomMode.value = mode
  scale.value = newScale
  suppressVisibleUpdate.value = true
  await nextTick(); await nextTick()
  // For PDF, its own engine re-anchors vertically; avoid double-adjust.
  if (isImageFile.value && viewer?.scrollToPageOffset) {
    viewer.scrollToPageOffset(page, Math.max(0, oldOffset * ratio))
  }
  lastAppliedScale.value = newScale
  currentPage.value = page
  await nextTick()

  const scrollStateAfter = viewer?.getScrollState?.()
  const shouldAdjustImage = isImageFile.value && viewer?.scrollToPosition && scrollStateAfter
  if (shouldAdjustImage) {
    const contentWidthAfter = Math.max(scrollStateAfter.scrollWidth ?? 0, 1)
    const contentHeightAfter = Math.max(scrollStateAfter.scrollHeight ?? 0, 1)
    const leftRaw = anchorX * contentWidthAfter - pointerViewportX
    const maxLeft = Math.max(0, contentWidthAfter - scrollStateAfter.clientWidth)
    const targetLeft = Math.max(0, Math.min(leftRaw, maxLeft))

    let targetTop: number | undefined
    if (anchor?.y != null) {
      const topRaw = anchorY * contentHeightAfter - pointerViewportY
      const maxTop = Math.max(0, contentHeightAfter - scrollStateAfter.clientHeight)
      targetTop = Math.max(0, Math.min(topRaw, maxTop))
    }

    viewer.scrollToPosition({ left: targetLeft, top: targetTop })
  }

  suppressVisibleUpdate.value = false
}

function setZoomFit() {
  void applyScaleWithAnchor(computeFitScale(), 'fit')
}

function setZoomActual() {
  void applyScaleWithAnchor(1, 'actual')
}

function zoomIn(step = 0.1) {
  const target = clampScale(scale.value + step)
  void applyScaleWithAnchor(target, 'custom')
}

function zoomOut(step = 0.1) {
  const target = clampScale(scale.value - step)
  void applyScaleWithAnchor(target, 'custom')
}

function onPinchZoom(payload: PinchZoomPayload) {
  if (!payload || !Number.isFinite(payload.deltaY)) return
  const factor = Math.exp(-payload.deltaY / 600)
  const target = clampScale(scale.value * factor)
  if (Math.abs(target - scale.value) < 0.0001) return
  const anchor = {
    x: payload.anchorX,
    y: payload.anchorY,
    viewportX: payload.viewportX,
    viewportY: payload.viewportY,
  }
  pinchChain = pinchChain
    .then(() => applyScaleWithAnchor(target, 'custom', anchor))
    .catch((error) => {
      console.error('[ViewMode] Pinch zoom failed:', error)
    })
}

watch([pdfDoc, () => zoomMode.value], async ([doc, mode]) => {
  if (!doc) return
  await ensureBasePageWidth()
  if (mode === 'fit') scale.value = computeFitScale()
})

function onKeydown(event: KeyboardEvent) {
  const meta = event.metaKey || event.ctrlKey
  if (!meta) return
  const viewerAny: any = viewerRef.value
  // 禁用一次 tween，讓鍵盤縮放即時、不疊加動畫
  try { viewerAny?.disableTweenOnce?.(0) } catch {}
  if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomIn() }
  else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomOut() }
  else if (event.key === '0') { event.preventDefault(); setZoomFit() }
}

function onWindowResize() {
  if (zoomMode.value === 'fit' && pdfDoc.value) {
    applyScaleWithAnchor(computeFitScale(), 'fit')
  }
}

function onImageLoading() {
  loading.value = true
  viewerError.value = null
}

function onImageLoaded(payload?: { width?: number; height?: number }) {
  pageCount.value = 1
  if (payload?.width && payload.width > 0) {
    basePageWidth.value = payload.width
  }
  if (zoomMode.value === 'fit') {
    scale.value = computeFitScale()
    lastAppliedScale.value = scale.value
  }
  loading.value = false
}

function onImageError(message: string) {
  loading.value = false
  viewerError.value = message || '無法載入圖片'
}

function onDocLoaded(count: number) {
  if (!isPdfFile.value) return
  pageCount.value = count
  const path = activeFileRef.value?.path
  if (!path) return
  const savedPage = pendingRestorePage.value ?? getSavedPage(path, 1)
  if (savedPage > 1 && savedPage <= count) {
    pendingRestorePage.value = null
    setTimeout(() => {
      goToPage(savedPage)
      console.log(`[ViewMode] Restored page ${savedPage} after PDF load`)
    }, 150)
  }
}

function onDocError(error: unknown) {
  viewerError.value = normalizeError(error)
}

function onVisiblePage(pageNumber: number) {
  if (!isPdfFile.value) return
  if (suppressVisibleUpdate.value) return
  if (pageNumber >= 1 && pageNumber <= pageCount.value) {
    currentPage.value = pageNumber
    const path = activeFileRef.value?.path
    if (path) rememberPage(path, pageNumber)
  }
}

function goToPage(target: number) {
  if (!isPdfFile.value) return
  const viewer = viewerRef.value
  if (!viewer) return
  const clamped = Math.max(1, Math.min(pageCount.value || 1, Math.floor(target)))
  viewer.scrollToPage(clamped)
  const path = activeFileRef.value?.path
  if (path && clamped !== currentPage.value) {
    currentPage.value = clamped
    rememberPage(path, clamped)
  }
}

function prevPage() {
  goToPage((currentPage.value || 1) - 1)
}

function nextPage() {
  goToPage((currentPage.value || 1) + 1)
}

function onPageContextMenu(context: PagePointerContext) {
  if (!activeFileRef.value) return
  contextMenu.open(context)
}
</script>

<template>
  <div class="view-mode-root">
    <header class="view-header">
      <div class="header-left">
        <button v-if="leftCollapsed" class="btn-expand" type="button" @click="setLeftCollapsed?.(false)"
          aria-label="展開側欄" title="展開側欄">
          <ChevronDoubleRightIcon class="icon" aria-hidden="true" />
        </button>
      </div>
      <div class="header-right" v-if="props.activeFile">
        <div class="zoom-controls">
          <span class="zoom-indicator">{{ Math.round(scale * 100) }}%</span>
          <button type="button" class="btn" :class="{ active: zoomMode === 'actual' }" @click="setZoomActual">{{ labelActual }}</button>
          <button type="button" class="btn" :class="{ active: zoomMode === 'fit' }" @click="setZoomFit">{{ labelFit }}</button>
        </div>
        <div class="page-controls" v-if="pageCount">
          <button class="btn nav" type="button" :disabled="currentPage <= 1" @click="prevPage" aria-label="上一頁">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input class="page-input" type="number" :min="1" :max="pageCount" v-model.number="currentPage"
            @keydown.enter.prevent="goToPage(currentPage)" @blur="goToPage(currentPage)"
            :style="{ width: (String(pageCount).length + 1) + 'ch' }" aria-label="目前頁碼" />
          <span class="meta sep">/</span>
          <span class="meta total">{{ pageCount }}</span>
          <button class="btn nav" type="button" :disabled="currentPage >= pageCount" @click="nextPage" aria-label="下一頁">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <div v-if="!props.activeFile" class="empty-state">
      <p>請在左側選擇一個檔案</p>
    </div>
    <div v-else class="viewer-panel" ref="viewerContainerRef">
      <div v-if="viewerError" class="alert error">{{ viewerError }}</div>
      <PdfViewer v-else-if="pdfDoc && isPdfFile" :doc="pdfDoc" :scale="scale" :textIdleMs="settings.viewerTextIdleMs" :renderIdleMs="settings.viewerRenderIdleMs" :zoomTweenMs="settings.viewerZoomTweenMs" ref="viewerRef" @doc-loaded="onDocLoaded"
        @doc-error="onDocError" @visible-page="onVisiblePage" @page-contextmenu="onPageContextMenu" @pinch-zoom="onPinchZoom" />
      <ImageViewer v-else-if="isImageFile && props.activeFile?.path" ref="viewerRef" :path="props.activeFile.path" :scale="scale"
        @loading="onImageLoading" @loaded="onImageLoaded" @error="onImageError" @page-contextmenu="onPageContextMenu"
        @pinch-zoom="onPinchZoom" />
      <div v-else-if="loading" class="loading-state">{{ loadingLabel }}</div>
      <div v-else class="empty-state">尚未載入內容</div>

      <transition name="fade">
        <div v-if="exportBanner" :class="['banner', exportBanner.kind]">
          {{ exportBanner.text }}
        </div>
      </transition>
    </div>
  </div>

  <ContextMenu :visible="contextMenu.visible.value" :x="contextMenu.position.value.x" :y="contextMenu.position.value.y" :items="contextMenu.menuItems.value"
    @close="contextMenu.close" @select="contextMenu.onSelect" />
</template>

<style scoped>
.view-mode-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-left: -12px;
  margin-right: -12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.header-left { display: flex; align-items: center; gap: 6px; }
.header-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }

.meta {
  color: var(--text-muted, #6b7280);
  font-size: 13px;
  margin: 0;
}

.zoom-controls {
  display: flex;
  gap: 8px;
}

.zoom-controls .btn {
  border: 1px solid var(--border, #e5e7eb);
  background: #fff;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
}

.zoom-controls .btn.active {
  background: var(--selected, #f3f4f6);
}

.zoom-controls .zoom-indicator {
  display: inline-flex;
  width: 56px;
  justify-content: flex-end;
  align-items: center;
  color: var(--text-muted, #6b7280);
  font-size: 13px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.btn-expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text, #111827);
  border-radius: 6px;
  cursor: pointer;
  margin-right: 6px;
}

.btn-expand:hover {
  background: var(--hover, #f3f4f6);
}

.btn-expand .icon {
  width: 16px;
  height: 16px;
}

.page-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.page-controls .btn.nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  line-height: 1;
}

.page-controls .btn.nav .icon {
  width: 16px;
  height: 16px;
  display: block;
}

.page-input {
  height: 28px;
  text-align: center;
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
  outline: none;
}

.page-input:focus {
  outline: none;
  box-shadow: none;
}

.page-input::-webkit-outer-spin-button,
.page-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.page-input[type=number] {
  -moz-appearance: textfield;
}

.page-controls .sep {
  margin: 0 2px;
}

.viewer-panel {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  border-radius: 0;
  background: transparent;
  border: none;
  overflow: hidden;
}

.loading-state,
.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #6b7280);
  padding: 24px;
  text-align: center;
}

.alert {
  margin: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.alert.error {
  background: rgba(248, 113, 113, 0.16);
  color: #991b1b;
  border: 1px solid rgba(248, 113, 113, 0.45);
}

.banner {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 13px;
  background: rgba(30, 64, 175, 0.9);
  color: #fff;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.25);
}

.banner.error {
  background: rgba(190, 18, 60, 0.92);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
