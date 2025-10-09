<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useFileListStore } from '@/modules/filelist/store'
import { useSettingsStore } from '@/modules/settings/store'
import { pdfDeletePagesDoc, pdfSave, pdfInsertBlank, pdfRotatePageRelative } from '@/modules/media/service'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useExportSettings } from '@/modules/export/settings'
import { pdfExportPageImage, pdfExportPagePdf } from '@/modules/media/service'

const media = useMediaStore()
const settings = useSettingsStore()
const filelist = useFileListStore()
const exportSettings = useExportSettings()
// 儲存狀態（即時編輯後可點擊）
const saving = ref(false)

// 統一格式與品質取得
function getRenderFormat() {
  return settings.s.renderFormat
}
function getRenderQuality() {
  const fmt = settings.s.renderFormat
  if (fmt === 'jpeg') return settings.s.jpegQuality
  if (fmt === 'webp') return 85  // WebP 預設品質 85（最佳平衡）
  return 75  // PNG 無 quality，回傳預設值
}
// 取得頁面顯示的 URL（尊重 enableLowRes 設定）
function getPageDisplayUrl(idx: number): string | undefined {
  const page = media.pdfPages[idx]
  if (!page) return undefined
  
  // 優先使用高清
  if (page.highResUrl) return page.highResUrl
  
  // 如果啟用低清渲染，才回退到低清
  if (settings.s.enableLowRes && page.lowResUrl) return page.lowResUrl
  
  return undefined
}

// 移除舊的標記刪除流程，改為即時操作

const totalPages = computed(() => media.descriptor?.pages ?? 0)
const isPdf = computed(() => media.descriptor?.type === 'pdf')
// 檢視模式與縮放
const viewMode = ref<'fit' | 'actual'>('fit')
// A.4: transform-based live zoom
const zoomTarget = ref(100) // 使用者即時目標倍率（顯示用）
const zoomApplied = ref(100) // 實際套用於布局寬度的倍率（debounce 套用）
// 顯示用百分比：fit 以容器寬相對 96dpi 的等效百分比顯示
const displayFitPercent = ref<number | null>(null)
const displayZoom = computed(() => viewMode.value === 'fit' ? (displayFitPercent.value ?? 100) : zoomTarget.value)
function dprForMode() {
  return viewMode.value === 'fit' ? Math.min((window.devicePixelRatio || 1), settings.s.dprCap) : 1
}
function dpiForActual() {
  const dpi = Math.max(24, Math.round(96 * (zoomApplied.value / 100)))
  const cap = Math.max(48, settings.s.actualModeDpiCap || dpi)
  return Math.min(dpi, cap)
}
function fitPercentBaseline(): number {
  // 使用已計算的顯示百分比為基準，不可用時回退 100
  const p = Math.round(displayFitPercent.value ?? 100)
  return Math.max(10, Math.min(400, p))
}
function scheduleZoomApply() {
  if (zoomDebounceTimer) { clearTimeout(zoomDebounceTimer); zoomDebounceTimer = null }
  const ms = Math.max(120, Math.min(300, settings.s.zoomDebounceMs || 180))
  zoomDebounceTimer = window.setTimeout(() => {
    zoomDebounceTimer = null
    if (viewMode.value === 'actual') {
      // 記錄當前滾動位置和縮放比例
      const root = scrollRootEl.value
      if (root) {
        const oldZoom = zoomApplied.value
        const newZoom = zoomTarget.value
        const zoomRatio = newZoom / oldZoom
        
        // 記錄當前滾動中心點
        const scrollCenterX = root.scrollLeft + root.clientWidth / 2
        const scrollCenterY = root.scrollTop + root.clientHeight / 2
        
        // 套用新的縮放
        zoomApplied.value = zoomTarget.value
        
        // 下一幀調整滾動位置以保持視覺中心
        nextTick(() => {
          requestAnimationFrame(() => {
            const newScrollCenterX = scrollCenterX * zoomRatio
            const newScrollCenterY = scrollCenterY * zoomRatio
            root.scrollLeft = newScrollCenterX - root.clientWidth / 2
            root.scrollTop = newScrollCenterY - root.clientHeight / 2
          })
        })
      } else {
        zoomApplied.value = zoomTarget.value
      }
      
      pendingIdx.clear();
      for (let i = visibleStart.value; i <= visibleEnd.value; i++) pendingIdx.add(i)
      scheduleHiResRerender(0)
    }
  }, ms)
}
function zoomIn() {
  if (viewMode.value !== 'actual') {
    // 由 fit 切換到 actual 時，以當前 fit 百分比作為起始縮放
    const root = scrollRootEl.value
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()
    zoomApplied.value = zoomTarget.value
    
    // 切換模式後保持當前頁面在視窗中心
    if (root) {
      nextTick(() => {
        requestAnimationFrame(() => {
          const currentPageEl = root.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement
          if (currentPageEl) {
            currentPageEl.scrollIntoView({ block: 'center', behavior: 'auto' })
          }
        })
      })
    }
  }
  zoomTarget.value = Math.min(400, zoomTarget.value + 10)
  scheduleZoomApply()
}
function zoomOut() {
  if (viewMode.value !== 'actual') {
    const root = scrollRootEl.value
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()
    zoomApplied.value = zoomTarget.value
    
    // 切換模式後保持當前頁面在視窗中心
    if (root) {
      nextTick(() => {
        requestAnimationFrame(() => {
          const currentPageEl = root.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement
          if (currentPageEl) {
            currentPageEl.scrollIntoView({ block: 'center', behavior: 'auto' })
          }
        })
      })
    }
  }
  zoomTarget.value = Math.max(10, zoomTarget.value - 10)
  scheduleZoomApply()
}
function resetZoom() {
  const root = scrollRootEl.value
  if (root && viewMode.value === 'actual') {
    // 記錄縮放前的中心點
    const oldZoom = zoomApplied.value
    const newZoom = 100
    const zoomRatio = newZoom / oldZoom
    const scrollCenterX = root.scrollLeft + root.clientWidth / 2
    const scrollCenterY = root.scrollTop + root.clientHeight / 2
    
    viewMode.value = 'actual'
    zoomTarget.value = 100
    zoomApplied.value = 100
    
    // 調整滾動位置
    nextTick(() => {
      requestAnimationFrame(() => {
        const newScrollCenterX = scrollCenterX * zoomRatio
        const newScrollCenterY = scrollCenterY * zoomRatio
        root.scrollLeft = newScrollCenterX - root.clientWidth / 2
        root.scrollTop = newScrollCenterY - root.clientHeight / 2
      })
    })
  } else {
    viewMode.value = 'actual'
    zoomTarget.value = 100
    zoomApplied.value = 100
  }
  pendingIdx.clear();[...visibleIdx].forEach(i => pendingIdx.add(i)); rafScheduled = false; scheduleHiResRerender(0)
}
function setFitMode() {
  if (viewMode.value !== 'fit') {
    viewMode.value = 'fit'
    pendingIdx.clear();[...visibleIdx].forEach(i => pendingIdx.add(i)); rafScheduled = false; scheduleHiResRerender(0)
  }
}
// ✨ 簡化方案：移除虛擬滾動，直接渲染所有頁面
// 依賴 CSS content-visibility: auto 自動優化不可見元素
const centerIndex = ref(0)
// 用於 toolbar 顯示的實時頁碼（滾動時立即更新）
const displayPageIndex = ref(0)
const currentPage = computed(() => {
  const tp = totalPages.value
  if (!tp || tp <= 0) return 0
  // 使用 displayPageIndex 讓 toolbar 即時響應
  return Math.min(tp, Math.max(1, displayPageIndex.value + 1))
})

async function gotoPage(page: number) {
  const tp = totalPages.value || 0
  if (tp <= 0) return
  const idx = Math.min(tp - 1, Math.max(0, Math.floor(page) - 1))
  centerIndex.value = idx
  displayPageIndex.value = idx // 同步顯示頁碼
  await nextTick()
  const root = scrollRootEl.value
  const el = root?.querySelector(`[data-pdf-page="${idx}"]`) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ block: 'center' })
    pendingIdx.add(idx); scheduleProcess()
  }
}

// 當載入新文件（PDF）時，嘗試跳到最近一次瀏覽的頁碼
watch(() => media.descriptor?.path, async (p) => {
  const d = media.descriptor
  if (!p || !d || d.type !== 'pdf') return
  // 切換文件
  const last = filelist.getLastPage(p)
  if (typeof last === 'number' && last > 1) {
    await nextTick()
    try { await gotoPage(last) } catch { }
  }
})

// 追蹤目前頁碼，持久化到 FileList（1-based）
watch([() => media.descriptor?.path, currentPage, isPdf], ([p, cp, pdf]) => {
  if (!p || !pdf) return
  if (typeof cp === 'number' && cp > 0) filelist.setLastPage(p, cp)
})

// Context menu
const menu = ref<{ open: boolean; x: number; y: number; pageIndex: number; aboveHalf: boolean }>({ open: false, x: 0, y: 0, pageIndex: -1, aboveHalf: true })
// Export submenu (hover)
const exportMenu = ref<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
let exportCloseTimer: number | null = null
function scheduleExportClose(delay = 150) { if (exportCloseTimer) clearTimeout(exportCloseTimer); exportCloseTimer = window.setTimeout(() => { exportMenu.value.open = false }, delay) }
function cancelExportClose() { if (exportCloseTimer) { clearTimeout(exportCloseTimer); exportCloseTimer = null } }
function onPageContextMenu(idx: number, e: MouseEvent) {
  if (!isPdf.value) return
  const target = (e.currentTarget as HTMLElement) || (e.target as HTMLElement)
  const rect = target?.getBoundingClientRect()
  const aboveHalf = rect ? (e.clientY < (rect.top + rect.height / 2)) : true
  menu.value = { open: true, x: e.clientX, y: e.clientY, pageIndex: idx, aboveHalf }
  exportMenu.value.open = false
}
function closeMenu() { menu.value.open = false; exportMenu.value.open = false }
function onGlobalClick(e: MouseEvent) {
  // 檢查點擊是否在選單區域內
  const target = e.target as HTMLElement
  const inMainMenu = target.closest('[data-context-menu]')
  const inExportMenu = target.closest('[data-export-submenu]')
  if (!inMainMenu && !inExportMenu && menu.value.open) {
    closeMenu()
  }
}
function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') closeMenu() }
onMounted(() => { window.addEventListener('click', onGlobalClick, { capture: true }); window.addEventListener('keydown', onEsc) })
onBeforeUnmount(() => { window.removeEventListener('click', onGlobalClick, { capture: true }); window.removeEventListener('keydown', onEsc) })

// Immediate delete from context menu (single page)
async function deletePageFromMenu(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  // Optimistic update: remove page locally
  const oldPagesArr = media.pdfPages.slice()
  const oldDescriptor = { ...d }
  const oldSizes: Record<number, { widthPt: number; heightPt: number }> = { ...media.pageSizesPt }
  const oldCenter = centerIndex.value
  try {
    // Remove the page thumbnail/entry
    media.pdfPages.splice(pageIndex, 1)
    // Shift pageSizesPt keys after deleted index
    const shifted: Record<number, { widthPt: number; heightPt: number }> = {}
    for (const k of Object.keys(oldSizes)) {
      const idx = Number(k)
      const v = oldSizes[idx]
      if (idx < pageIndex) shifted[idx] = v
      else if (idx > pageIndex) shifted[idx - 1] = v
    }
    media.pageSizesPt = shifted as any
    // Update total pages right away
    media.descriptor = { ...d, pages: Math.max(0, (d.pages || 1) - 1) } as any
    // Adjust center if needed
    if (pageIndex <= oldCenter) {
      centerIndex.value = Math.max(0, oldCenter - 1)
    }
    // Cancel any queued/inflight for this index
    try { media.cancelQueued(pageIndex) } catch {}
    try { media.cancelInflight(pageIndex) } catch {}
    // Request backend deletion
    const res = await pdfDeletePagesDoc({ docId: id, indices: [pageIndex] })
    // Align pages with backend result
    media.descriptor = { ...media.descriptor!, pages: res.pages } as any
    media.markDirty()
    // Re-render from the affected index
    pendingIdx.clear()
    const tp = res.pages
    for (let i = pageIndex; i < Math.min(tp, pageIndex + 5); i++) pendingIdx.add(i)
    scheduleHiResRerender(0)
  } catch (e: any) {
    // Rollback on failure
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
  // 推算建議寬度（若可取得頁寬 pt）
  const sz = await media.getPageSizePt(pageIndex)
  let targetWidth: number | undefined = undefined
  if (sz) {
    targetWidth = Math.max(1, Math.round(sz.widthPt * dpi / 72))
  }
  const page1 = String(pageIndex + 1).padStart(3, '0')
  const base = (d.name?.replace(/\.pdf$/i, '') || 'page') + ` - page ${page1}.${fmt}`
  const picked = await saveDialog({ defaultPath: base, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] })
  if (!picked) return
  try {
    await pdfExportPageImage({ docId: id, pageIndex, destPath: picked, format: fmt, targetWidth, dpi, quality: fmt === 'jpeg' ? exportSettings.s.imageQuality : undefined })
    // 可選：提示成功
  } catch (e: any) {
    alert(e?.message || String(e))
  }
}

// Insert blank (defaults)
function mmToPt(mm: number): number { return Math.round(mm * 72 / 25.4) }
function insertDefaultDimsPt(): { widthPt: number; heightPt: number } {
  const p = settings.s.insertPaper
  const orient = settings.s.insertOrientation
  // base mm sizes (portrait)
  let wmm = 210, hmm = 297
  if (p === 'Letter') { wmm = 215.9; hmm = 279.4 }
  else if (p === 'A5') { wmm = 148; hmm = 210 }
  else if (p === 'Legal') { wmm = 215.9; hmm = 355.6 }
  else if (p === 'Tabloid') { wmm = 279.4; hmm = 431.8 }
  else if (p === 'Custom') { wmm = Math.max(1, settings.s.insertCustomWidthMm); hmm = Math.max(1, settings.s.insertCustomHeightMm) }
  let wpt = mmToPt(wmm), hpt = mmToPt(hmm)
  if (orient === 'landscape') { const t = wpt; wpt = hpt; hpt = t }
  return { widthPt: wpt, heightPt: hpt }
}

async function insertBlankAt(pageIndex: number, before: boolean) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  const { widthPt, heightPt } = insertDefaultDimsPt()
  const insertIndex = before ? pageIndex : (pageIndex + 1)
  // optimistic update
  const oldPagesArr = media.pdfPages.slice()
  const oldDescriptor = { ...d }
  const oldSizes: Record<number, { widthPt: number; heightPt: number }> = { ...media.pageSizesPt }
  const oldCenter = centerIndex.value
  try {
    media.pdfPages.splice(insertIndex, 0, null)
    // shift sizes >= insertIndex by +1
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
    // backend
    const res = await pdfInsertBlank({ docId: id, index: insertIndex, widthPt, heightPt })
    media.descriptor = { ...media.descriptor!, pages: res.pages } as any
    // re-render affected range
    pendingIdx.clear();
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

// Rotate: relative +90
async function rotatePlus90(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  try {
    await pdfRotatePageRelative({ docId: id, index: pageIndex, deltaDeg: 90 })
    media.markDirty()
    try { media.cancelInflight(pageIndex) } catch {}
    media.pdfPages[pageIndex] = null as any
    pendingIdx.add(pageIndex)
    scheduleHiResRerender(0)
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
    // 可選：提示已匯出成功
  } catch (e: any) {
    alert(e?.message || String(e))
  }
}

// 即時儲存：依設定（覆蓋或另存新檔）
async function onSaveNow() {
  const id = media.docId
  const d = media.descriptor
  if (id == null || !d || d.type !== 'pdf') return
  try {
    saving.value = true
    let res: { path: string, pages: number }
    if (settings.s.deleteBehavior === 'saveAsNew') {
      const base = (d.name?.replace(/\.pdf$/i, '') || 'output') + ' (edited).pdf'
      const picked = await saveDialog({ defaultPath: base, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!picked) return
      res = await pdfSave({ docId: id, destPath: picked, overwrite: true })
      // 若另存為新路徑，更新清單與選取
      try {
        filelist.add(res.path)
        filelist.setLastPage(res.path, Math.max(1, currentPage.value))
        await media.selectPath(res.path)
      } catch {}
    } else {
      res = await pdfSave({ docId: id, overwrite: true })
    }
    media.clearDirty()
    // 同步頁數與路徑（覆蓋時多半相同，但以後端為準）
    media.descriptor = { ...media.descriptor, path: res.path, pages: res.pages } as any
    // 可選：提示已儲存
  } catch (e: any) {
    alert(e?.message || String(e))
  } finally {
    saving.value = false
  }
}

// 移除舊的存檔套用刪除流程（已改為即時操作）

// ✨ 簡化渲染範圍：直接渲染所有頁面，依賴 CSS content-visibility 優化
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
let zoomDebounceTimer: number | null = null

// 以 scrollTop 估算可見區域（O(1)）；避免逐一量測 DOM
const visibleStart = ref(0)
const visibleEnd = ref(0)
let scrollRaf = 0 as number | 0
let scrollEndTimer: number | null = null

function updateVisibleByScroll() {
  const root = scrollRootEl.value
  const tp = totalPages.value || 0
  if (!root || tp <= 0) return
  
  // 🎯 使用 DOM 實際位置判斷中心頁（精確方案）
  const viewportTop = root.scrollTop
  const viewportMid = viewportTop + root.clientHeight / 2
  
  // 遍歷已渲染的頁面元素，找出最接近視窗中心的頁面
  let closestIndex = displayPageIndex.value // 預設保持當前值
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
  
  // 滾動時只更新 displayPageIndex（用於 toolbar 顯示）
  displayPageIndex.value = closestIndex
  media.setPriorityIndex(closestIndex)
  
  // ✨ 簡化的可見區域計算（基於視窗位置）
  const overscan = settings.s.highResOverscan || 5
  const elements = root.querySelectorAll('[data-pdf-page]')
  const visibleIndices: number[] = []
  
  elements.forEach((el) => {
    const idx = Number((el as HTMLElement).dataset.pdfPage)
    if (!Number.isFinite(idx)) return
    const rect = el.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    // 檢查元素是否在視窗範圍內（含 overscan）
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
  if (hiResTimer) { clearTimeout(hiResTimer); hiResTimer = null }
  const ms = typeof delay === 'number' ? delay : 300  // 預設 300ms（快速響應與效能平衡）
  hiResTimer = window.setTimeout(() => {
    // 僅針對「可見 + 小範圍 overscan」發出高清重繪請求
    const tp = totalPages.value || 0
    if (tp <= 0) { hiResTimer = null; return }
    const start = Math.max(0, visibleStart.value)
    const end = Math.min(tp - 1, visibleEnd.value)
    const hiStart = Math.max(0, start)
    const hiEnd = Math.min(tp - 1, end)
    pendingIdx.clear()
    for (let i = hiStart; i <= hiEnd; i++) pendingIdx.add(i)
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
    // 依據可見區間 + highResOverscan 計算實際要處理的集合
    const tp = totalPages.value || 0
    if (tp <= 0) return
    const center = centerIndex.value
    const overscan = settings.s.highResOverscan
    const start = Math.max(0, Math.min(visibleStart.value, center - overscan))
    const end = Math.min(tp - 1, Math.max(visibleEnd.value, center + overscan))
    media.enforceVisibleRange(start, end)
    const allowed = new Set<number>()
    for (let i = start; i <= end; i++) allowed.add(i)
    const work = list.filter(idx => allowed.has(idx))
    for (const idx of work) {
      const cW = containerW.value || 800
      if (viewMode.value === 'actual') {
        media.renderPdfPage(idx, undefined, getRenderFormat(), getRenderQuality(), dpiForActual())
      } else {
        const dpr = dprForMode()
        const baseW = cW
        const hiW = Math.min(
          Math.floor(baseW * dpr),
          Math.max(320, settings.s.maxOutputWidth || 2147483647)
        )
        media.renderPdfPage(idx, hiW, getRenderFormat(), getRenderQuality())
      }
    }
  })
}

onMounted(() => {
  // 監聽滾動，採用 scrollTop + 估算高度的 O(1) 計算
  scrollRootEl.value?.addEventListener('scroll', onScroll, { passive: true })
  // 初始化可見區域與中心
  updateVisibleByScroll()
  // 容器寬度監控（避免在 scroll handler 中頻繁量測）
  if (scrollRootEl.value && 'ResizeObserver' in window) {
    let lastResizeWidth = 0
    resizeObs = new ResizeObserver(() => {
      const w = scrollRootEl.value?.clientWidth || 0
      if (w > 0) {
        const oldW = containerW.value
        
        // 🎯 視窗大小變化時保持當前頁面位置
        if (oldW > 0 && w !== oldW) {
          const root = scrollRootEl.value
          const currentPageEl = root?.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement
          
          // 先更新寬度
          containerW.value = w
          scheduleUpdateFitPercent()
          
          // 延遲恢復滾動位置（等待 DOM 更新）
          nextTick(() => {
            requestAnimationFrame(() => {
              if (currentPageEl && root) {
                // 保持當前頁面在視窗中的相對位置
                currentPageEl.scrollIntoView({ block: 'center', behavior: 'auto' })
              }
            })
          })
          
          // ⚡ 視窗大小變化超過 10% 時重新渲染（支援放大與縮小）
          const sizeDiff = Math.abs(w - oldW)
          const shouldRerender = (sizeDiff / oldW) > 0.1
          
          if (shouldRerender && w !== lastResizeWidth) {
            lastResizeWidth = w
            if (hiResTimer) clearTimeout(hiResTimer)
            scheduleHiResRerender(500)  // 視窗調整後 500ms 重渲染（平衡響應速度與效能）
          }
        } else {
          containerW.value = w
          scheduleUpdateFitPercent()
        }
      }
    })
    resizeObs.observe(scrollRootEl.value)
  }
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const idx = refs.get(e.target)
      if (idx == null) continue
      if (e.isIntersecting) {
        pendingIdx.add(idx)
        visibleIdx.add(idx)
      } else {
        // 離開視窗，取消排隊並盡量取消 inflight（提升 gen + 通知後端）
        media.cancelQueued(idx)
        try { media.cancelInflight(idx) } catch { }
        visibleIdx.delete(idx)
      }
    }
    scheduleProcess()
  }, { root: scrollRootEl.value, rootMargin: '400px', threshold: 0.01 })
  // 既有元素補 observe（限本容器）
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
  if (zoomDebounceTimer) clearTimeout(zoomDebounceTimer)
  if (fitTimer) clearTimeout(fitTimer)
  scrollRootEl.value?.removeEventListener('scroll', onScroll)
  try { resizeObs?.disconnect() } catch { }
})

// 當檢視模式變更時，延遲請求高清重渲染，避免連續縮放卡頓
watch(viewMode, () => { scheduleHiResRerender() })

// 動態計算「最佳符合」對應的實際大小百分比（以 96dpi 為 100% 基準）
async function updateFitPercent() {
  if (viewMode.value !== 'fit') return
  const d = media.descriptor
  if (!d) return
  // 需要中心頁與容器寬度
  const cW = containerW.value
  if (!cW) return
  // 圖片：以原始像素寬為 100% 基準
  if (d.type === 'image') {
    try {
      const imgEl = document.querySelector('[data-image-view] img') as HTMLImageElement | null
      if (imgEl && imgEl.naturalWidth > 0) {
        displayFitPercent.value = Math.max(5, Math.min(400, Math.round((cW / imgEl.naturalWidth) * 100)))
      }
    } catch { }
    return
  }
  // PDF：查詢頁面點數寬並換算 96dpi 的 CSS 寬
  if (d.type === 'pdf') {
    const idx = centerIndex.value
    const cachedBase = media.baseCssWidthAt100(idx)
    // 以可用的實際輸出上限校正：有效 CSS 寬 = min(containerW, maxOutputWidth / dprUsed)
    const dprUsed = Math.min((window.devicePixelRatio || 1), settings.s.dprCap)
    const maxCssByCap = Math.max(1, Math.floor((settings.s.maxOutputWidth || Number.MAX_SAFE_INTEGER) / Math.max(0.5, dprUsed)))
    const effectiveCssW = Math.min(cW, maxCssByCap)
    if (cachedBase && cachedBase > 0) {
      displayFitPercent.value = Math.max(5, Math.min(400, Math.round((effectiveCssW / cachedBase) * 100)))
      return
    }
    // 若未快取，嘗試抓取一次並更新
    const sz = await media.getPageSizePt(idx)
    if (sz) {
      const base = sz.widthPt * (96 / 72)
      if (base > 0) {
        displayFitPercent.value = Math.max(5, Math.min(400, Math.round((effectiveCssW / base) * 100)))
      }
    }
  }
}

// Debounce fit 百分比更新，避免量測風暴
let fitTimer: number | null = null
function scheduleUpdateFitPercent() {
  if (fitTimer) { clearTimeout(fitTimer); fitTimer = null }
  fitTimer = window.setTimeout(() => { fitTimer = null; updateFitPercent() }, 150)
}
watch([viewMode, centerIndex, containerW, () => settings.s.maxOutputWidth, () => settings.s.dprCap], () => { scheduleUpdateFitPercent() })
onMounted(() => { scheduleUpdateFitPercent() })

// 監看 zoomApplied 以影響估高與寬度布局（debounce 後才更新）
watch(zoomApplied, () => { /* no-op: 讓依賴更新 */ })

function pageCardStyle(idx: number) {
  const baseStyle: any = {}
  if (viewMode.value === 'fit') return baseStyle
  const d = media.descriptor
  if (!d) return baseStyle
  if (d.type === 'pdf') {
    const base = media.baseCssWidthAt100(idx)
    if (base) return { ...baseStyle, width: `${Math.max(50, Math.round(base * (zoomApplied.value / 100)))}px` }
    return baseStyle
  }
  if (d.type === 'image') {
    if (imageNaturalWidth.value) return { ...baseStyle, width: `${Math.max(50, Math.round(imageNaturalWidth.value * (zoomApplied.value / 100)))}px` }
    return baseStyle
  }
  return baseStyle
}

const liveScale = computed(() => viewMode.value === 'actual' ? Math.max(0.1, zoomTarget.value / Math.max(1, zoomApplied.value)) : 1)
function imgTransformStyle() {
  if (viewMode.value !== 'actual') return undefined
  const s = liveScale.value
  if (!Number.isFinite(s) || s === 1) return undefined
  return { transform: `scale(${s})`, transformOrigin: 'top left' }
}

const imageEl = ref<HTMLImageElement | null>(null)
const imageNaturalWidth = ref<number | null>(null)
function onImageLoad(e: Event) {
  const el = e.target as HTMLImageElement
  imageNaturalWidth.value = el?.naturalWidth || null
  updateFitPercent()
}
</script>

<template>
  <div class="h-full flex flex-col">

    <!-- Dubug UI -->
    <div v-if="settings.s.devPerfOverlay"
      class="fixed bottom-2 right-2 z-50 pointer-events-none bg-black/75 text-white text-xs px-2 py-1 rounded shadow">
      <span v-if="isPdf">p {{ currentPage }} / {{ totalPages }} · </span>
      inflight: {{ media.inflightCount }} · queued: {{ media.queue.length }}
    </div>

    <!-- Tool Bar-->
    <div class="sticky top-0 z-20 bg-background/90 backdrop-blur border-b shrink-0">
      <div class="px-4 py-2 flex items-center justify-between gap-4">
        <!-- 左側：檔案操作 -->
        <div class="flex items-center gap-3">
          <button @click="onSaveNow" :disabled="saving || !media.dirty"
            class="rounded border border-border w-8 h-8 flex items-center justify-center transition-colors"
            :class="media.dirty ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-card text-muted-foreground opacity-60 cursor-not-allowed'"
            title="儲存">
            💾
          </button>
        </div>

        <!-- 中間：頁碼導覽 -->
        <div class="flex items-center gap-3">
          <div class="flex items-center text-sm tabular-nums text-[hsl(var(--muted-foreground))]">
            <template v-if="isPdf && totalPages > 0">
              <span class="text-[hsl(var(--foreground))]">{{ currentPage }}</span>
              <span class="mx-1">/</span>
              <span>{{ totalPages }}</span>
            </template>
            <template v-else>
              <span>0 / 0</span>
            </template>
          </div>
        </div>

        <!-- 右側：檢視控制 -->
        <div class="flex items-center gap-3">
          <!-- 顯示模式 -->
          <div class="flex items-center gap-1 bg-card rounded border border-border p-0.5">
            <button @click="setFitMode"
              class="text-xs rounded px-2 h-7 flex items-center justify-center transition-colors whitespace-nowrap"
              :class="viewMode === 'fit' ? 'bg-[hsl(var(--accent))] shadow-sm' : 'hover:bg-hover'">
              符合寬度
            </button>
            <button @click="resetZoom"
              class="text-xs rounded px-2 h-7 flex items-center justify-center transition-colors whitespace-nowrap"
              :class="viewMode === 'actual' ? 'bg-[hsl(var(--accent))] shadow-sm' : 'hover:bg-hover'">
              實際大小
            </button>
          </div>

          <!-- 縮放控制 -->
          <div class="flex items-center gap-1 bg-card rounded border border-border px-1">
            <button @click="zoomOut" class="w-7 h-7 text-sm rounded hover:bg-hover transition-colors flex items-center justify-center">−</button>
            <div class="min-w-[48px] text-center text-xs tabular-nums px-1">{{ displayZoom }}%</div>
            <button @click="zoomIn" class="w-7 h-7 text-sm rounded hover:bg-hover transition-colors flex items-center justify-center">+</button>
          </div>
        </div>
      </div>
    </div>

    <div ref="scrollRootEl" class="flex-1 overflow-auto scrollbar-visible overscroll-y-contain"
      style="scrollbar-gutter: stable; will-change: scroll-position; overflow-anchor: none;">
      <div :class="viewMode === 'fit' ? 'p-4 space-y-3' : 'p-4 space-y-3 min-w-full'" 
        style="will-change: contents;">

        <div v-if="media.loading">讀取中…</div>

        <div v-else-if="media.error" class="text-red-600">{{ media.error }}</div>

        <div v-else>
          
          <div v-if="media.imageUrl" class="w-full min-h-full bg-muted pt-4 pb-10" data-image-view>
            <div class="w-full flex justify-center">
              <div :class="viewMode === 'fit' ? 'mx-auto px-6 max-w-none w-full' : 'px-6'">
                <div class="bg-card rounded-md shadow border border-border overflow-auto inline-block"
                  :style="pageCardStyle(0)">
                  <img :src="media.imageUrl" alt="image" :class="viewMode === 'fit' ? 'w-full block' : 'block'"
                    :style="imgTransformStyle()" ref="imageEl" @load="onImageLoad"
                    @error="media.fallbackLoadImageBlob()" draggable="false" />
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="totalPages" class="w-full min-h-full bg-muted pt-4 pb-10">
            <div v-for="idx in renderIndices" :key="idx" 
              class="w-full mb-10 flex justify-center"
              :style="viewMode === 'actual' ? { marginBottom: Math.round(40 * (zoomApplied / 100)) + 'px' } : undefined"
              :data-pdf-page="idx" :ref="el => observe(el as Element, idx)"
              @contextmenu.prevent="onPageContextMenu(idx, $event)">
              <div :class="viewMode === 'fit' ? 'mx-auto px-6 max-w-none w-full' : 'px-6'">
                <div
                  :class="['bg-card rounded-md shadow border border-border relative inline-block', viewMode === 'fit' ? 'overflow-hidden w-full' : 'overflow-visible']"
                  :style="pageCardStyle(idx)">
                  <!-- 漸進式顯示：優先 highResUrl，enableLowRes 啟用時才回退 lowResUrl -->
                  <img 
                    v-if="getPageDisplayUrl(idx)" 
                    :src="getPageDisplayUrl(idx)"
                    :alt="`page-${idx}`" 
                    :class="[
                      viewMode === 'fit' ? 'w-full block' : 'block',
                      media.pdfPages[idx]?.isLowRes && settings.s.enableLowRes && 'blur-[0.3px]'
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
      </div>
    </div>
    <teleport to="body">
      <div v-if="menu.open" data-context-menu class="fixed z-[2000] bg-card border border-border rounded shadow text-sm w-max"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="deletePageFromMenu(menu.pageIndex)">
          刪除此頁
        </button>
        <div class="border-t border-border my-1"></div>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="insertBlankQuick(menu.pageIndex)">
          插入空白頁（{{ menu.aboveHalf ? '之前' : '之後' }}）
        </button>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="rotatePlus90(menu.pageIndex)">旋轉 +90°</button>
        <div class="border-t border-border my-1"></div>
        <button class="w-full text-left px-3 py-2 hover:bg-hover flex items-center justify-between gap-4 whitespace-nowrap"
          @pointerenter="(ev:any) => { cancelExportClose(); const r=(ev.currentTarget as HTMLElement).getBoundingClientRect(); exportMenu.x = Math.round(r.right + 2); exportMenu.y = Math.round(r.top); exportMenu.open = true }"
          @pointerleave="() => scheduleExportClose(180)">
          <span>匯出</span>
          <span class="opacity-60">▸</span>
        </button>
      </div>
    </teleport>
    <teleport to="body">
      <div v-if="exportMenu.open" data-export-submenu class="fixed z-[2010] bg-card border border-border rounded shadow text-sm w-max"
        :style="{ left: exportMenu.x + 'px', top: exportMenu.y + 'px' }"
        @pointerenter="cancelExportClose" @pointerleave="() => scheduleExportClose(120)">
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="exportPageAsImage(menu.pageIndex)">圖片…</button>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="exportPageAsPdf(menu.pageIndex)">PDF…</button>
      </div>
    </teleport>
  </div>
</template>
