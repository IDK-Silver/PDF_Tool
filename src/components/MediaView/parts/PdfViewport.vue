<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import { tempDir, join, dirname } from '@tauri-apps/api/path'

import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import { useExportSettings } from '@/modules/export/settings'
import { useZoom, type ZoomContext } from '@/modules/media/useZoom'

import PdfTextLayer from './PdfTextLayer.vue'
import PdfSearchPanel from './PdfSearchPanel.vue'
import PdfPageContextMenu from './PdfPageContextMenu.vue'
import AnnotationLayer from './AnnotationLayer.vue'
import { usePdfSearch } from './usePdfSearch'
import { useAnnotationStore } from '@/modules/annotation/store'

import {
  pdfDeletePagesDoc,
  pdfInsertBlank,
  pdfRotatePageRelative,
  pdfExportPageImage,
  pdfExportPagePdf,
  pdfOpen,
  pdfClose,
  pdfCopyPage,
  imageToPdf,
} from '@/modules/media/service'

// console.log 必須移到所有 import 之後
console.log('[PdfViewport] Component script setup executed')

const { t } = useI18n()
const media = useMediaStore()
const settings = useSettingsStore()
const filelist = useFileListStore()
const exportSettings = useExportSettings()
const annotationStore = useAnnotationStore()

const {
  viewMode,
  zoomTarget, // 使用者手動設定的 Zoom (Actual 模式用)
  displayFitPercent, // 自動計算的 Fit Zoom (Fit 模式用)
  displayZoom, // 僅供 UI 顯示用
  canZoomIn,
  canZoomOut,
  setZoom,
  resetZoom,
  setFitMode,
  setEffectiveMax,
  handleWheelZoom: zoomHandleWheel,
} = useZoom({ max: 800 })

const scrollRootEl = ref<HTMLElement | null>(null)

// [重構核心] 統一的渲染縮放比例
// 無論是 Fit 還是 Actual，畫面渲染都依賴這個 computed
const currentRenderingZoom = computed(() => {
  if (viewMode.value === 'fit') {
    // 確保有值，預設 100
    return displayFitPercent.value ?? 100
  }
  return zoomTarget.value
})

const clampZoomMax = (v: number | null | undefined) => {
  const val = Number.isFinite(v) ? Number(v) : 400
  return Math.min(800, Math.max(50, Math.round(val)))
}
const zoomMax = computed(() => clampZoomMax(settings.s.zoomMaxPercent))
watch(zoomMax, (v) => setEffectiveMax(v), { immediate: true })

function createZoomContext(): ZoomContext | null {
  const root = scrollRootEl.value
  if (!root) return null

  return {
    scrollContainer: root,
    getPageElement: (index: number) =>
      root.querySelector(`[data-pdf-page="${index}"]`) as HTMLElement | null,
    getPageCardElement: (index: number) => {
      const wrapper = root.querySelector(`[data-pdf-page="${index}"]`)
      return wrapper?.querySelector('.bg-card') as HTMLElement | null
    },
    getBaseCssWidth: (index: number) => media.baseCssWidthAt100(index),
    centerPageIndex: centerIndex.value,
  }
}

const isLayoutResizing = ref(false)
const isRestoringLastPage = ref(true)
let restoreToken = 0

function getRenderFormat() {
  return settings.s.renderFormat
}
function getRenderQuality() {
  const fmt = settings.s.renderFormat
  if (fmt === 'jpeg') return settings.s.jpegQuality
  if (fmt === 'webp') return 85
  return 75
}
function getPageDisplayUrl(idx: number): string | undefined {
  const page = media.pdfPages[idx]
  if (!page) return undefined
  if (page.highResUrl) return page.highResUrl
  return undefined
}

function isRawPage(idx: number): boolean {
  const page = media.pdfPages[idx]
  return !!page && page.format === 'raw' && !!page.rawImageData
}

function drawRawInto(el: HTMLCanvasElement | null, idx: number) {
  if (!el) return
  const page = media.pdfPages[idx]
  if (!page || page.format !== 'raw' || !page.rawImageData) return
  const d = page.rawImageData
  if (el.width !== d.width) el.width = d.width
  if (el.height !== d.height) el.height = d.height
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.putImageData(d, 0, 0)
}

const totalPages = computed(() => media.descriptor?.pages ?? 0)
const docId = computed(() => media.docId)

function dprForMode() {
  // Fit 模式下也使用統一的 currentRenderingZoom 來判斷
  return viewMode.value === 'fit' ? Math.min(window.devicePixelRatio || 1, settings.s.dprCap) : 1
}
function dpiForActual() {
  const dpi = Math.max(24, Math.round(96 * (currentRenderingZoom.value / 100)))
  const cap = Math.max(48, settings.s.actualModeDpiCap || dpi)
  return Math.min(dpi, cap)
}

async function handleZoomIn() {
  const ctx = createZoomContext()
  const currentZoom = Math.round(currentRenderingZoom.value)
  await setZoom(currentZoom + 25, ctx, { type: 'viewport-center' })
  triggerRerender(300)
}

async function handleZoomOut() {
  const ctx = createZoomContext()
  const currentZoom = Math.round(currentRenderingZoom.value)
  await setZoom(currentZoom - 25, ctx, { type: 'viewport-center' })
  triggerRerender(300)
}

async function handleResetZoom() {
  const ctx = createZoomContext()
  await resetZoom(ctx, { type: 'viewport-center' })
  triggerRerender(300)
}

async function handleSetFitMode() {
  const ctx = createZoomContext()
  // Always recalculate fit percent based on current page width
  await updateFitPercent()
  if (viewMode.value !== 'fit') {
    await setFitMode(ctx, { type: 'viewport-center' })
  }
  triggerRerender(300)

  // CSS handles centering via margin:auto, just reset scrollLeft after layout settles
  setTimeout(() => {
    centerPageHorizontally(displayPageIndex.value)
  }, 100)
}

function triggerRerender(delay: number = 0) {
  pendingIdx.clear()
  const tp = totalPages.value || 0
  if (tp > 0) {
    const start = Math.max(0, visibleStart.value)
    const end = Math.min(tp - 1, visibleEnd.value)
    for (let i = start; i <= end; i++) pendingIdx.add(i)
  }
  rafScheduled = false
  scheduleHiResRerender(delay)
}

// 頁面頂部的視覺留白，讓閱讀體驗更舒適
const VISUAL_PADDING = 32

const centerIndex = ref(0)
const displayPageIndex = ref(0)
const currentPage = computed(() => {
  const tp = totalPages.value
  if (!tp || tp <= 0) return 0
  return Math.min(tp, Math.max(1, displayPageIndex.value + 1))
})

async function waitForLayout(maxRetries = 20) {
  // 1. 等待寬度
  for (let i = 0; i < maxRetries; i++) {
    const w = scrollRootEl.value?.clientWidth || 0
    if (w > 0) {
      containerW.value = w
      break
    }
    await new Promise(r => requestAnimationFrame(r))
  }

  // 2. 等待 Fit 計算
  await updateFitPercent()

  // 3. 等待 Vue 更新
  await nextTick()
  await new Promise(r => requestAnimationFrame(r))
}

async function gotoPage(page: number) {
  const tp = totalPages.value || 0
  if (tp <= 0) return
  const idx = Math.min(tp - 1, Math.max(0, Math.floor(page) - 1))

  centerIndex.value = idx
  displayPageIndex.value = idx

  // [垂直修正核心] 預載尺寸
  // 確保目標頁面及之前所有頁面都有尺寸，防止 offsetTop 計算錯誤
  const missingIndices: number[] = []
  for (let i = 0; i <= idx; i++) {
    if (!media.pageSizesPt[i]) {
      missingIndices.push(i)
    }
  }
  if (missingIndices.length > 0) {
    await Promise.all(missingIndices.map(i => media.getPageSizePt(i).catch(() => {})))
  }

  // 等待 Layout 與 Zoom 穩定
  if (viewMode.value === 'fit') {
    await waitForLayout()
  } else {
    await nextTick()
  }

  const root = scrollRootEl.value
  if (!root) return

  const tryScroll = (): Promise<void> => {
    return new Promise((resolve) => {
      const attempt = (retries: number) => {
        const el = root.querySelector(`[data-pdf-page="${idx}"]`) as HTMLElement | null

        if (el) {
          const cardEl = el.querySelector('.bg-card') as HTMLElement | null

          // 若 Card 還沒渲染出來，繼續重試
          if (!cardEl && retries > 0) {
            requestAnimationFrame(() => attempt(retries - 1))
            return
          }

          const targetEl = cardEl || el
          const elTop = targetEl.offsetTop
          const elHeight = targetEl.offsetHeight
          const elWidth = targetEl.offsetWidth
          const containerHeight = root.clientHeight

          // 安全檢查：尺寸異常小代表 CSS 未載入，重試
          if ((elHeight < 10 || elWidth < 10) && retries > 0) {
            requestAnimationFrame(() => attempt(retries - 1))
            return
          }

          let targetTop = 0
          // Case A: 頁面小於視窗 -> 垂直置中
          if (elHeight < containerHeight) {
            targetTop = elTop - (containerHeight / 2) + (elHeight / 2)
          }
          // Case B: 頁面大於視窗 -> 靠上對齊，並保留視覺留白
          else {
            const rootRect = root.getBoundingClientRect()
            const cardRect = targetEl.getBoundingClientRect()
            const cardTopRelativeToRoot = cardRect.top - rootRect.top + root.scrollTop
            targetTop = cardTopRelativeToRoot - VISUAL_PADDING
          }

          // 執行垂直捲動
          root.scrollTop = Math.max(0, targetTop)

          pendingIdx.add(idx)
          scheduleProcess()

          // CSS handles centering via margin:auto, just reset scrollLeft after layout settles
          centerPageHorizontally(idx)
          setTimeout(() => {
            centerPageHorizontally(idx)
            resolve()
          }, 100)

        } else if (retries > 0) {
          requestAnimationFrame(() => attempt(retries - 1))
        } else {
          resolve()
        }
      }
      attempt(5)
    })
  }

  await tryScroll()
}

async function restoreLastPage(path: string, d: { pages?: number }) {
  const token = ++restoreToken
  if (media.loading) {
    await new Promise<void>((resolve) => {
      const checkLoading = () => {
        if (!media.loading) resolve()
        else requestAnimationFrame(checkLoading)
      }
      checkLoading()
    })
  }
  const ready = filelist.ready
  const cachedLast = ready ? filelist.getLastPage(path) : undefined
  if (!ready || (typeof cachedLast === 'number' && cachedLast > 1)) {
    isRestoringLastPage.value = true
  } else {
    isRestoringLastPage.value = false
  }

  try { await filelist.whenReady() } catch { }
  if (token !== restoreToken) return

  const last = filelist.getLastPage(path)
  if (typeof last !== 'number' || last < 1) {
    displayPageIndex.value = 0
    centerIndex.value = 0
    isRestoringLastPage.value = false
    return
  }

  const targetIdx = Math.min((d.pages || 1) - 1, Math.max(0, Math.floor(last) - 1))
  displayPageIndex.value = targetIdx
  centerIndex.value = targetIdx

  if (last <= 1) {
    isRestoringLastPage.value = false
    return
  }

  try {
    try {
      await media.getPageSizePt(targetIdx)
    } catch (e) {
      console.warn('[PdfViewport] Failed to preload page size:', e)
    }

    await waitForLayout()

    await new Promise<void>((resolve) => {
      const checkDOM = () => {
        const root = scrollRootEl.value
        if (root && root.clientWidth > 0) {
          const el = root.querySelector(`[data-pdf-page="${targetIdx}"]`)
          if (el) {
            resolve()
            return
          }
        }
        requestAnimationFrame(checkDOM)
      }
      checkDOM()
    })

    await gotoPage(last)
  } finally {
    if (token === restoreToken) {
      isRestoringLastPage.value = false
    }
  }
}

watch(
  () => media.descriptor?.path,
  async (p) => {
    const d = media.descriptor
    if (!p || !d || d.type !== 'pdf') return

    await restoreLastPage(p, d)
  },
)

type PdfSearchPanelExpose = {
  inputEl: { value: HTMLInputElement | null }
  focusInput: () => void
}

const searchPanelRef = ref<PdfSearchPanelExpose | null>(null)
const getSearchInputEl = () => searchPanelRef.value?.inputEl?.value ?? null
const focusSearchInput = () => searchPanelRef.value?.focusInput()

const {
  searchVisible,
  searchTerm,
  searchMatches,
  searchBusy,
  searchError,
  searchSummary,
  searchPanelStyle,
  openSearch,
  closeSearch,
  toggleSearch,
  showNextMatch,
  showPrevMatch,
  onGlobalKeyDown,
  handleWindowResize,
  getPageHighlightRanges,
  setSearchAnchor,
} = usePdfSearch({
  media,
  scrollRootEl,
  centerIndex,
  totalPages,
  gotoPage,
  getSearchInputEl,
  focusSearchInput,
})

type UndoSource = 'annotation' | 'pdf'
type UndoRouteEntry = { source: UndoSource; pageIndex: number }
const redoRouteStack: UndoRouteEntry[] = []

function handleGlobalKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const tag = target?.tagName
  const isTextInput = tag === 'INPUT' || tag === 'TEXTAREA' || (target as any)?.isContentEditable
  const meta = e.metaKey || e.ctrlKey
  if (meta && e.key.toLowerCase() === 'z') {
    if (isTextInput) return
    const pageIndexBefore = displayPageIndex.value
    const wantsRedo = e.shiftKey
    if (wantsRedo) {
      e.preventDefault()
      e.stopPropagation()
      let routed: UndoRouteEntry | null = null
      while (redoRouteStack.length > 0) {
        const entry = redoRouteStack.pop() as UndoRouteEntry
        if (entry.source === 'annotation') {
          if (annotationStore.canRedo) {
            routed = entry
            break
          }
          continue
        }
        routed = entry
        break
      }
      if (routed?.source === 'annotation') {
        annotationStore.redo()
        void gotoPage(routed.pageIndex + 1)
        return
      }
      if (routed?.source === 'pdf') {
        media.redo().then((res) => {
          if (!res) return
          const pages = res.pages || 0
          pendingIdx.clear()
          const target = Math.max(0, Math.min(routed.pageIndex, Math.max(0, pages - 1)))
          void gotoPage(target + 1).then(() => {
            scheduleHiResRerender(0)
          })
        }).catch(() => {})
        return
      }
      if (annotationStore.canRedo) {
        annotationStore.redo()
        void gotoPage(pageIndexBefore + 1)
        return
      }
      media.redo().then((res) => {
        if (!res) return
        const pages = res.pages || 0
        pendingIdx.clear()
        const target = Math.max(0, Math.min(pageIndexBefore, Math.max(0, pages - 1)))
        void gotoPage(target + 1).then(() => {
          scheduleHiResRerender(0)
        })
      }).catch(() => {})
      return
    }

    if (annotationStore.canUndo) {
      e.preventDefault()
      e.stopPropagation()
      annotationStore.undo()
      redoRouteStack.push({ source: 'annotation', pageIndex: pageIndexBefore })
      return
    }
    e.preventDefault()
    media.undo().then((res) => {
      if (!res) return
      redoRouteStack.push({ source: 'pdf', pageIndex: pageIndexBefore })
      const pages = res.pages || 0
      const clamped = Math.max(0, Math.min(centerIndex.value, Math.max(0, pages - 1)))
      centerIndex.value = clamped
      displayPageIndex.value = clamped
      pendingIdx.clear()
      scheduleHiResRerender(0)
    }).catch(() => {})
    return
  }
  onGlobalKeyDown(e)
}

watch([() => media.descriptor?.path, currentPage], ([p, cp]) => {
  const d = media.descriptor
  if (!p || !d || d.type !== 'pdf') return
  if (typeof cp === 'number' && cp > 0) filelist.setLastPage(p, cp)
})

watch(docId, async () => {
  await nextTick()
  updateVisibleByScroll()
  void primeTextLayerForPage(displayPageIndex.value)
})

watch(
  () => media.descriptor?.path,
  () => {
    lastSelection.value = null
    redoRouteStack.length = 0
  },
)

const menu = ref<{ open: boolean; x: number; y: number; pageIndex: number; aboveHalf: boolean }>({
  open: false,
  x: 0,
  y: 0,
  pageIndex: -1,
  aboveHalf: true,
})
function onPageContextMenu(idx: number, e: MouseEvent) {
  closeMenu()
  const target = (e.currentTarget as HTMLElement) || (e.target as HTMLElement)
  const rect = target?.getBoundingClientRect()
  const aboveHalf = rect ? e.clientY < rect.top + rect.height / 2 : true

  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  const estimatedMenuWidth = 200
  const estimatedMenuHeight = 240

  let x = e.clientX
  let y = e.clientY

  if (viewportWidth > 0 && x + estimatedMenuWidth > viewportWidth - 12) {
    x = viewportWidth - estimatedMenuWidth - 12
  }
  if (viewportHeight > 0 && y + estimatedMenuHeight > viewportHeight - 12) {
    y = viewportHeight - estimatedMenuHeight - 12
  }
  x = Math.max(12, x)
  y = Math.max(12, y)

  menu.value = { open: true, x, y, pageIndex: idx, aboveHalf }
}

function closeMenu() {
  menu.value.open = false
}
function onGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const inMainMenu = target.closest('[data-context-menu]')
  const inExportMenu = target.closest('[data-export-submenu]')
  if (!inMainMenu && !inExportMenu && menu.value.open) {
    closeMenu()
  }
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMenu()
}
onMounted(() => {
  window.addEventListener('click', onGlobalClick, { capture: true })
  window.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => {
  window.removeEventListener('click', onGlobalClick, { capture: true })
  window.removeEventListener('keydown', onEsc)
})

const shiftDown = ref(false)
function updateShiftState(e: KeyboardEvent) { shiftDown.value = !!e.shiftKey }
onMounted(() => {
  window.addEventListener('keydown', updateShiftState)
  window.addEventListener('keyup', updateShiftState)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', updateShiftState)
  window.removeEventListener('keyup', updateShiftState)
})

async function deletePageFromMenu(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  const oldPagesArr = media.pdfPages.slice()
  const oldDescriptor = { ...d }
  const oldSizes: Record<number, { widthPt: number; heightPt: number }> = { ...media.pageSizesPt }
  const oldCenter = centerIndex.value
  const oldDirty = media.dirty
  const oldRevision = media.revision
  try {
    media.pdfPages.splice(pageIndex, 1)
    const shifted: Record<number, { widthPt: number; heightPt: number }> = {}
    for (const k of Object.keys(oldSizes)) {
      const idx = Number(k)
      const v = oldSizes[idx]
      if (idx < pageIndex) shifted[idx] = v
      else if (idx > pageIndex) shifted[idx - 1] = v
    }
    media.pageSizesPt = shifted as any
    media.descriptor = { ...d, pages: Math.max(0, (d.pages || 1) - 1) } as any
    if (pageIndex <= oldCenter) {
      centerIndex.value = Math.max(0, oldCenter - 1)
    }
    try {
      media.cancelQueued(pageIndex)
    } catch { }
    try {
      media.cancelInflight(pageIndex)
    } catch { }
    const res = await pdfDeletePagesDoc({ docId: id, indices: [pageIndex] })
    media.descriptor = { ...media.descriptor!, pages: res.pages } as any
    media.setDirtyState(res.dirty, res.revision)
    pendingIdx.clear()
    const tp = res.pages
    for (let i = pageIndex; i < Math.min(tp, pageIndex + 5); i++) pendingIdx.add(i)
    scheduleHiResRerender(0)
  } catch (e: any) {
    media.pdfPages = oldPagesArr as any
    media.pageSizesPt = oldSizes as any
    media.descriptor = oldDescriptor as any
    centerIndex.value = oldCenter
    media.setDirtyState(oldDirty, oldRevision)
    alert(e?.message || String(e))
  }
}

async function exportPageAsImage(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  const fmt = exportSettings.s.imageFormat
  const dpi = Math.max(24, Math.floor(exportSettings.s.imageDpi))
  const sz = await media.getPageSizePt(pageIndex)
  let targetWidth: number | undefined = undefined
  if (sz) targetWidth = Math.max(1, Math.round((sz.widthPt * dpi) / 72))
  const page1 = String(pageIndex + 1).padStart(3, '0')
  const base = (d.name?.replace(/\.pdf$/i, '') || 'page') + ` - page ${page1}.${fmt}`
  const suggested = await join(await dirname(d.path), base)
  const picked = await saveDialog({ defaultPath: suggested, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] })
  if (!picked) return
  try {
    await pdfExportPageImage({
      docId: id,
      pageIndex,
      destPath: picked,
      format: fmt,
      targetWidth,
      dpi,
      quality: fmt === 'jpeg' ? exportSettings.s.imageQuality : undefined,
    })
  } catch (e: any) {
    alert(e?.message || String(e))
  }
}

async function exportPageAsPdf(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  const page1 = String(pageIndex + 1).padStart(3, '0')
  const base = (d.name?.replace(/\.pdf$/i, '') || 'page') + ` - page ${page1}.pdf`
  const suggested = await join(await dirname(d.path), base)
  const picked = await saveDialog({ defaultPath: suggested, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (!picked) return
  try {
    await pdfExportPagePdf({ docId: id, pageIndex, destPath: picked })
  } catch (e: any) {
    alert(e?.message || String(e))
  }
}

function mmToPt(mm: number): number {
  return Math.round((mm * 72) / 25.4)
}
async function insertDefaultDimsPt(pageIndex: number): Promise<{ widthPt: number; heightPt: number }> {
  const p = settings.s.insertPaper
  const orient = settings.s.insertOrientation
  if (p === 'CurrentPage') {
    const currentSize = media.pageSizesPt[pageIndex] || await media.getPageSizePt(pageIndex)
    if (currentSize) {
      return {
        widthPt: currentSize.widthPt,
        heightPt: currentSize.heightPt,
      }
    }
  }
  let wmm = 210
  let hmm = 297
  if (p === 'Letter') {
    wmm = 215.9
    hmm = 279.4
  } else if (p === 'A5') {
    wmm = 148
    hmm = 210
  } else if (p === 'Legal') {
    wmm = 215.9
    hmm = 355.6
  } else if (p === 'Tabloid') {
    wmm = 279.4
    hmm = 431.8
  } else if (p === 'Custom') {
    wmm = Math.max(1, settings.s.insertCustomWidthMm)
    hmm = Math.max(1, settings.s.insertCustomHeightMm)
  }
  let wpt = mmToPt(wmm)
  let hpt = mmToPt(hmm)
  if (orient === 'landscape') {
    const t = wpt
    wpt = hpt
    hpt = t
  }
  return { widthPt: wpt, heightPt: hpt }
}

async function insertBlankAt(pageIndex: number, before: boolean) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  const { widthPt, heightPt } = await insertDefaultDimsPt(pageIndex)
  const insertIndex = before ? pageIndex : pageIndex + 1
  const oldPagesArr = media.pdfPages.slice()
  const oldDescriptor = { ...d }
  const oldSizes: Record<number, { widthPt: number; heightPt: number }> = { ...media.pageSizesPt }
  const oldCenter = centerIndex.value
  const oldDirty = media.dirty
  const oldRevision = media.revision

  // [修復] 插入操作期間鎖定佈局，防止 updateVisibleByScroll 在佈局不穩定時運行
  const root = scrollRootEl.value
  const savedScrollTop = root?.scrollTop || 0
  const lockedPage = displayPageIndex.value
  isLayoutResizing.value = true

  try {
    media.pdfPages.splice(insertIndex, 0, null)
    const shifted: Record<number, { widthPt: number; heightPt: number }> = {}
    for (const k of Object.keys(oldSizes)) {
      const idx = Number(k)
      const v = oldSizes[idx]
      if (idx < insertIndex) shifted[idx] = v
      else shifted[idx + 1] = v
    }
    shifted[insertIndex] = { widthPt, heightPt }
    media.pageSizesPt = shifted as any
    media.descriptor = { ...d, pages: Math.max(0, (d.pages || 0) + 1) } as any
    if (insertIndex <= oldCenter) centerIndex.value = oldCenter + 1
    const res = await pdfInsertBlank({ docId: id, index: insertIndex, widthPt, heightPt })
    media.descriptor = { ...media.descriptor!, pages: res.pages } as any
    media.setDirtyState(res.dirty, res.revision)
    pendingIdx.clear()
    const tp = res.pages
    for (let i = insertIndex; i < Math.min(tp, insertIndex + 6); i++) pendingIdx.add(i)
    scheduleHiResRerender(0)

    // [修復] 等待佈局穩定後恢復
    await nextTick()
    await new Promise<void>(r => requestAnimationFrame(() => r()))

    // 恢復滾動位置，確保用戶視角不變
    if (root && insertIndex <= lockedPage) {
      // 如果插入在當前頁面之前，需要調整滾動位置以補償新增頁面的高度
      const newPageEl = root.querySelector(`[data-pdf-page="${insertIndex}"]`) as HTMLElement | null
      if (newPageEl) {
        root.scrollTop = savedScrollTop + newPageEl.offsetHeight + 16 // 16 為頁面間距
      }
    }
  } catch (e: any) {
    media.pdfPages = oldPagesArr as any
    media.pageSizesPt = oldSizes as any
    media.descriptor = oldDescriptor as any
    centerIndex.value = oldCenter
    media.setDirtyState(oldDirty, oldRevision)
    alert(e?.message || String(e))
  } finally {
    // [修復] 延遲解鎖，確保佈局完全穩定
    setTimeout(() => {
      isLayoutResizing.value = false
      updateVisibleByScroll()
      centerPageHorizontally(centerIndex.value)
    }, 100)
  }
}

async function insertBlankQuick(pageIndex: number) {
  const before = (menu.value.aboveHalf ? 1 : 0) ^ (shiftDown.value ? 1 : 0)
  await insertBlankAt(pageIndex, !!before)
}

async function insertFileQuick(pageIndex: number) {
  const before = (menu.value.aboveHalf ? 1 : 0) ^ (shiftDown.value ? 1 : 0)
  await insertFileAt(pageIndex, !!before)
}

async function insertFileAt(pageIndex: number, before: boolean) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  const picked = await openDialog({
    multiple: false,
    filters: [
      { name: 'PDF / 圖片', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif'] },
    ],
  })
  if (!picked) return
  const path = Array.isArray(picked) ? picked[0] : picked
  const lower = path.toLowerCase()
  const insertIndex = Math.max(0, Math.min((d.pages || 0), before ? pageIndex : pageIndex + 1))

  const oldPagesArr = media.pdfPages.slice()
  const oldDescriptor = { ...d }
  const oldSizes: Record<number, { widthPt: number; heightPt: number }> = { ...media.pageSizesPt }
  const oldCenter = centerIndex.value
  const oldDirty = media.dirty
  const oldRevision = media.revision

  // [修復] 插入操作期間鎖定佈局，防止 updateVisibleByScroll 在佈局不穩定時運行
  const root = scrollRootEl.value
  const savedScrollTop = root?.scrollTop || 0
  const lockedPage = displayPageIndex.value
  isLayoutResizing.value = true

  let inserted = 0
  let finalPages = d.pages || 0
  let lastMutation: { dirty: boolean; revision: number; pages: number } | null = null

  try {
    if (lower.endsWith('.pdf')) {
      const src = await pdfOpen(path)
      inserted = src.pages

      media.pdfPages.splice(insertIndex, 0, ...Array(inserted).fill(null))
      const shifted: Record<number, { widthPt: number; heightPt: number }> = {}
      for (const k of Object.keys(oldSizes)) {
        const idx = Number(k)
        const v = oldSizes[idx]
        if (idx < insertIndex) shifted[idx] = v
        else shifted[idx + inserted] = v
      }
      const def = await insertDefaultDimsPt(pageIndex)
      for (let i = 0; i < inserted; i++) shifted[insertIndex + i] = def
      media.pageSizesPt = shifted as any
      media.descriptor = { ...d, pages: Math.max(0, (d.pages || 0) + inserted) } as any
      if (insertIndex <= oldCenter) centerIndex.value = oldCenter + inserted
      pendingIdx.clear()
      for (let i = insertIndex; i < insertIndex + Math.min(inserted + 6, (media.descriptor?.pages || 0) - insertIndex); i++) pendingIdx.add(i)
      scheduleHiResRerender(0)

      for (let i = 0; i < src.pages; i++) {
        const res = await pdfCopyPage({ srcDocId: src.docId, srcIndex: i, destDocId: id, destIndex: insertIndex + i })
        finalPages = res.pages
        lastMutation = res
      }
      try { await pdfClose(src.docId) } catch { }
    } else {
      inserted = 1
      // 先轉換圖片為 PDF 並獲取實際尺寸
      const dir = await tempDir()
      const tempPath = await join(dir, `insert-${Date.now()}.pdf`)
      const imgResult = await imageToPdf({ srcPath: path, destPath: tempPath })

      media.pdfPages.splice(insertIndex, 0, null)
      const shifted: Record<number, { widthPt: number; heightPt: number }> = {}
      for (const k of Object.keys(oldSizes)) {
        const idx = Number(k)
        const v = oldSizes[idx]
        if (idx < insertIndex) shifted[idx] = v
        else shifted[idx + inserted] = v
      }
      // 使用圖片的實際尺寸而非預設 A4 尺寸
      shifted[insertIndex] = { widthPt: imgResult.widthPt, heightPt: imgResult.heightPt }
      media.pageSizesPt = shifted as any
      media.descriptor = { ...d, pages: Math.max(0, (d.pages || 0) + 1) } as any
      if (insertIndex <= oldCenter) centerIndex.value = oldCenter + 1
      pendingIdx.clear()
      for (let i = insertIndex; i < insertIndex + Math.min(inserted + 6, (media.descriptor?.pages || 0) - insertIndex); i++) pendingIdx.add(i)
      scheduleHiResRerender(0)

      const src = await pdfOpen(tempPath)
      const res = await pdfCopyPage({ srcDocId: src.docId, srcIndex: 0, destDocId: id, destIndex: insertIndex })
      finalPages = res.pages
      lastMutation = res
      try { await pdfClose(src.docId) } catch { }
    }

    if (inserted > 0) {
      media.descriptor = { ...media.descriptor!, pages: finalPages } as any
      pendingIdx.clear()
      const tp = finalPages
      for (let i = insertIndex; i < Math.min(tp, insertIndex + inserted + 6); i++) pendingIdx.add(i)
      scheduleHiResRerender(0)
      if (lastMutation) {
        media.setDirtyState(lastMutation.dirty, lastMutation.revision)
      }

      // [修復] 等待佈局穩定後恢復
      await nextTick()
      await new Promise<void>(r => requestAnimationFrame(() => r()))

      // 恢復滾動位置，確保用戶視角不變
      if (root && insertIndex <= lockedPage) {
        // 計算新插入頁面的總高度
        let totalInsertedHeight = 0
        for (let i = 0; i < inserted; i++) {
          const newPageEl = root.querySelector(`[data-pdf-page="${insertIndex + i}"]`) as HTMLElement | null
          if (newPageEl) {
            totalInsertedHeight += newPageEl.offsetHeight + 16 // 16 為頁面間距
          }
        }
        if (totalInsertedHeight > 0) {
          root.scrollTop = savedScrollTop + totalInsertedHeight
        }
      }
    }
  } catch (e: any) {
    media.pdfPages = oldPagesArr as any
    media.pageSizesPt = oldSizes as any
    media.descriptor = oldDescriptor as any
    centerIndex.value = oldCenter
    media.setDirtyState(oldDirty, oldRevision)
    alert(e?.message || String(e))
  } finally {
    // [修復] 延遲解鎖，確保佈局完全穩定
    setTimeout(() => {
      isLayoutResizing.value = false
      updateVisibleByScroll()
      centerPageHorizontally(centerIndex.value)
    }, 100)
  }
}

async function rotatePlus90(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  const oldDirty = media.dirty
  const oldRevision = media.revision
  try {
    const delta = (shiftDown.value ? -90 : 90)
    const res = await pdfRotatePageRelative({ docId: id, index: pageIndex, deltaDeg: delta })
    media.setDirtyState(res.dirty, res.revision)
    try {
      media.cancelInflight(pageIndex)
    } catch { }

    // 旋轉後需要清除並重新獲取頁面尺寸，因為寬高會交換
    const oldSize = media.pageSizesPt[pageIndex]
    if (oldSize) {
      // 旋轉 90 度或 -90 度時，寬高交換
      media.pageSizesPt[pageIndex] = {
        widthPt: oldSize.heightPt,
        heightPt: oldSize.widthPt,
      }
    } else {
      // 如果沒有快取，刪除該條目以強制重新獲取
      delete media.pageSizesPt[pageIndex]
    }

    media.pdfPages[pageIndex] = null
    // 清除文字層緩存，旋轉後文字坐標會改變
    media.clearPageText(pageIndex)
    pendingIdx.add(pageIndex)

    // 等待 Vue 更新後再觸發重新渲染
    await nextTick()
    scheduleHiResRerender(0)

    // Removed: auto updateFitPercent after rotation
    // User must manually re-click "fit width" to recalculate
  } catch (e: any) {
    media.setDirtyState(oldDirty, oldRevision)
    alert(e?.message || String(e))
  }
}

const renderIndices = computed(() => {
  const tp = totalPages.value || 0
  return Array.from({ length: tp }, (_, i) => i)
})

// Max base CSS width across all pages - used to make all page wrappers the same width
// This ensures pages with different widths all center correctly with a single scrollLeft
const maxBaseCssWidth = computed(() => {
  const indices = Object.keys(media.pageSizesPt).map(Number)
  if (indices.length === 0) return 0
  return Math.max(...indices.map((idx) => media.baseCssWidthAt100(idx) || 0))
})

// 在模式切換期間鎖住頁面虛擬化，避免 DOM 被卸載（保留選取）
const lockPagesDuringModeSwitch = ref(false)

const lastSelection = ref<{ pageIndex: number; start: number; end: number } | null>(null)

const mountedPages = computed(() => {
  const buffer = 2
  const s = visibleStart.value - buffer
  const e = visibleEnd.value + buffer
  const set = new Set<number>()
  const tp = totalPages.value || 0
  for (let i = s; i <= e; i++) {
    if (i >= 0 && i < tp) set.add(i)
  }
  return set
})

const STRUCTURE_OVERSCAN = computed(() => settings.s.structureOverscan || 10)
function shouldRenderStructure(idx: number) {
  if (lockPagesDuringModeSwitch.value) return true
  if ((totalPages.value || 0) < 30) return true

  const s = visibleStart.value - STRUCTURE_OVERSCAN.value
  const e = visibleEnd.value + STRUCTURE_OVERSCAN.value
  return idx >= s && idx <= e
}

function shouldRenderPageContent(idx: number) {
  if (lockPagesDuringModeSwitch.value) return true
  if (idx === displayPageIndex.value) return true
  return mountedPages.value.has(idx)
}

let resizeObs: ResizeObserver | null = null
let rafScheduled = false
const pendingIdx = new Set<number>()
const containerW = ref(0)
let hiResTimer: number | null = null

const visibleStart = ref(0)
const visibleEnd = ref(0)
let scrollRaf: number | null = null
let scrollEndTimer: number | null = null

function updateVisibleByScroll() {
  // 如果正在處理佈局變更（如模式切換），暫停更新 centerIndex，防止文字層被誤刪
  if (isLayoutResizing.value) return

  const root = scrollRootEl.value
  const tp = totalPages.value || 0
  if (!root || tp <= 0) return
  const viewportTop = root.scrollTop
  const viewportMid = viewportTop + root.clientHeight / 2
  let closestIndex = displayPageIndex.value
  let minDistance = Infinity
  root.querySelectorAll('[data-pdf-page]').forEach((el) => {
    const idx = Number((el as HTMLElement).dataset.pdfPage)
    if (!Number.isFinite(idx)) return
    const rect = el.getBoundingClientRect()
    const scrollOffset = root.scrollTop
    const elTop = rect.top + scrollOffset - root.getBoundingClientRect().top
    const elMid = elTop + rect.height / 2
    const distance = Math.abs(elMid - viewportMid)
    if (distance < minDistance) {
      minDistance = distance
      closestIndex = idx
    }
  })
  displayPageIndex.value = closestIndex
  media.setPriorityIndex(closestIndex)

  const overscan = settings.s.highResOverscan || 5
  const elements = root.querySelectorAll('[data-pdf-page]')
  const visibleIndices: number[] = []
  const rootRect = root.getBoundingClientRect()
  elements.forEach((el) => {
    const idx = Number((el as HTMLElement).dataset.pdfPage)
    if (!Number.isFinite(idx)) return
    const rect = el.getBoundingClientRect()
    if (rect.bottom >= rootRect.top - 1000 && rect.top <= rootRect.bottom + 1000) {
      visibleIndices.push(idx)
    }
  })
  if (visibleIndices.length > 0) {
    visibleStart.value = Math.max(0, Math.min(...visibleIndices) - overscan)
    visibleEnd.value = Math.min(tp - 1, Math.max(...visibleIndices) + overscan)
    media.enforceVisibleRange(visibleStart.value, visibleEnd.value)
    for (let i = visibleStart.value; i <= visibleEnd.value; i++) {
      pendingIdx.add(i)
    }
    scheduleProcess()
  }
}

function restoreCurrentPageAfterLayout(idx: number) {
  if (!Number.isFinite(idx) || idx < 0) return
  const root = scrollRootEl.value
  if (!root) return
  const el = root.querySelector(`[data-pdf-page="${idx}"]`) as HTMLElement | null
  if (!el) return
  const rootRect = root.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  const BUFFER = 12
  const stillInView = rect.bottom >= rootRect.top - BUFFER && rect.top <= rootRect.bottom + BUFFER
  if (!stillInView) return
  displayPageIndex.value = idx
  centerIndex.value = idx
  media.setPriorityIndex(idx)
}

async function primeTextLayerForPage(idx: number) {
  if (!settings.s.enableTextExtraction) return
  const d = media.descriptor
  if (!d || d.type !== 'pdf') return
  if (!Number.isFinite(idx) || idx < 0) return
  if (!media.pageSizesPt[idx]) {
    try { await media.getPageSizePt(idx) } catch { /* ignore */ }
  }
  try { await media.getPageTextContent(idx) } catch { /* ignore */ }
}

function debugTextLayerState(label: string, idx: number) {
  const sizeInfo = media.pageSizesPt[idx]
  console.log('[PdfViewport][text-layer]', label, {
    idx,
    viewMode: viewMode.value,
    displayPageIndex: displayPageIndex.value,
    centerIndex: centerIndex.value,
    shouldRender: shouldRenderTextLayer(idx),
    hasSize: !!sizeInfo,
    visibleStart: visibleStart.value,
    visibleEnd: visibleEnd.value,
    fitPercent: displayFitPercent.value,
    zoomTarget: zoomTarget.value,
  })
}

function onTextSelectionChange(payload: { pageIndex: number; range: { start: number; end: number } | null }) {
  if (payload.range) {
    lastSelection.value = { pageIndex: payload.pageIndex, start: payload.range.start, end: payload.range.end }
  } else if (lastSelection.value?.pageIndex === payload.pageIndex) {
    lastSelection.value = null
  }
}

function onTextLayerReady(pageIndex: number) {
  if (lastSelection.value?.pageIndex === pageIndex) {
    void restoreSelectionIfNeeded()
  }
}

// Center all page wrappers horizontally in the viewport.
// When maxBaseCssWidth is available, all wrappers have the same width so a single scrollLeft works.
// Falls back to card-based centering during initial load when page sizes aren't loaded yet.
function centerPageHorizontally(idx: number) {
  const root = scrollRootEl.value
  if (!root) return

  const viewportWidth = root.clientWidth

  // Fallback to card-based centering when maxBaseCssWidth is not yet computed
  // (during initial load or restore when page sizes haven't been loaded)
  if (maxBaseCssWidth.value <= 0) {
    const cardEl = root.querySelector(`[data-pdf-page="${idx}"] .bg-card`) as HTMLElement | null
    if (!cardEl) return

    const cardWidth = cardEl.offsetWidth
    const cardRect = cardEl.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const cardCenterInViewport = cardRect.left - rootRect.left + cardWidth / 2
    const viewportCenter = viewportWidth / 2
    const adjustment = cardCenterInViewport - viewportCenter
    const targetScrollLeft = root.scrollLeft + adjustment
    const maxScrollLeft = root.scrollWidth - viewportWidth
    root.scrollLeft = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft))
    return
  }

  // Normal case: all wrappers have same width, center using scrollWidth
  const contentWidth = root.scrollWidth
  if (contentWidth <= viewportWidth) {
    root.scrollLeft = 0
    return
  }

  root.scrollLeft = (contentWidth - viewportWidth) / 2
}

async function restoreSelectionIfNeeded() {
  const saved = lastSelection.value
  if (!saved) return
  await nextTick()
  const root = scrollRootEl.value
  const pageEl = root?.querySelector(`[data-pdf-page="${saved.pageIndex}"]`)
  const layerEl = pageEl?.querySelector('.pdf-text-layer')
  if (!layerEl) return
  const spans = Array.from(layerEl.querySelectorAll('.text-span')) as HTMLSpanElement[]
  const findNodeOffset = (charIndex: number) => {
    let remaining = Math.max(0, charIndex)
    for (const span of spans) {
      const text = span.textContent ?? ''
      const len = text.length
      if (remaining <= len) {
        const node = span.firstChild
        if (node) {
          return { node, offset: Math.max(0, Math.min(len, remaining)) }
        }
        break
      }
      remaining -= len
    }
    return null
  }
  const startPos = findNodeOffset(saved.start)
  const endPos = findNodeOffset(saved.end)
  if (!startPos || !endPos) return
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStart(startPos.node, startPos.offset)
  range.setEnd(endPos.node, endPos.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

function onScroll() {
  if (scrollRaf !== null) return
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null
    const prevDisplayPage = displayPageIndex.value
    updateVisibleByScroll()

    // Re-center when switching to a different page during scroll
    if (displayPageIndex.value !== prevDisplayPage) {
      centerPageHorizontally(displayPageIndex.value)
    }

    if (scrollEndTimer) clearTimeout(scrollEndTimer)
    const endMs = Math.max(0, Number(settings.s.scrollEndDebounceMs) || 0)
    scrollEndTimer = window.setTimeout(() => {
      centerIndex.value = displayPageIndex.value
      centerPageHorizontally(centerIndex.value)
      requestAnimationFrame(() => {
        scheduleHiResRerender()
      })
      scrollEndTimer = null
    }, endMs)
  })
}

function scheduleHiResRerender(delay?: number) {
  if (hiResTimer) {
    clearTimeout(hiResTimer)
    hiResTimer = null
  }
  const ms = typeof delay === 'number' ? delay : (Number(settings.s.hiResRerenderDelayMs) || 0)
  hiResTimer = window.setTimeout(() => {
    const tp = totalPages.value || 0
    if (tp <= 0) {
      hiResTimer = null
      return
    }
    const start = Math.max(0, visibleStart.value)
    const end = Math.min(tp - 1, visibleEnd.value)
    pendingIdx.clear()
    for (let i = start; i <= end; i++) pendingIdx.add(i)
    rafScheduled = false
    scheduleProcess()
    hiResTimer = null
  }, ms)
}

function scheduleProcess() {
  if (rafScheduled) return
  rafScheduled = true
  requestAnimationFrame(() => {
    const list = Array.from(pendingIdx)
    pendingIdx.clear()
    rafScheduled = false
    const tp = totalPages.value || 0
    if (tp <= 0) return
    const center = centerIndex.value
    const overscan = settings.s.highResOverscan
    const start = Math.max(0, Math.min(visibleStart.value, center - overscan))
    const end = Math.min(tp - 1, Math.max(visibleEnd.value, center + overscan))
    media.enforceVisibleRange(start, end)
    const allowed = new Set<number>()
    for (let i = start; i <= end; i++) allowed.add(i)
    const work = list.filter((idx) => allowed.has(idx))
    const cW = containerW.value || 800
    for (const idx of work) {
      if (viewMode.value === 'actual') {
        media.renderPdfPage(idx, undefined, getRenderFormat(), getRenderQuality(), dpiForActual())
      } else {
        const dpr = dprForMode()
        const baseW = cW
        const hiW = Math.min(Math.floor(baseW * dpr), Math.max(320, settings.s.maxOutputWidth || 2147483647))
        media.renderPdfPage(idx, hiW, getRenderFormat(), getRenderQuality())
      }
    }
  })
}

onMounted(async () => {
  console.log('[PdfViewport] Component mounted, descriptor:', media.descriptor?.path)
  window.addEventListener('keydown', handleGlobalKeyDown, { capture: true })
  window.addEventListener('resize', handleWindowResize)

  // 初始計算 Fit
  scheduleUpdateFitPercent()

  const d = media.descriptor
  if (d && d.type === 'pdf' && d.path) {
    await restoreLastPage(d.path, d)
  }

  scrollRootEl.value?.addEventListener('scroll', onScroll, { passive: true })
  await nextTick()
  updateVisibleByScroll()

  if (scrollRootEl.value && 'ResizeObserver' in window) {
    let lastResizeWidth = 0
    let resizeDebounceTimer: number | null = null
    const SCROLLBAR_WIDTH_MIN = 14
    const SCROLLBAR_WIDTH_MAX = 18

    resizeObs = new ResizeObserver(() => {
      const w = scrollRootEl.value?.clientWidth || 0
      if (w <= 0) return

      const oldW = containerW.value
      const sizeDiff = Math.abs(w - oldW)

      if (oldW > 0 && sizeDiff >= SCROLLBAR_WIDTH_MIN && sizeDiff <= SCROLLBAR_WIDTH_MAX) {
        if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
        resizeDebounceTimer = window.setTimeout(() => {
          resizeDebounceTimer = null
          const currentW = scrollRootEl.value?.clientWidth || 0
          if (currentW !== containerW.value && currentW > 0) {
            containerW.value = currentW
            // Update fit percent when container size changes (only in fit mode)
            if (viewMode.value === 'fit') {
              updateFitPercent()
            }
            // Reset scrollLeft when scrollbar appears/disappears
            centerPageHorizontally(centerIndex.value)
          }
        }, 100)
        return
      }

      if (oldW > 0 && w !== oldW) {
        const root = scrollRootEl.value
        const currentPageEl = root?.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement
        const savedScrollTop = root?.scrollTop || 0

        containerW.value = w
        // Update fit percent when container size changes (only in fit mode)
        if (viewMode.value === 'fit') {
          updateFitPercent()
        }

        if (searchVisible.value) setSearchAnchor(true)

        nextTick(() => {
          requestAnimationFrame(() => {
            if (currentPageEl && root) {
              // 統一使用「保持相對垂直位置」的邏輯
              const elementTop = currentPageEl.offsetTop
              const elementHeight = currentPageEl.offsetHeight
              const containerHeight = root.clientHeight
              const currentScrollTop = root.scrollTop
              const isVisible =
                elementTop < currentScrollTop + containerHeight &&
                elementTop + elementHeight > currentScrollTop

              if (isVisible) {
                root.scrollTop = savedScrollTop
              } else {
                root.scrollTop = elementTop - containerHeight / 2 + elementHeight / 2
              }

              // Reset scrollLeft after container width change
              centerPageHorizontally(centerIndex.value)
            }
          })
        })

        const shouldRerender = oldW > 0 ? sizeDiff / oldW > 0.1 : false
        if (shouldRerender && w !== lastResizeWidth) {
          lastResizeWidth = w
          if (hiResTimer) clearTimeout(hiResTimer)
          scheduleHiResRerender(500)
        }
      } else {
        containerW.value = w
        // Update fit percent when container size changes (only in fit mode)
        if (viewMode.value === 'fit') {
          updateFitPercent()
        }
        if (searchVisible.value) setSearchAnchor(true)

        // CSS handles centering via margin:auto, reset scrollLeft on initial load
        if (oldW === 0 && w > 0) {
          nextTick(() => {
            centerPageHorizontally(centerIndex.value)
          })
        }
      }
    })
    resizeObs.observe(scrollRootEl.value)
  }
})

onBeforeUnmount(() => {
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  if (hiResTimer) clearTimeout(hiResTimer)
  if (fitTimer) clearTimeout(fitTimer)
  if (viewModeResizeTimer) {
    clearTimeout(viewModeResizeTimer)
    viewModeResizeTimer = null
  }
  window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true })
  window.removeEventListener('resize', handleWindowResize)
  scrollRootEl.value?.removeEventListener('scroll', onScroll)

  try { resizeObs?.disconnect() } catch { }
})

let viewModeResizeTimer: number | null = null
watch(viewMode, () => {
  // 切換顯示模式時，DOM 佈局會劇烈重排，必須鎖定可視範圍計算
  // 否則 updateVisibleByScroll 會在過渡期間誤判 centerIndex，導致當前頁文字層被移除
  isLayoutResizing.value = true
  lockPagesDuringModeSwitch.value = true
  const lockedPage = displayPageIndex.value

  // 立即更新 Fit Percent 確保 currentRenderingZoom 有正確數值
  updateFitPercent()
  scheduleHiResRerender()

  // 給予瀏覽器足夠時間完成 CSS 佈局與 Scroll 修正 (約 200ms)
  if (viewModeResizeTimer) clearTimeout(viewModeResizeTimer)
  viewModeResizeTimer = window.setTimeout(async () => {
    viewModeResizeTimer = null
    isLayoutResizing.value = false
    await nextTick()
    // 解鎖後，手動觸發一次更新，確保文字層的位置與尺寸參數是基於新的模式計算的
    updateVisibleByScroll()
    restoreCurrentPageAfterLayout(lockedPage)
    debugTextLayerState('after-mode-change', lockedPage)
    await primeTextLayerForPage(lockedPage)
    await restoreSelectionIfNeeded()
    lockPagesDuringModeSwitch.value = false

    // CSS handles centering via margin:auto, just reset scrollLeft
    centerPageHorizontally(lockedPage)
  }, 200)
})

// When maxBaseCssWidth changes (new wider page sizes loaded), recenter to account for new layout
watch(maxBaseCssWidth, (newVal, oldVal) => {
  if (newVal > 0 && newVal !== oldVal) {
    // Page sizes changed (initial load or wider page discovered), recenter after layout updates
    // Use nextTick + rAF to ensure DOM has updated with new wrapper widths
    nextTick(() => {
      requestAnimationFrame(() => {
        centerPageHorizontally(displayPageIndex.value)
      })
    })
  }
})

let fitTimer: number | null = null
async function updateFitPercent() {
  const d = media.descriptor
  if (!d || d.type !== 'pdf') return
  if (containerW.value <= 0) return  // Wait for valid container width
  const cW = containerW.value
  const idx = centerIndex.value

  // Helper
  const apply = (widthPt: number) => {
    const base = widthPt * (96 / 72)
    if (base > 0) {
      const availableW = Math.max(100, cW - 48)
      const newPercent = Math.max(5, Math.min(400, (availableW / base) * 100))
      displayFitPercent.value = newPercent
    }
  }

  // 1. 嘗試快取
  const cachedBase = media.baseCssWidthAt100(idx)
  if (cachedBase && cachedBase > 0) {
    apply(cachedBase * (72 / 96))
    return
  }

  // 2. 嘗試非同步
  try {
    const sz = await media.getPageSizePt(idx)
    if (sz) {
      apply(sz.widthPt)
    }
  } catch (e) {
    console.error('[PdfViewport] updateFitPercent error', e)
  }
}

function scheduleUpdateFitPercent() {
  if (fitTimer) {
    clearTimeout(fitTimer)
    fitTimer = null
  }
  fitTimer = window.setTimeout(() => {
    fitTimer = null
    updateFitPercent()
  }, 150)
}

// Reset horizontal scroll when images load (CSS handles centering via margin:auto)
function onPageImageLoad() {
  centerPageHorizontally(centerIndex.value)
}
// Check if current page's optimal fit percent differs from current zoom
// If different, switch to 'actual' mode so button becomes enabled
watch(centerIndex, () => {
  const idx = centerIndex.value

  if (viewMode.value !== 'fit') return

  const baseWidth = media.baseCssWidthAt100(idx)
  if (!baseWidth || baseWidth <= 0) return

  const currentFitPercent = displayFitPercent.value ?? 100
  const availableWidth = Math.max(100, containerW.value - 48)
  const optimalFitPercent = (availableWidth / baseWidth) * 100

  // If current fit percent differs from optimal (page is wider OR narrower than optimal)
  // Switch to 'actual' mode so user can click button to re-fit
  if (Math.abs(currentFitPercent - optimalFitPercent) > 2) {
    zoomTarget.value = currentFitPercent  // Keep the same zoom level
    viewMode.value = 'actual'
  }
})

onMounted(() => {
  scheduleUpdateFitPercent()
  const container = scrollRootEl.value
  if (container) {
    container.addEventListener('wheel', handleWheelZoom, { passive: false })
  }
})

onBeforeUnmount(() => {
  const container = scrollRootEl.value
  if (container) {
    container.removeEventListener('wheel', handleWheelZoom)
  }
})

function handleWheelZoom(e: WheelEvent) {
  const ctx = createZoomContext()
  if (!ctx) return
  zoomHandleWheel(e, ctx, () => triggerRerender(300))
}

const shouldInvertColors = computed(() => settings.actualTheme === 'dark' && settings.s.invertColorsInDarkMode)

function imgStyle(idx: number) {
  const styles: Record<string, string> = {}

  if (shouldInvertColors.value) {
    styles.filter = 'invert(1) hue-rotate(180deg)'
  }

  // [重構] 統一使用 CSS 變數控制寬度
  const base = media.baseCssWidthAt100(idx)
  if (base) {
    styles.width = `calc(${base}px * var(--zoom-factor))`
  }

  return Object.keys(styles).length > 0 ? styles : undefined
}

// All page wrappers use the same width (= max page width) so they align in the same position.
// This allows a single scrollLeft to center all pages regardless of individual page widths.
// The actual page content (card) will be centered within the wrapper.
function pageWrapperStyle(_idx: number) {
  const maxWidth = maxBaseCssWidth.value
  return {
    marginBottom: 'calc(32px * var(--zoom-factor))',
    width: maxWidth ? `calc(${maxWidth}px * var(--zoom-factor))` : 'auto',
    marginLeft: 'auto',
    marginRight: 'auto'
  }
}

function pageCardStyle(idx: number) {
  const baseStyle: Record<string, string> = {
    contain: 'layout paint style',
    contentVisibility: 'auto',
    position: 'relative',
  }

  // [重構] 不再區分 viewMode，統一使用 --zoom-factor 進行縮放
  // 這確保了 DOM 結構在切換模式時完全不變，只變數值
  const base = media.baseCssWidthAt100(idx)
  const size = media.pageSizesPt[idx]

  if (base && size) {
    const ratio = size.heightPt / size.widthPt
    // [修復] 根據實際頁面尺寸動態計算 containIntrinsicBlockSize
    // 避免對於很長的 PDF 頁面因為預估值太小而無法顯示完整
    const estimatedHeight = Math.ceil(base * ratio)
    return {
      ...baseStyle,
      containIntrinsicBlockSize: `${estimatedHeight}px`,
      '--page-base-width': `${base}px`,
      '--page-ratio': `${ratio}`,
      // 無論 Fit 還是 Actual，都使用這套計算公式
      width: `calc(var(--page-base-width) * var(--zoom-factor))`,
      height: `calc(var(--page-base-width) * var(--zoom-factor) * var(--page-ratio))`,
      willChange: 'width, height'
    }
  }

  // Fallback (通常不會發生，除非尚未載入尺寸)
  baseStyle.containIntrinsicBlockSize = '1000px'
  if (size) {
    baseStyle.aspectRatio = `${size.widthPt} / ${size.heightPt}`
  }
  return baseStyle
}

function getPageTextLayerProps(idx: number) {
  const sizeInfo = media.pageSizesPt[idx]
  if (!sizeInfo) return null

  const baseCssWidth = media.baseCssWidthAt100(idx) || sizeInfo.widthPt * (96 / 72)

  // [重構] 統一使用 currentRenderingZoom 計算尺寸
  // 這樣保證文字層的計算與圖片層的 CSS calc() 完美一致
  const targetWidth = baseCssWidth * (currentRenderingZoom.value / 100)
  const displayWidthPx = Math.max(50, targetWidth)

  const aspect = sizeInfo.heightPt / Math.max(sizeInfo.widthPt, 0.001)
  const displayHeightPx = displayWidthPx * aspect

  const pxPerPointX = displayWidthPx / Math.max(sizeInfo.widthPt, 0.001)
  const pxPerPointY = displayHeightPx / Math.max(sizeInfo.heightPt, 0.001)

  return {
    pageWidthPt: sizeInfo.widthPt,
    pageHeightPt: sizeInfo.heightPt,
    pxPerPointX,
    pxPerPointY,
    layerWidthPx: displayWidthPx,
    layerHeightPx: displayHeightPx,
  }
}

function getPageTextLayerPropsList(idx: number) {
  const props = getPageTextLayerProps(idx)
  if (!props) return []
  return [{
    ...props,
    highlightRanges: getPageHighlightRanges(idx),
  }]
}

function shouldRenderTextLayer(idx: number): boolean {
  if (!settings.s.enableTextExtraction) return false
  if (searchVisible.value && searchMatches.value.some(m => m.pageIndex === idx)) {
    return true
  }
  const textLayerRange = settings.s.textLayerRange ?? 1
  // [安全] 確保當前頁面一定有渲染文字層，即使 centerIndex 更新稍有延遲
  return Math.abs(idx - centerIndex.value) <= textLayerRange || idx === displayPageIndex.value
}

function getAnnotationLayerProps(idx: number) {
  const sizeInfo = media.pageSizesPt[idx]
  if (!sizeInfo) return null

  const baseCssWidth = media.baseCssWidthAt100(idx) || sizeInfo.widthPt * (96 / 72)
  const targetWidth = baseCssWidth * (currentRenderingZoom.value / 100)
  const displayWidthPx = Math.max(50, targetWidth)

  const aspect = sizeInfo.heightPt / Math.max(sizeInfo.widthPt, 0.001)
  const displayHeightPx = displayWidthPx * aspect

  return {
    pageIndex: idx,
    displayWidth: displayWidthPx,
    displayHeight: displayHeightPx,
    pageWidthPt: sizeInfo.widthPt,
    pageHeightPt: sizeInfo.heightPt,
  }
}

function shouldRenderAnnotationLayer(idx: number): boolean {
  // Render annotation layer if tool is active or there are annotations on this page
  return annotationStore.activeTool !== null || annotationStore.getPageAnnotations(idx).length > 0
}

defineExpose({
  viewMode,
  displayZoom,
  currentPage,
  totalPages,
  canZoomIn,
  canZoomOut,
  setFitMode: handleSetFitMode,
  resetZoom: handleResetZoom,
  zoomIn: handleZoomIn,
  zoomOut: handleZoomOut,
  gotoPage,
  toggleSearch,
  openSearch,
  closeSearch,
  searchVisible,
})
</script>

<template>
  <div class="relative flex-1 min-h-0">
    <div
      ref="scrollRootEl"
      class="absolute inset-0 scrollbar-visible overscroll-y-contain bg-muted"
      :class="isRestoringLastPage ? 'opacity-0 pointer-events-none' : 'opacity-100'"
      :style="{
        'will-change': 'scroll-position',
        'overflow-anchor': 'none',
        '--zoom-factor': currentRenderingZoom / 100,
        'overflow-x': 'auto',
        'overflow-y': 'scroll'
      }"
    >
      <div v-if="!totalPages" class="p-4">{{ t('mediaView.noPages') }}</div>
      <div v-else class="flex flex-col items-center w-full py-10 px-4 space-y-3">
      <div
        v-for="idx in renderIndices"
        :key="idx"
        :style="pageWrapperStyle(idx)"
        :data-pdf-page="idx"
        @contextmenu.prevent="onPageContextMenu(idx, $event)"
      >
        <template v-if="shouldRenderStructure(idx)">
          <div class="px-6 max-w-none flex flex-col items-center">
              <div
                :class="['bg-card rounded-md shadow border border-border relative inline-block overflow-visible']"
                :style="pageCardStyle(idx)"
              >
                <!-- DOM 虛擬化：只渲染視野附近頁面的實際內容 -->
                <template v-if="shouldRenderPageContent(idx)">
                  <img
                    v-if="getPageDisplayUrl(idx)"
                    :src="getPageDisplayUrl(idx)"
                    :alt="`page-${idx}`"
                    class="block disable-live-text"
                    :style="imgStyle(idx)"
                    style="pointer-events: none;"
                    decoding="async"
                    loading="lazy"
                    draggable="false"
                    @load="onPageImageLoad"
                  />
                  <canvas
                    v-else-if="isRawPage(idx)"
                    class="block disable-live-text"
                    :style="imgStyle(idx)"
                    style="pointer-events: none;"
                    :data-raw-page="idx"
                    :ref="(el: any) => drawRawInto(el as HTMLCanvasElement | null, idx)"
                  />
                  <div v-else class="w-full aspect-[1/1.414] bg-muted animate-pulse"></div>

                  <!-- Annotation layer (SVG overlay for annotations) -->
                  <AnnotationLayer
                    v-if="shouldRenderAnnotationLayer(idx) && getAnnotationLayerProps(idx)"
                    v-bind="getAnnotationLayerProps(idx)!"
                  />

                  <!-- Text selection layer (只渲染中心附近頁面以優化效能) -->
                  <div
                    v-if="docId != null && shouldRenderTextLayer(idx)"
                    class="absolute inset-0 pointer-events-none"
                    :style="{
                      zIndex: 1,
                    }"
                  >
                    <PdfTextLayer
                      v-for="layerProps in getPageTextLayerPropsList(idx)"
                      :key="`text-layer-${idx}`"
                      :doc-id="docId"
                      :page-index="idx"
                      v-bind="layerProps"
                      @selection-change="onTextSelectionChange"
                      @layer-ready="onTextLayerReady(idx)"
                      style="pointer-events: auto;"
                    />
                  </div>
                </template>
                <!-- 未掛載的頁面：空白占位，保持高度 -->
                <div v-else class="w-full aspect-[1/1.414] bg-muted/30"></div>
              </div>
            <div class="mt-3 text-xs text-[hsl(var(--muted-foreground))] text-center">{{ t('mediaView.pageNumber', { page: idx + 1 }) }}</div>
          </div>
        </template>
        <div v-else :class="viewMode === 'fit' ? 'px-6 max-w-none' : 'px-6'">
          <div :style="pageCardStyle(idx)"></div>
          <div style="height: 28px"></div>
        </div>
      </div>
    </div>
      <PdfSearchPanel
        ref="searchPanelRef"
        v-model="searchTerm"
        :visible="searchVisible"
        :busy="searchBusy"
        :error="searchError"
        :summary="searchSummary"
        :has-matches="searchMatches.length > 0"
        :panel-style="searchPanelStyle"
        @prev="showPrevMatch"
        @next="showNextMatch"
        @close="closeSearch"
      />
      <PdfPageContextMenu
        :menu="menu"
        :shift-down="shiftDown"
        @delete="deletePageFromMenu"
        @insert-blank="insertBlankQuick"
        @insert-file="insertFileQuick"
        @rotate="rotatePlus90"
        @export-image="exportPageAsImage"
        @export-pdf="exportPageAsPdf"
      />
    </div>
    <div v-if="isRestoringLastPage" class="absolute inset-0 flex items-center justify-center text-xl text-muted-foreground">
      {{ t('common.loading') }}
    </div>
  </div>
</template>
