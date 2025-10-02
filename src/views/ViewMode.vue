<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { ChevronDoubleRightIcon, MagnifyingGlassIcon, ChevronUpIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import PdfViewer from '../components/PdfViewer.vue'
import ImageViewer from '../components/ImageViewer.vue'
import ContextMenu from '../components/ContextMenu.vue'
import { loadSettings, type AppSettings } from '../composables/persistence'
import type { PdfFile } from '../types/pdf'
import type { PagePointerContext } from '../types/viewer'
import { usePageHistory } from '../composables/viewMode/usePageHistory'
import { useExportTools } from '../composables/viewMode/useExportTools'
import { usePageContextMenu } from '../composables/viewMode/usePageContextMenu'
import { usePdfSearch } from '../composables/viewMode/usePdfSearch'
import { useViewerScaling } from '../composables/viewMode/useViewerScaling'
import { useDocumentLoader } from '../composables/viewMode/useDocumentLoader'

const props = defineProps<{ activeFile: PdfFile | null }>()

const activeFileRef = computed(() => props.activeFile)

const {
  pdfDoc,
  loading,
  viewerError,
  pageCount,
  normalizeError,
  destroyCurrentDoc,
  loadDocumentFromPath,
  setDocument,
} = useDocumentLoader()

const currentPage = ref(1)
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

const viewerContainerRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(0)
const viewerRef = ref<any>(null)

const {
  scale,
  zoomMode,
  suppressVisibleUpdate,
  basePageWidth,
  lastAppliedScale,
  computeFitScale,
  setZoomFit,
  setZoomActual,
  zoomIn,
  zoomOut,
  onPinchZoom,
  handleWindowResize,
} = useViewerScaling({
  viewerRef,
  viewerContainerRef,
  pdfDoc,
  isPdfFile,
  isImageFile,
  currentPage,
  settings,
  leftCollapsed,
})

const {
  searchOpen,
  searchQuery,
  searchTotal,
  searchIndex,
  searchInputRef,
  toggleSearch,
  onSearchInput,
  onSearchEnter,
  goToPrevMatch,
  goToNextMatch,
  highlightCurrentMatch,
  persistSearchStateFor,
  applySearchStateFor,
  clearCaches,
  handleDocLoaded,
} = usePdfSearch({
  viewerRef,
  pdfDoc,
  pageCount,
  isPdfFile,
  activeFileRef,
  scale,
  settings,
})


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

watch(
  () => activeFileRef.value?.path ?? null,
  async (path, oldPath, onCleanup) => {
    persistSearchStateFor(oldPath)
    loadToken += 1
    const token = loadToken
    contextMenu.reset()
    resetExportState()
    viewerError.value = null
    pendingRestorePage.value = null
    clearCaches()
    const nextIsPdf = activeFileRef.value?.kind !== 'image'
    applySearchStateFor(path, nextIsPdf)

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
      const doc = await loadDocumentFromPath(path)
      if (cancelled || token !== loadToken) {
        await doc.destroy().catch(() => undefined)
        return
      }
      setDocument(doc, doc.numPages)
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
  persistSearchStateFor(activeFileRef.value?.path ?? null)
  clearCaches()
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

// Repaint search highlights after zoom scale changes so boxes align with text
watch(() => scale.value, async () => {
  if (!isPdfFile.value) return
  if (!searchOpen.value) return
  if (!searchQuery.value.trim()) return
  // keep current index, just re-highlight at new scale
  await highlightCurrentMatch()
})

function onKeydown(event: KeyboardEvent) {
  const meta = event.metaKey || event.ctrlKey
  if (!meta) return
  const key = String(event.key || '')
  if (key.toLowerCase() === 'f') {
    event.preventDefault()
    if (isPdfFile.value) toggleSearch(true)
    return
  }
  // Cmd/Ctrl + B is handled globally to toggle sidebar; do not override.
  const viewerAny: any = viewerRef.value
  // 禁用一次 tween，讓鍵盤縮放即時、不疊加動畫
  try { viewerAny?.disableTweenOnce?.(0) } catch {}
  if (key === '+' || key === '=') { event.preventDefault(); zoomIn() }
  else if (key === '-' || key === '_') { event.preventDefault(); zoomOut() }
  else if (key === '0') { event.preventDefault(); setZoomFit() }
}

const onWindowResize = () => { handleWindowResize() }

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
  void handleDocLoaded()
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
        <button
          v-if="isPdfFile"
          class="search-btn"
          type="button"
          :class="{ active: searchOpen }"
          @click="toggleSearch()"
          aria-label="搜尋文件"
          title="搜尋 (⌘/Ctrl+F)"
        >
          <MagnifyingGlassIcon class="icon" aria-hidden="true" />
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
      <!-- Search overlay at top-left -->
      <div v-if="isPdfFile && searchOpen" class="search-overlay">
        <div class="search-box">
          <MagnifyingGlassIcon class="icon leading" aria-hidden="true" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="搜尋文件…"
            @keydown.enter.prevent="onSearchEnter"
            @keydown.esc.stop.prevent="toggleSearch(false)"
            @input="onSearchInput"
          />
          <div class="meta" v-if="searchTotal != null">{{ searchTotal ? (searchIndex + 1) : 0 }}/{{ searchTotal }}</div>
          <button class="icon-btn" type="button" :disabled="!(searchTotal ?? 0)" @click="goToPrevMatch" title="上一個"><ChevronUpIcon class="icon" /></button>
          <button class="icon-btn" type="button" :disabled="!(searchTotal ?? 0)" @click="goToNextMatch" title="下一個"><ChevronDownIcon class="icon" /></button>
          <button class="icon-btn" type="button" @click="toggleSearch(false)" title="關閉"><XMarkIcon class="icon" /></button>
        </div>
      </div>
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

.search-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: #fff;
  color: var(--text, #111827);
  cursor: pointer;
}

.search-btn .icon {
  width: 16px;
  height: 16px;
}

.search-btn:hover,
.search-btn.active {
  background: var(--hover, #f3f4f6);
}

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

.search-overlay {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 20;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(1.2) blur(4px);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12);
}

.search-box .icon.leading { width: 16px; height: 16px; color: #6b7280; }
.search-box input {
  width: 220px;
  border: none;
  outline: none;
  font-size: 13px;
  background: transparent;
  color: var(--text, #111827);
}
.search-box .meta { font-size: 12px; color: #6b7280; margin-left: 4px; }
.search-box .icon-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid var(--border, #e5e7eb);
  background: #fff;
  cursor: pointer;
}
.search-box .icon-btn:disabled { opacity: 0.4; cursor: default; }
.search-box .icon-btn:not(:disabled):hover { background: var(--hover, #f3f4f6); }
.search-box .icon-btn .icon { width: 16px; height: 16px; }

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
