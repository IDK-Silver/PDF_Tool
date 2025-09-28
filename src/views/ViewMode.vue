<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, markRaw } from 'vue'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import type { PdfFile } from '../types/pdf'
import PdfViewer from '../components/PdfViewer.vue'
import ContextMenu from '../components/ContextMenu.vue'
import type { ContextMenuItem, PagePointerContext } from '../types/viewer'
import { loadSettings, type AppSettings } from '../composables/persistence'
import { getDocument, type PDFDocumentProxy } from '../lib/pdfjs'

const props = defineProps<{ activeFile: PdfFile | null }>()

const pdfDoc = ref<PDFDocumentProxy | null>(null)
const loading = ref(false)
const viewerError = ref<string | null>(null)
const pageCount = ref(0)
const currentPage = ref(1)

const exporting = ref(false)
const exportBanner = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
let bannerTimer: ReturnType<typeof setTimeout> | null = null

const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const lastPageContext = ref<PagePointerContext | null>(null)

const settings = ref<AppSettings>({ exportDpi: 300, exportFormat: 'png', jpegQuality: 0.9, defaultZoomMode: 'fit' })
const menuItems = computed<ContextMenuItem[]>(() => {
  if (!lastPageContext.value) return []
  const fmtLabel = settings.value.exportFormat === 'jpeg' ? 'JPEG' : 'PNG'
  return [{ id: 'export-page', label: `匯出本頁為圖片 (${fmtLabel})`, disabled: exporting.value }]
})

let loadToken = 0

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
  if (!container || !basePageWidth.value) return scale.value
  const inner = Math.max(0, container.clientWidth - 32)
  if (inner <= 0) return scale.value
  return clampScale(inner / basePageWidth.value)
}
async function ensureBasePageWidth() {
  try {
    if (!pdfDoc.value) return
    const page = await pdfDoc.value.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    basePageWidth.value = viewport.width
  } catch {}
}
function setZoomActual() { zoomMode.value = 'actual'; scale.value = 1 }
function setZoomFit() { zoomMode.value = 'fit'; scale.value = computeFitScale() }
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
    loadToken += 1
    const token = loadToken
  contextMenuVisible.value = false
  lastPageContext.value = null
  pageCount.value = 0
  currentPage.value = 1
    viewerError.value = null
    exportBanner.value = null
    exporting.value = false

    await destroyCurrentDoc()

    if (!path) {
      loading.value = false
      return
    }

    loading.value = true

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
      viewerError.value = normalizeError(error)
      await destroyCurrentDoc()
    } finally {
      if (token === loadToken) loading.value = false
    }
  },
  { immediate: true },
)

onBeforeUnmount(async () => {
  await destroyCurrentDoc()
  if (resizeObs) { try { resizeObs.disconnect() } catch {} resizeObs = null }
  window.removeEventListener('keydown', onKeydown)
  if (bannerTimer) { try { clearTimeout(bannerTimer) } catch {} bannerTimer = null }
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
  if (!context) return
  if (id === 'export-page') {
    await exportCurrentPage(context)
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
      filters: [ settings.value.exportFormat === 'jpeg' ? { name: 'JPEG', extensions: ['jpg','jpeg'] } : { name: 'PNG', extensions: ['png'] } ],
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

function onDocLoaded(count: number) {
  pageCount.value = count
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
  if (pageNumber >= 1 && pageNumber <= pageCount.value) currentPage.value = pageNumber
}

function goToPage(n: number) {
  if (!viewerRef.value) return
  const clamped = Math.max(1, Math.min(pageCount.value || 1, Math.floor(n)))
  viewerRef.value.scrollToPage(clamped)
}

function prevPage() { goToPage((currentPage.value || 1) - 1) }
function nextPage() { goToPage((currentPage.value || 1) + 1) }

onMounted(async () => {
  // Load settings and apply default zoom mode
  try {
    settings.value = await loadSettings()
    if (settings.value.defaultZoomMode) zoomMode.value = settings.value.defaultZoomMode
  } catch {}
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
  else if (e.key === '0') { e.preventDefault(); setZoomActual() }
}

function onWindowResize() {
  if (zoomMode.value === 'fit') {
    scale.value = computeFitScale()
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
})

function showBanner(kind: 'success' | 'error', text: string, ms = 2000) {
  if (bannerTimer) { try { clearTimeout(bannerTimer) } catch {} bannerTimer = null }
  exportBanner.value = { kind, text }
  bannerTimer = setTimeout(() => {
    exportBanner.value = null
    bannerTimer = null
  }, ms)
}
</script>

<template>
  <div class="view-mode-root">
    <header class="view-header" v-if="props.activeFile">
      <div class="title"><h2 :title="props.activeFile.name">{{ props.activeFile.name }}</h2></div>
      <div class="header-right">
        <div class="zoom-controls">
          <button type="button" class="btn" :class="{ active: zoomMode === 'actual' }" @click="setZoomActual">實際大小</button>
          <button type="button" class="btn" :class="{ active: zoomMode === 'fit' }" @click="setZoomFit">縮放到適當大小</button>
        </div>
        <div class="page-controls" v-if="pageCount">
          <button class="btn nav" type="button" :disabled="currentPage <= 1" @click="prevPage" aria-label="上一頁">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            class="page-input"
            type="number"
            :min="1"
            :max="pageCount"
            v-model.number="currentPage"
            @keydown.enter.prevent="goToPage(currentPage)"
            @blur="goToPage(currentPage)"
            :style="{ width: (String(pageCount).length + 1) + 'ch' }"
            aria-label="目前頁碼"
          />
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
      <p>請在左側選擇一個 PDF 檔案</p>
    </div>
    <div v-else class="viewer-panel" ref="viewerContainerRef">
      <div v-if="viewerError" class="alert error">{{ viewerError }}</div>
      <div v-else-if="loading" class="loading-state">正在載入 PDF…</div>
      <PdfViewer
        v-else-if="pdfDoc"
        :doc="pdfDoc"
        :scale="scale"
        ref="viewerRef"
        @doc-loaded="onDocLoaded"
        @doc-error="onDocError"
        @visible-page="onVisiblePage"
        @page-contextmenu="onPageContextMenu"
      />
      <div v-else class="empty-state">尚未載入 PDF 內容</div>

      <transition name="fade">
        <div v-if="exportBanner" :class="['banner', exportBanner.kind]">
          {{ exportBanner.text }}
        </div>
      </transition>
    </div>
  </div>

  <ContextMenu
    :visible="contextMenuVisible"
    :x="contextMenuPosition.x"
    :y="contextMenuPosition.y"
    :items="menuItems"
    @close="closeContextMenu"
    @select="onMenuSelect"
  />
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
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.view-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  color: var(--text-muted, #6b7280);
  font-size: 13px;
  margin: 0;
}

.view-header .title {
  flex: 1 1 auto;
  min-width: 0; /* 允許收縮以觸發 ellipsis */
}

.header-right { display: flex; align-items: center; gap: 12px; }
.header-right { flex-shrink: 0; }
.zoom-controls { display: flex; gap: 6px; }
.zoom-controls .btn { border: 1px solid var(--border, #e5e7eb); background: #fff; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.zoom-controls .btn.active { background: var(--hover, #f3f4f6); }

.page-controls { display: flex; align-items: center; gap: 6px; }
.page-controls .btn.nav { display: inline-flex; align-items: center; justify-content: center; padding: 2px 8px; line-height: 1; }
.page-controls .btn.nav .icon { width: 16px; height: 16px; display: block; }
.page-input { height: 28px; text-align: center; border: none; border-radius: 0; padding: 0; background: transparent; outline: none; }
.page-input:focus { outline: none; box-shadow: none; }
/* hide number input arrows */
.page-input::-webkit-outer-spin-button,
.page-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.page-input[type=number] { -moz-appearance: textfield; }
.page-controls .sep { margin: 0 2px; }

.viewer-panel {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  border-radius: 8px;
  background: var(--surface, #f8fafc);
  border: 1px solid var(--border, #e5e7eb);
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
