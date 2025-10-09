<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import { useExportSettings } from '@/modules/export/settings'
import {
  pdfDeletePagesDoc,
  pdfInsertBlank,
  pdfRotatePageRelative,
  pdfExportPageImage,
  pdfExportPagePdf,
} from '@/modules/media/service'

const media = useMediaStore()
const settings = useSettingsStore()
const filelist = useFileListStore()
const exportSettings = useExportSettings()

const viewMode = ref<'fit' | 'actual'>('fit')
const zoomTarget = ref(100)
const displayFitPercent = ref<number | null>(null)
const displayZoom = computed(() => (viewMode.value === 'fit' ? (displayFitPercent.value ?? 100) : zoomTarget.value))

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
  if (settings.s.enableLowRes && page.lowResUrl) return page.lowResUrl
  return undefined
}

const totalPages = computed(() => media.descriptor?.pages ?? 0)

function dprForMode() {
  return viewMode.value === 'fit' ? Math.min(window.devicePixelRatio || 1, settings.s.dprCap) : 1
}
function dpiForActual() {
  const dpi = Math.max(24, Math.round(96 * (zoomTarget.value / 100)))
  const cap = Math.max(48, settings.s.actualModeDpiCap || dpi)
  return Math.min(dpi, cap)
}

function fitPercentBaseline(): number {
  const p = Math.round(displayFitPercent.value ?? 100)
  return Math.max(10, Math.min(400, p))
}

function zoomIn() {
  const root = scrollRootEl.value
  if (viewMode.value !== 'actual') {
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()  // 從當前 fit 的縮放值開始
    if (root) {
      nextTick(() => {
        requestAnimationFrame(() => {
          const currentPageEl = root.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement | null
          if (currentPageEl) {
            currentPageEl.scrollIntoView({ block: 'center', behavior: 'auto' })
          }
        })
      })
    }
  } else if (root) {
    const newZoom = Math.min(400, zoomTarget.value + 10)
    
    // 找到當前中心頁面的圖片元素
    const currentPageEl = root.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement | null
    const img = currentPageEl?.querySelector('img') as HTMLImageElement | null
    
    if (img) {
      // 獲取圖片和視窗的實際位置
      const rootRect = root.getBoundingClientRect()
      const imgRect = img.getBoundingClientRect()
      
      // 計算視窗中心點相對於圖片的位置（像素值）
      const viewportCenterX = rootRect.left + rootRect.width / 2
      const viewportCenterY = rootRect.top + rootRect.height / 2
      const offsetX = viewportCenterX - imgRect.left
      const offsetY = viewportCenterY - imgRect.top
      
      // 計算縮放比例
      const zoomRatio = newZoom / zoomTarget.value
      
      zoomTarget.value = newZoom
      
      nextTick(() => {
        requestAnimationFrame(() => {
          // 縮放後重新獲取圖片位置
          const newImgRect = img.getBoundingClientRect()
          const newRootRect = root.getBoundingClientRect()
          
          // 計算縮放後，原本的點應該在哪裡
          const newOffsetX = offsetX * zoomRatio
          const newOffsetY = offsetY * zoomRatio
          const targetCenterX = newImgRect.left + newOffsetX
          const targetCenterY = newImgRect.top + newOffsetY
          
          // 調整滾動位置使中心點保持不變
          const scrollAdjustX = targetCenterX - (newRootRect.left + newRootRect.width / 2)
          const scrollAdjustY = targetCenterY - (newRootRect.top + newRootRect.height / 2)
          
          root.scrollLeft += scrollAdjustX
          root.scrollTop += scrollAdjustY
        })
      })
      // 立即觸發重新渲染，不使用 debounce
      pendingIdx.clear()
      for (let i = visibleStart.value; i <= visibleEnd.value; i++) pendingIdx.add(i)
      rafScheduled = false
      scheduleHiResRerender(0)
      return
    }
    zoomTarget.value = newZoom
    // 立即觸發重新渲染
    pendingIdx.clear()
    for (let i = visibleStart.value; i <= visibleEnd.value; i++) pendingIdx.add(i)
    rafScheduled = false
    scheduleHiResRerender(0)
  }
}

function zoomOut() {
  const root = scrollRootEl.value
  if (viewMode.value !== 'actual') {
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()  // 從當前 fit 的縮放值開始
    if (root) {
      nextTick(() => {
        requestAnimationFrame(() => {
          const currentPageEl = root.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement | null
          if (currentPageEl) {
            currentPageEl.scrollIntoView({ block: 'center', behavior: 'auto' })
          }
        })
      })
    }
  } else if (root) {
    const newZoom = Math.max(10, zoomTarget.value - 10)
    
    // 找到當前中心頁面的圖片元素
    const currentPageEl = root.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement | null
    const img = currentPageEl?.querySelector('img') as HTMLImageElement | null
    
    if (img) {
      // 獲取圖片和視窗的實際位置
      const rootRect = root.getBoundingClientRect()
      const imgRect = img.getBoundingClientRect()
      
      // 計算視窗中心點相對於圖片的位置（像素值）
      const viewportCenterX = rootRect.left + rootRect.width / 2
      const viewportCenterY = rootRect.top + rootRect.height / 2
      const offsetX = viewportCenterX - imgRect.left
      const offsetY = viewportCenterY - imgRect.top
      
      // 計算縮放比例
      const zoomRatio = newZoom / zoomTarget.value
      
      zoomTarget.value = newZoom
      
      nextTick(() => {
        requestAnimationFrame(() => {
          // 縮放後重新獲取圖片位置
          const newImgRect = img.getBoundingClientRect()
          const newRootRect = root.getBoundingClientRect()
          
          // 計算縮放後，原本的點應該在哪裡
          const newOffsetX = offsetX * zoomRatio
          const newOffsetY = offsetY * zoomRatio
          const targetCenterX = newImgRect.left + newOffsetX
          const targetCenterY = newImgRect.top + newOffsetY
          
          // 調整滾動位置使中心點保持不變
          const scrollAdjustX = targetCenterX - (newRootRect.left + newRootRect.width / 2)
          const scrollAdjustY = targetCenterY - (newRootRect.top + newRootRect.height / 2)
          
          root.scrollLeft += scrollAdjustX
          root.scrollTop += scrollAdjustY
        })
      })
      // 立即觸發重新渲染，不使用 debounce
      pendingIdx.clear()
      for (let i = visibleStart.value; i <= visibleEnd.value; i++) pendingIdx.add(i)
      rafScheduled = false
      scheduleHiResRerender(0)
      return
    }
    zoomTarget.value = newZoom
    // 立即觸發重新渲染
    pendingIdx.clear()
    for (let i = visibleStart.value; i <= visibleEnd.value; i++) pendingIdx.add(i)
    rafScheduled = false
    scheduleHiResRerender(0)
  }
}

function resetZoom() {
  const root = scrollRootEl.value
  viewMode.value = 'actual'
  zoomTarget.value = 100
  if (root) {
    nextTick(() => {
      requestAnimationFrame(() => {
        root.scrollLeft = 0
        root.scrollTop = 0
      })
    })
  }
  pendingIdx.clear()
  for (const i of visibleIdx) pendingIdx.add(i)
  rafScheduled = false
  scheduleHiResRerender(0)
}

function setFitMode() {
  if (viewMode.value !== 'fit') {
    viewMode.value = 'fit'
    pendingIdx.clear()
    for (const i of visibleIdx) pendingIdx.add(i)
    rafScheduled = false
    scheduleHiResRerender(0)
  }
}

const centerIndex = ref(0)
const displayPageIndex = ref(0)
const currentPage = computed(() => {
  const tp = totalPages.value
  if (!tp || tp <= 0) return 0
  return Math.min(tp, Math.max(1, displayPageIndex.value + 1))
})

async function gotoPage(page: number) {
  const tp = totalPages.value || 0
  if (tp <= 0) return
  const idx = Math.min(tp - 1, Math.max(0, Math.floor(page) - 1))
  centerIndex.value = idx
  displayPageIndex.value = idx
  await nextTick()
  const root = scrollRootEl.value
  const el = root?.querySelector(`[data-pdf-page="${idx}"]`) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ block: 'center' })
    pendingIdx.add(idx)
    scheduleProcess()
  }
}

watch(
  () => media.descriptor?.path,
  async (p) => {
    const d = media.descriptor
    if (!p || !d || d.type !== 'pdf') return
    
    // 初始化 displayPageIndex 為 0（確保 currentPage 計算正確）
    displayPageIndex.value = 0
    centerIndex.value = 0
    
    const last = filelist.getLastPage(p)
    if (typeof last === 'number' && last > 1) {
      await nextTick()
      try {
        await gotoPage(last)
      } catch {
        /* noop */
      }
    }
  },
)

watch([() => media.descriptor?.path, currentPage], ([p, cp]) => {
  const d = media.descriptor
  if (!p || !d || d.type !== 'pdf') return
  if (typeof cp === 'number' && cp > 0) filelist.setLastPage(p, cp)
})

const menu = ref<{ open: boolean; x: number; y: number; pageIndex: number; aboveHalf: boolean }>({
  open: false,
  x: 0,
  y: 0,
  pageIndex: -1,
  aboveHalf: true,
})
const exportMenu = ref<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
let exportCloseTimer: number | null = null
function scheduleExportClose(delay = 150) {
  if (exportCloseTimer) clearTimeout(exportCloseTimer)
  exportCloseTimer = window.setTimeout(() => {
    exportMenu.value.open = false
  }, delay)
}
function cancelExportClose() {
  if (exportCloseTimer) {
    clearTimeout(exportCloseTimer)
    exportCloseTimer = null
  }
}
function onPageContextMenu(idx: number, e: MouseEvent) {
  const target = (e.currentTarget as HTMLElement) || (e.target as HTMLElement)
  const rect = target?.getBoundingClientRect()
  const aboveHalf = rect ? e.clientY < rect.top + rect.height / 2 : true
  menu.value = { open: true, x: e.clientX, y: e.clientY, pageIndex: idx, aboveHalf }
  exportMenu.value.open = false
}
function closeMenu() {
  menu.value.open = false
  exportMenu.value.open = false
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

async function deletePageFromMenu(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  const oldPagesArr = media.pdfPages.slice()
  const oldDescriptor = { ...d }
  const oldSizes: Record<number, { widthPt: number; heightPt: number }> = { ...media.pageSizesPt }
  const oldCenter = centerIndex.value
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
    } catch {}
    try {
      media.cancelInflight(pageIndex)
    } catch {}
    const res = await pdfDeletePagesDoc({ docId: id, indices: [pageIndex] })
    media.descriptor = { ...media.descriptor!, pages: res.pages } as any
    media.markDirty()
    pendingIdx.clear()
    const tp = res.pages
    for (let i = pageIndex; i < Math.min(tp, pageIndex + 5); i++) pendingIdx.add(i)
    scheduleHiResRerender(0)
  } catch (e: any) {
    media.pdfPages = oldPagesArr as any
    media.pageSizesPt = oldSizes as any
    media.descriptor = oldDescriptor as any
    centerIndex.value = oldCenter
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
  const picked = await saveDialog({ defaultPath: base, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] })
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
  const picked = await saveDialog({ defaultPath: base, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
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
function insertDefaultDimsPt(): { widthPt: number; heightPt: number } {
  const p = settings.s.insertPaper
  const orient = settings.s.insertOrientation
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
  const { widthPt, heightPt } = insertDefaultDimsPt()
  const insertIndex = before ? pageIndex : pageIndex + 1
  const oldPagesArr = media.pdfPages.slice()
  const oldDescriptor = { ...d }
  const oldSizes: Record<number, { widthPt: number; heightPt: number }> = { ...media.pageSizesPt }
  const oldCenter = centerIndex.value
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
    media.markDirty()
    const res = await pdfInsertBlank({ docId: id, index: insertIndex, widthPt, heightPt })
    media.descriptor = { ...media.descriptor!, pages: res.pages } as any
    pendingIdx.clear()
    const tp = res.pages
    for (let i = insertIndex; i < Math.min(tp, insertIndex + 6); i++) pendingIdx.add(i)
    scheduleHiResRerender(0)
  } catch (e: any) {
    media.pdfPages = oldPagesArr as any
    media.pageSizesPt = oldSizes as any
    media.descriptor = oldDescriptor as any
    centerIndex.value = oldCenter
    alert(e?.message || String(e))
  }
}

async function insertBlankQuick(pageIndex: number) {
  const before = !!menu.value.aboveHalf
  await insertBlankAt(pageIndex, before)
}

async function rotatePlus90(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  try {
    await pdfRotatePageRelative({ docId: id, index: pageIndex, deltaDeg: 90 })
    media.markDirty()
    try {
      media.cancelInflight(pageIndex)
    } catch {}
    media.pdfPages[pageIndex] = null as any
    pendingIdx.add(pageIndex)
    scheduleHiResRerender(0)
  } catch (e: any) {
    alert(e?.message || String(e))
  }
}

const renderIndices = computed(() => {
  const tp = totalPages.value || 0
  return Array.from({ length: tp }, (_, i) => i)
})

let io: IntersectionObserver | null = null
let resizeObs: ResizeObserver | null = null
const scrollRootEl = ref<HTMLElement | null>(null)
const refs = new Map<Element, number>()
let rafScheduled = false
const pendingIdx = new Set<number>()
const visibleIdx = new Set<number>()
const containerW = ref(0)
let hiResTimer: number | null = null

const visibleStart = ref(0)
const visibleEnd = ref(0)
let scrollRaf = 0 as number | 0
let scrollEndTimer: number | null = null

function updateVisibleByScroll() {
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
  }
}

function onScroll() {
  if (scrollRaf) return
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0 as any
    updateVisibleByScroll()
    if (scrollEndTimer) clearTimeout(scrollEndTimer)
    scrollEndTimer = window.setTimeout(() => {
      centerIndex.value = displayPageIndex.value
      requestAnimationFrame(() => {
        scheduleHiResRerender()
      })
      scrollEndTimer = null
    }, 500)
  })
}

function scheduleHiResRerender(delay?: number) {
  if (hiResTimer) {
    clearTimeout(hiResTimer)
    hiResTimer = null
  }
  const ms = typeof delay === 'number' ? delay : 300
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

function observe(el: Element | null, idx: number) {
  if (!el) return
  refs.set(el, idx)
  io?.observe(el)
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

onMounted(() => {
  scrollRootEl.value?.addEventListener('scroll', onScroll, { passive: true })
  updateVisibleByScroll()
  if (scrollRootEl.value && 'ResizeObserver' in window) {
    let lastResizeWidth = 0
    resizeObs = new ResizeObserver(() => {
      const w = scrollRootEl.value?.clientWidth || 0
      if (w > 0) {
        const oldW = containerW.value
        if (oldW > 0 && w !== oldW) {
          const root = scrollRootEl.value
          const currentPageEl = root?.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement
          containerW.value = w
          scheduleUpdateFitPercent()
          nextTick(() => {
            requestAnimationFrame(() => {
              if (currentPageEl && root) {
                currentPageEl.scrollIntoView({ block: 'center', behavior: 'auto' })
              }
            })
          })
          const sizeDiff = Math.abs(w - oldW)
          const shouldRerender = oldW > 0 ? sizeDiff / oldW > 0.1 : false
          if (shouldRerender && w !== lastResizeWidth) {
            lastResizeWidth = w
            if (hiResTimer) clearTimeout(hiResTimer)
            scheduleHiResRerender(500)
          }
        } else {
          containerW.value = w
          scheduleUpdateFitPercent()
        }
      }
    })
    resizeObs.observe(scrollRootEl.value)
  }
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const idx = refs.get(e.target)
        if (idx == null) continue
        if (e.isIntersecting) {
          pendingIdx.add(idx)
          visibleIdx.add(idx)
        } else {
          media.cancelQueued(idx)
          try {
            media.cancelInflight(idx)
          } catch {}
          visibleIdx.delete(idx)
        }
      }
      scheduleProcess()
    },
    { root: scrollRootEl.value, rootMargin: '400px', threshold: 0.01 },
  )
  scrollRootEl.value?.querySelectorAll('[data-pdf-page]').forEach((el) => {
    const idx = Number((el as HTMLElement).dataset.pdfPage)
    if (Number.isFinite(idx)) {
      refs.set(el as Element, idx)
      io?.observe(el as Element)
    }
  })
})

onBeforeUnmount(() => {
  io?.disconnect()
  refs.clear()
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  if (hiResTimer) clearTimeout(hiResTimer)
  if (fitTimer) clearTimeout(fitTimer)
  scrollRootEl.value?.removeEventListener('scroll', onScroll)
  try {
    resizeObs?.disconnect()
  } catch {
    /* noop */
  }
})

watch(viewMode, () => {
  scheduleHiResRerender()
})

let fitTimer: number | null = null
function updateFitPercent() {
  if (viewMode.value !== 'fit') return
  const d = media.descriptor
  if (!d || d.type !== 'pdf') return
  const cW = containerW.value
  if (!cW) return
  const idx = centerIndex.value
  const cachedBase = media.baseCssWidthAt100(idx)
  const dprUsed = Math.min(window.devicePixelRatio || 1, settings.s.dprCap)
  const maxCssByCap = Math.max(1, Math.floor((settings.s.maxOutputWidth || Number.MAX_SAFE_INTEGER) / Math.max(0.5, dprUsed)))
  const effectiveCssW = Math.min(cW, maxCssByCap)
  if (cachedBase && cachedBase > 0) {
    displayFitPercent.value = Math.max(5, Math.min(400, Math.round((effectiveCssW / cachedBase) * 100)))
    return
  }
  media.getPageSizePt(idx).then((sz) => {
    if (!sz) return
    const base = sz.widthPt * (96 / 72)
    if (base > 0) {
      displayFitPercent.value = Math.max(5, Math.min(400, Math.round((effectiveCssW / base) * 100)))
    }
  })
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
watch([viewMode, centerIndex, containerW, () => settings.s.maxOutputWidth, () => settings.s.dprCap], () => {
  scheduleUpdateFitPercent()
})
onMounted(() => {
  scheduleUpdateFitPercent()
})

const shouldInvertColors = computed(() => settings.s.theme === 'dark' && settings.s.invertColorsInDarkMode)

function imgTransformStyle() {
  const styles: Record<string, string> = {}
  if (shouldInvertColors.value) {
    styles.filter = 'invert(1) hue-rotate(180deg)'
  }
  return Object.keys(styles).length > 0 ? styles : undefined
}

function pageCardStyle(idx: number) {
  const baseStyle: Record<string, string> = {}
  if (viewMode.value === 'fit') return baseStyle
  const base = media.baseCssWidthAt100(idx)
  if (base) {
    return { ...baseStyle, width: `${Math.max(50, Math.round(base * (zoomTarget.value / 100)))}px` }
  }
  return baseStyle
}

defineExpose({
  viewMode,
  displayZoom,
  currentPage,
  totalPages,
  setFitMode,
  resetZoom,
  zoomIn,
  zoomOut,
})
</script>

<template>
  <div
    ref="scrollRootEl"
    class="flex-1 overflow-auto scrollbar-visible overscroll-y-contain min-h-0"
    style="scrollbar-gutter: stable; will-change: scroll-position; overflow-anchor: none;"
  >
    <div v-if="!totalPages" class="p-4">尚未載入頁面</div>
    <div
      v-else
      :class="viewMode === 'fit' ? 'p-4 space-y-3' : 'p-4 space-y-3 min-w-full'"
    >
      <div class="w-full min-h-full bg-muted pt-4 pb-10">
        <div
          v-for="idx in renderIndices"
          :key="idx"
          :class="viewMode === 'fit' ? 'w-full mb-10 flex justify-center' : 'w-full mb-10'"
          :style="viewMode === 'actual' ? { marginBottom: Math.round(40 * (zoomTarget / 100)) + 'px' } : undefined"
          :data-pdf-page="idx"
          :ref="(el) => observe(el as Element, idx)"
          @contextmenu.prevent="onPageContextMenu(idx, $event)"
        >
          <div :class="viewMode === 'fit' ? 'mx-auto px-6 max-w-none w-full' : 'px-6'">
            <div
              :class="['bg-card rounded-md shadow border border-border relative inline-block', viewMode === 'fit' ? 'overflow-hidden w-full' : 'overflow-visible']"
              :style="pageCardStyle(idx)"
            >
              <img
                v-if="getPageDisplayUrl(idx)"
                :src="getPageDisplayUrl(idx)"
                :alt="`page-${idx}`"
                :class="[
                  viewMode === 'fit' ? 'w-full block' : 'block',
                  media.pdfPages[idx]?.isLowRes && settings.s.enableLowRes && 'blur-[0.3px]',
                ]"
                :style="imgTransformStyle()"
                decoding="async"
                loading="lazy"
                draggable="false"
              />
              <div v-else class="w-full aspect-[1/1.414] bg-muted animate-pulse"></div>
            </div>
            <div class="mt-3 text-xs text-[hsl(var(--muted-foreground))] text-center">第 {{ idx + 1 }} 頁</div>
          </div>
        </div>
      </div>
    </div>
    <teleport to="body">
      <div
        v-if="menu.open"
        data-context-menu
        class="fixed z-[2000] bg-card border border-border rounded shadow text-sm w-max"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      >
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="deletePageFromMenu(menu.pageIndex)">
          刪除此頁
        </button>
        <div class="border-t border-border my-1"></div>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="insertBlankQuick(menu.pageIndex)">
          插入空白頁（{{ menu.aboveHalf ? '之前' : '之後' }}）
        </button>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="rotatePlus90(menu.pageIndex)">
          旋轉 +90°
        </button>
        <div class="border-t border-border my-1"></div>
        <button
          class="w-full text-left px-3 py-2 hover:bg-hover flex items-center justify-between gap-4 whitespace-nowrap"
          @pointerenter="(ev: any) => { cancelExportClose(); const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); exportMenu.x = Math.round(r.right + 2); exportMenu.y = Math.round(r.top); exportMenu.open = true }"
          @pointerleave="() => scheduleExportClose(180)"
        >
          <span>匯出</span>
          <span class="opacity-60">▸</span>
        </button>
      </div>
    </teleport>
    <teleport to="body">
      <div
        v-if="exportMenu.open"
        data-export-submenu
        class="fixed z-[2010] bg-card border border-border rounded shadow text-sm w-max"
        :style="{ left: exportMenu.x + 'px', top: exportMenu.y + 'px' }"
        @pointerenter="cancelExportClose"
        @pointerleave="() => scheduleExportClose(120)"
      >
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="exportPageAsImage(menu.pageIndex)">
          圖片…
        </button>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="exportPageAsPdf(menu.pageIndex)">
          PDF…
        </button>
      </div>
    </teleport>
  </div>
</template>
