<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, markRaw, nextTick } from 'vue'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import type { PdfFile } from '../types/pdf'
import PdfViewer from '../components/PdfViewer.vue'
import ImageViewer from '../components/ImageViewer.vue'
import ContextMenu from '../components/ContextMenu.vue'
import type { ContextMenuItem, PagePointerContext } from '../types/viewer'
import { inject } from 'vue'
import type { Ref } from 'vue'
import { ChevronDoubleRightIcon } from '@heroicons/vue/24/outline'
import { loadSettings, type AppSettings, loadAppState, saveAppStateDebounced } from '../composables/persistence'
import { PDFDocument } from 'pdf-lib'
import { getDocument, type PDFDocumentProxy } from '../lib/pdfjs'

const props = defineProps<{ activeFile: PdfFile | null }>()

// 添加對 activeFile prop 變化的監控
watch(
  () => props.activeFile,
  (newFile, oldFile) => {
    console.log('[ViewMode] activeFile prop changed:', {
      old: oldFile ? {id: oldFile.id, name: oldFile.name, path: oldFile.path} : null,
      new: newFile ? {id: newFile.id, name: newFile.name, path: newFile.path} : null
    })
  },
  { immediate: true, deep: true }
)

const pdfDoc = ref<PDFDocumentProxy | null>(null)
const loading = ref(false)
const viewerError = ref<string | null>(null)
const pageCount = ref(0)
const currentPage = ref(1)
const pageHistory = ref<Record<string, { currentPage: number; lastViewed: number }>>({})  // 頁數歷史記錄
const pageHistoryLoaded = ref(false)  // 標記 pageHistory 是否已載入
const suppressVisibleUpdate = ref(false)

// pageHistory 將在 onMounted 中載入

const exporting = ref(false)
const exportBanner = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
let bannerTimer: ReturnType<typeof setTimeout> | null = null

const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const lastPageContext = ref<PagePointerContext | null>(null)

const settings = ref<AppSettings>({ exportDpi: 300, exportFormat: 'png', jpegQuality: 0.9, defaultZoomMode: 'fit' })
const menuItems = computed<ContextMenuItem[]>(() => {
  if (!props.activeFile) return []
  const items: ContextMenuItem[] = []
  items.push({ id: 'open-folder', label: '開啟於資料夾', disabled: !props.activeFile?.path })
  if (lastPageContext.value) {
    // 對 PDF 與圖片都提供一致的功能
    const fmtLabel = 'PNG'
    items.push({ id: 'export-page', label: `匯出本頁為圖片 (${fmtLabel})`, disabled: exporting.value })
    items.push({ id: 'export-page-pdf', label: '匯出本頁為 PDF 檔案', disabled: exporting.value })
  }
  return items
})

let loadToken = 0
const isImageFile = computed(() => props.activeFile?.kind === 'image')
const isPdfFile = computed(() => props.activeFile?.kind !== 'image')
const loadingLabel = computed(() => isImageFile.value ? '正在載入圖片…' : '正在載入 PDF…')

// injected controls for left column collapse
const leftCollapsed = inject('leftCollapsed') as Ref<boolean> | undefined
const setLeftCollapsed = inject('setLeftCollapsed') as ((v?: boolean) => void) | undefined

// Zoom state
const scale = ref(1)
const zoomMode = ref<'actual' | 'fit' | 'custom'>('fit')
const minScale = 0.25
const maxScale = 4
const viewerContainerRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(0)
const basePageWidth = ref(0)
let resizeObs: ResizeObserver | null = null

function clampScale(v: number) { return Math.min(maxScale, Math.max(minScale, v)) }
function computeFitScale(): number {
  const container = viewerContainerRef.value
  if (!basePageWidth.value) return scale.value
  // 對圖片：優先使用 ImageViewer 的實際容器寬度（考慮到垂直捲軸佔用寬度）
  let inner = 0
  if (isImageFile.value) {
    const viewer: any = viewerRef.value
    const w = viewer?.getContainerWidth?.()
    inner = typeof w === 'number' && w > 0 ? w : (container ? container.clientWidth : 0)
  } else {
    inner = container ? Math.max(0, container.clientWidth - 32) : 0
  }
  if (inner <= 0) return scale.value
  return clampScale(inner / basePageWidth.value)
}
async function ensureBasePageWidth() {
  try {
    if (!pdfDoc.value) return
    const page = await pdfDoc.value.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    basePageWidth.value = viewport.width
  } catch { }
}
const lastAppliedScale = ref(1)
function setZoomFit() { applyScaleWithAnchor(computeFitScale(), 'fit') }
function setZoomActual() { applyScaleWithAnchor(1, 'actual') }

const labelActual = computed(() => isImageFile.value ? '1:1（實際像素）' : '實際大小')
const labelFit = computed(() => isImageFile.value ? '填滿寬度' : '縮放到適當大小')
async function applyScaleWithAnchor(newScale: number, mode: 'actual'|'fit'|'custom' = 'custom') {
  const viewer: any = viewerRef.value
  const page = currentPage.value || 1
  const before = viewer?.getPageMetrics?.(page)
  const oldOffset = before ? Math.max(0, before.scrollTop - before.pageTop) : 0
  const ratio = lastAppliedScale.value ? (newScale / lastAppliedScale.value) : 1
  zoomMode.value = mode
  scale.value = newScale
  suppressVisibleUpdate.value = true
  await nextTick(); await nextTick()
  if (viewer?.scrollToPageOffset) viewer.scrollToPageOffset(page, Math.max(0, oldOffset * ratio))
  lastAppliedScale.value = newScale
  currentPage.value = page
  await nextTick()
  suppressVisibleUpdate.value = false
}
function zoomIn(step = 0.1) { zoomMode.value = 'custom'; scale.value = clampScale(scale.value + step) }
function zoomOut(step = 0.1) { zoomMode.value = 'custom'; scale.value = clampScale(scale.value - step) }

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
  if (doc) {
    pdfDoc.value = null
    try {
      await doc.destroy()
    } catch {
      /* ignore */
    }
  }
}

watch(
  () => props.activeFile?.path ?? null,
  async (path, _old, onCleanup) => {
    console.log('[ViewMode] activeFile changed:', props.activeFile)
    console.log('[ViewMode] path:', path);
    loadToken += 1
    const token = loadToken
    contextMenuVisible.value = false
    lastPageContext.value = null
    pageCount.value = 0

    viewerError.value = null
    exportBanner.value = null
    exporting.value = false

    await destroyCurrentDoc()

    if (!path) {
      loading.value = false
      return
    }

    // 立即開始載入，不阻塞於 pageHistory
    loading.value = true
    pageCount.value = 0
    currentPage.value = 1

    // 嘗試恢復頁數（如果 pageHistory 已載入）
    if (pageHistoryLoaded.value && path && pageHistory.value[path] && props.activeFile?.kind !== 'image') {
      currentPage.value = pageHistory.value[path].currentPage
      console.log(`[ViewMode] Restoring page ${pageHistory.value[path].currentPage} for file`)
    } else {
      currentPage.value = 1
    }

    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    if (props.activeFile?.kind === 'image') {
      // Image loading handled by ImageViewer component
      return
    }

    try {
      console.log('[ViewMode] Reading file:', path)
      const bytes = await readFile(path)
      console.log('[ViewMode] File read successfully, bytes length:', bytes.length)

      if (cancelled || token !== loadToken) return

      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)
      console.log('[ViewMode] Creating PDF document from bytes, data length:', data.length)

      const loadingTask = getDocument({ data })
      console.log('[ViewMode] Loading task created, awaiting PDF document...')

      const doc = (await loadingTask.promise) as unknown as PDFDocumentProxy
      console.log('[ViewMode] PDF document loaded successfully, pages:', doc.numPages)

      if (cancelled || token !== loadToken) {
        console.log('[ViewMode] Load cancelled or token changed, destroying doc')
        await doc.destroy().catch(() => undefined)
        return
      }

      pdfDoc.value = markRaw(doc) as unknown as PDFDocumentProxy
      console.log('[ViewMode] PDF document set to reactive state')
    } catch (error) {
      if (token !== loadToken) return
      console.error('[ViewMode] Error loading PDF:', error)
      viewerError.value = normalizeError(error)
      await destroyCurrentDoc()
    } finally {
      if (token === loadToken) {
        console.log('[ViewMode] Setting loading to false')
        loading.value = false
      }
    }
  },
  { immediate: true },
)

onBeforeUnmount(async () => {
  await destroyCurrentDoc()
  if (resizeObs) { try { resizeObs.disconnect() } catch { } resizeObs = null }
  window.removeEventListener('keydown', onKeydown)
  if (bannerTimer) { try { clearTimeout(bannerTimer) } catch { } bannerTimer = null }
})

function closeContextMenu() {
  contextMenuVisible.value = false
}

function onPageContextMenu(context: PagePointerContext) {
  if (!props.activeFile) return
  lastPageContext.value = context
  contextMenuPosition.value = { x: context.clientX, y: context.clientY }
  contextMenuVisible.value = true
}

async function onMenuSelect(id: string) {
  const context = lastPageContext.value
  closeContextMenu()
  if (id === 'open-folder') {
    await openActiveFileInFolder()
    return
  }
  if (!context) return
  if (id === 'export-page') {
    if (isPdfFile.value) await exportCurrentPage(context)
    else await exportCurrentImageAsPng(context)
  } else if (id === 'export-page-pdf') {
    if (isPdfFile.value) await exportCurrentPageAsPdf(context)
    else await exportCurrentImageAsPdf(context)
  }
}

async function getImageAsCanvas(path: string): Promise<HTMLCanvasElement> {
  const bytes = await readFile(path)
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)
  const blob = new Blob([data])
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('圖片載入失敗'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('無法建立 Canvas')
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    try { URL.revokeObjectURL(url) } catch {}
  }
}

async function exportCurrentImageAsPng(_context: PagePointerContext) {
  if (!props.activeFile?.path) return
  exporting.value = true
  exportBanner.value = null
  try {
    const canvas = await getImageAsCanvas(props.activeFile.path)
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('PNG 轉換失敗')), 'image/png')
    })
    const array = new Uint8Array(await blob.arrayBuffer())
    const base = stripExtension(props.activeFile.name)
    const defaultName = `${base}-page001.png`
    const targetPath = await save({ defaultPath: defaultName, filters: [{ name: 'PNG', extensions: ['png'] }] })
    if (!targetPath) return
    await writeFile(targetPath, array)
    showBanner('success', `已匯出 ${defaultName}`)
  } catch (error) {
    showBanner('error', normalizeError(error))
  } finally {
    exporting.value = false
  }
}

async function exportCurrentImageAsPdf(_context: PagePointerContext) {
  if (!props.activeFile?.path) return
  exporting.value = true
  exportBanner.value = null
  try {
    const ext = (props.activeFile.name.split('.').pop() || '').toLowerCase()
    const bytes = await readFile(props.activeFile.path)
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)
    const pdf = await PDFDocument.create()
    let img
    if (ext === 'jpg' || ext === 'jpeg') img = await pdf.embedJpg(data)
    else if (ext === 'png') img = await pdf.embedPng(data)
    else {
      const canvas = await getImageAsCanvas(props.activeFile.path)
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('PNG 轉換失敗')), 'image/png')
      })
      const pngBytes = new Uint8Array(await blob.arrayBuffer())
      img = await pdf.embedPng(pngBytes)
    }
    const width = img.width
    const height = img.height
    const page = pdf.addPage([width, height])
    page.drawImage(img, { x: 0, y: 0, width, height })
    const pdfBytes = await pdf.save()
    const base = stripExtension(props.activeFile.name)
    const defaultName = `${base}-page001.pdf`
    const targetPath = await save({ defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!targetPath) return
    await writeFile(targetPath, new Uint8Array(pdfBytes))
    showBanner('success', `已匯出 ${defaultName}`)
  } catch (error) {
    showBanner('error', normalizeError(error))
  } finally {
    exporting.value = false
  }
}

async function openActiveFileInFolder() {
  const path = props.activeFile?.path
  if (!path) return
  try {
    await revealItemInDir(path)
  } catch (error) {
    console.error('[ViewMode] Failed to reveal file in folder:', error)
    showBanner('error', '無法開啟資料夾，請稍後再試')
  }
}

function stripExtension(name: string) {
  const lastDot = name.lastIndexOf('.')
  if (lastDot <= 0) return name
  return name.slice(0, lastDot)
}

async function exportCurrentPage(context: PagePointerContext) {
  if (!pdfDoc.value || !props.activeFile) return
  exporting.value = true
  exportBanner.value = null
  try {
    const page = await pdfDoc.value.getPage(context.pageNumber)
    // 固定 DPI 渲染（PDF 以 72 DPI 為單位）
    const DPI = settings.value.exportDpi || 300
    const scale = (DPI || 300) / 72
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('無法建立 Canvas 以匯出圖片')
    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    const type = settings.value.exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
    const quality = settings.value.exportFormat === 'jpeg' ? (settings.value.jpegQuality ?? 0.9) : undefined
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
    if (!blob) throw new Error('圖片轉換失敗')
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    const base = stripExtension(props.activeFile.name)
    const ext = settings.value.exportFormat === 'jpeg' ? 'jpg' : 'png'
    const defaultName = `${base}-page${String(context.pageNumber).padStart(3, '0')}.${ext}`

    const targetPath = await save({
      defaultPath: defaultName,
      filters: [settings.value.exportFormat === 'jpeg' ? { name: 'JPEG', extensions: ['jpg', 'jpeg'] } : { name: 'PNG', extensions: ['png'] }],
    })
    if (!targetPath) return

    await writeFile(targetPath, bytes)
    showBanner('success', `已匯出 ${defaultName}`)
  } catch (error) {
    const message = normalizeError(error)
    showBanner('error', message)
  } finally {
    exporting.value = false
  }
}

async function exportCurrentPageAsPdf(context: PagePointerContext) {
  if (!props.activeFile) return
  exporting.value = true
  exportBanner.value = null
  try {
    // 讀取原始 PDF 位元組
    const srcBytes = await readFile(props.activeFile.path)
    const srcPdf = await PDFDocument.load(srcBytes as ArrayBuffer | Uint8Array)
    const dstPdf = await PDFDocument.create()
    const pageIndex = Math.max(0, context.pageNumber - 1)
    const [copied] = await dstPdf.copyPages(srcPdf, [pageIndex])
    dstPdf.addPage(copied)
    const outBytes = await dstPdf.save()

    const base = stripExtension(props.activeFile.name)
    const defaultName = `${base}-page${String(context.pageNumber).padStart(3, '0')}.pdf`
    const targetPath = await save({ defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!targetPath) return

    await writeFile(targetPath, new Uint8Array(outBytes))
    showBanner('success', `已匯出 ${defaultName}`)
  } catch (error) {
    const message = normalizeError(error)
    showBanner('error', message)
  } finally {
    exporting.value = false
  }
}

function onDocLoaded(count: number) {
  if (!isPdfFile.value) return
  pageCount.value = count
  // 恢復之前瀏覽的頁數
  if (props.activeFile?.path && pageHistory.value[props.activeFile.path]) {
    const savedPage = pageHistory.value[props.activeFile.path].currentPage
    if (savedPage > 1 && savedPage <= count) {
      // 使用較長延遲確保 PDF 完全渲染
      setTimeout(() => {
        goToPage(savedPage)
        console.log(`[ViewMode] Restored page ${savedPage} after PDF load`)
      }, 150)
    }
  }
}

function onDocError(error: unknown) {
  viewerError.value = normalizeError(error)
}

watch(
  () => props.activeFile?.id,
  () => {
    closeContextMenu()
  },
)

// PdfViewer ref to call scrolling
const viewerRef = ref<InstanceType<typeof PdfViewer> | null>(null)

function onVisiblePage(pageNumber: number) {
  if (!isPdfFile.value) return
  if (suppressVisibleUpdate.value) return
  if (pageNumber >= 1 && pageNumber <= pageCount.value) {
    currentPage.value = pageNumber
    // 儲存頁數到歷史記錄
    if (props.activeFile?.path) {
      pageHistory.value[props.activeFile.path] = {
        currentPage: pageNumber,
        lastViewed: Date.now()
      }
      savePageHistory()
    }
  }
}

function goToPage(n: number) {
  if (!isPdfFile.value) return
  if (!viewerRef.value) return
  const clamped = Math.max(1, Math.min(pageCount.value || 1, Math.floor(n)))
  viewerRef.value.scrollToPage(clamped)
  // 手動跳轉頁面時也儲存
  if (props.activeFile?.path && clamped !== currentPage.value) {
    currentPage.value = clamped
    pageHistory.value[props.activeFile.path] = {
      currentPage: clamped,
      lastViewed: Date.now()
    }
    savePageHistory()
  }
}

function prevPage() { goToPage((currentPage.value || 1) - 1) }
function nextPage() { goToPage((currentPage.value || 1) + 1) }

function onImageLoading() {
  loading.value = true
  viewerError.value = null
}

function onImageLoaded(payload?: { width?: number; height?: number }) {
  // 圖片固定單頁
  pageCount.value = 1
  // 設定 fit 所需的基準寬度
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

onMounted(async () => {
  // Load settings and page history
  try {
    const [appSettings, appState] = await Promise.all([loadSettings(), loadAppState()])
    settings.value = appSettings
    if (appSettings.defaultZoomMode) zoomMode.value = appSettings.defaultZoomMode

    if (appState?.pageHistory) {
      pageHistory.value = appState.pageHistory
      console.log('[ViewMode] Loaded pageHistory from onMounted with', Object.keys(pageHistory.value).length, 'entries')
    }
  } catch (e) {
    console.error('[ViewMode] Error loading settings or app state:', e)
  } finally {
    // 總是標記為已載入，即使出錯也不阻塞 PDF 載入
    pageHistoryLoaded.value = true
    console.log('[ViewMode] pageHistoryLoaded set to true')
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

watch([pdfDoc, () => zoomMode.value], async ([doc, mode]) => {
  if (!doc) return
  await ensureBasePageWidth()
  if (mode === 'fit') scale.value = computeFitScale()
})

function onKeydown(e: KeyboardEvent) {
  const meta = e.metaKey || e.ctrlKey
  if (!meta) return
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn() }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut() }
  else if (e.key === '0') { e.preventDefault(); setZoomFit() }
}

function onWindowResize() {
  if (zoomMode.value === 'fit' && pdfDoc.value) {
    applyScaleWithAnchor(computeFitScale(), 'fit')
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
})

function showBanner(kind: 'success' | 'error', text: string, ms = 2000) {
  if (bannerTimer) { try { clearTimeout(bannerTimer) } catch { } bannerTimer = null }
  exportBanner.value = { kind, text }
  bannerTimer = setTimeout(() => {
    exportBanner.value = null
    bannerTimer = null
  }, ms)
}

// 儲存頁數歷史到持久化存儲
async function savePageHistory() {
  try {
    const state = await loadAppState()
    if (state) {
      // 合併現有的 pageHistory，避免覆蓋其他檔案的記錄
      const mergedHistory = {
        ...(state.pageHistory || {}),
        ...pageHistory.value
      }
      saveAppStateDebounced({
        ...state,
        pageHistory: mergedHistory
      }, 1000) // 增加防抖時間到 1 秒
    } else {
      // 如果沒有現有狀態，建立新的
      saveAppStateDebounced({
        version: 1,
        lastMode: 'view' as const,
        files: { view: [], convert: [], compose: [] },
        active: { view: null, convert: null, compose: null },
        queries: { view: '', convert: '', compose: '' },
        pageHistory: pageHistory.value
      }, 1000)
    }
  } catch (error) {
    console.warn('[ViewMode] Failed to save page history:', error)
  }
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
      <PdfViewer v-else-if="pdfDoc && isPdfFile" :doc="pdfDoc" :scale="scale" ref="viewerRef" @doc-loaded="onDocLoaded"
        @doc-error="onDocError" @visible-page="onVisiblePage" @page-contextmenu="onPageContextMenu" />
      <ImageViewer v-else-if="isImageFile && props.activeFile?.path" ref="viewerRef" :path="props.activeFile.path" :scale="scale"
        @loading="onImageLoading" @loaded="onImageLoaded" @error="onImageError" @page-contextmenu="onPageContextMenu" />
      <div v-else-if="loading" class="loading-state">{{ loadingLabel }}</div>
      <div v-else class="empty-state">尚未載入內容</div>

      <transition name="fade">
        <div v-if="exportBanner" :class="['banner', exportBanner.kind]">
          {{ exportBanner.text }}
        </div>
      </transition>
    </div>
  </div>

  <ContextMenu :visible="contextMenuVisible" :x="contextMenuPosition.x" :y="contextMenuPosition.y" :items="menuItems"
    @close="closeContextMenu" @select="onMenuSelect" />
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
  /* stretch header border to the edges of right column */
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

.btn-expand { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: none; background: transparent; color: var(--text, #111827); border-radius: 6px; cursor: pointer; margin-right: 6px; }

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

/* hide number input arrows */
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
