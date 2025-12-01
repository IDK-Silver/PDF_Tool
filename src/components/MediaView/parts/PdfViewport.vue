<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import { useExportSettings } from '@/modules/export/settings'
import { useZoom, type ZoomContext } from '@/modules/media/useZoom'
import PdfTextLayer from './PdfTextLayer.vue'
import type { PageTextContent } from '@/modules/media/types'

console.log('[PdfViewport] Component script setup executed')
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
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { tempDir, join } from '@tauri-apps/api/path'
// removed: openInFileManager (no longer used in context menu)

const media = useMediaStore()
const settings = useSettingsStore()
const filelist = useFileListStore()
const exportSettings = useExportSettings()

type SearchMatch = {
  pageIndex: number
  startCharIndex: number
  endCharIndex: number
}

const {
  viewMode,
  zoomTarget,
  displayFitPercent,
  displayZoom,
  canZoomIn,
  canZoomOut,
  setZoom,
  resetZoom,
  setFitMode,
  handleWheelZoom: zoomHandleWheel,
} = useZoom()

/**
 * 建立縮放上下文（ZoomContext）
 * 封裝所有 DOM 引用，供 useZoom 使用
 */
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

const searchVisible = ref(false)
const searchTerm = ref('')
const searchMatches = ref<SearchMatch[]>([])
const searchActiveIndex = ref(-1)
const searchPageMap = ref<Record<number, number[]>>({})
const searchPageIndex = ref<Record<number, number>>({})
const searchBusy = ref(false)
const searchError = ref<string | null>(null)
const searchInputEl = ref<HTMLInputElement | null>(null)
let searchDebounceTimer: number | null = null
let activeSearchToken = 0
const pageNormalizedCache = new Map<number, { normalized: string; map: number[]; source: PageTextContent }>()
let pendingScrollAnimation: number | null = null
const searchAnchor = ref<{ top: number; left: number; width: number } | null>(null)
const SEARCH_PANEL_MIN_WIDTH = 240
const SEARCH_PANEL_MAX_WIDTH = 360
const SEARCH_PANEL_MARGIN = 12
const isInteracting = ref(false)
let interactionTimer: number | null = null

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
  // 設定實體像素尺寸
  if (el.width !== d.width) el.width = d.width
  if (el.height !== d.height) el.height = d.height
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.putImageData(d, 0, 0)
}

const totalPages = computed(() => media.descriptor?.pages ?? 0)
const docId = computed(() => media.docId)

function dprForMode() {
  return viewMode.value === 'fit' ? Math.min(window.devicePixelRatio || 1, settings.s.dprCap) : 1
}
function dpiForActual() {
  const dpi = Math.max(24, Math.round(96 * (zoomTarget.value / 100)))
  const cap = Math.max(48, settings.s.actualModeDpiCap || dpi)
  return Math.min(dpi, cap)
}

function normalizeSearchString(value: string) {
  return value.replace(/\s+/g, '').toLowerCase()
}

function buildNormalizedPageData(pageIndex: number, content: PageTextContent | null) {
  if (!content) return { normalized: '', map: [] as number[] }
  const cached = pageNormalizedCache.get(pageIndex)
  if (cached && cached.source === content) return cached
  const normalizedParts: string[] = []
  const indexMap: number[] = []
  // 遍歷所有 spans，每個 span 包含多個字元
  let charIndex = 0
  for (const span of content.spans) {
    if (!span) continue
    const raw = span.text || ''
    if (!raw) continue
    for (const unit of Array.from(raw)) {
      if (!/\s/.test(unit)) {
        normalizedParts.push(unit.toLowerCase())
        indexMap.push(charIndex)
      }
      charIndex++
    }
  }
  const data = { normalized: normalizedParts.join(''), map: indexMap, source: content }
  pageNormalizedCache.set(pageIndex, data)
  return data
}

function setSearchAnchor(force = false) {
  const rootRect = scrollRootEl.value?.getBoundingClientRect() ?? null
  if (!rootRect) {
    if (force) searchAnchor.value = null
    return
  }
  if (!force && searchAnchor.value) return

  const viewportWidth = window.innerWidth || 0
  const availableViewportWidth = viewportWidth > 0 ? viewportWidth - SEARCH_PANEL_MARGIN * 2 : SEARCH_PANEL_MAX_WIDTH
  const availableRootWidth = Math.max(120, rootRect.width - SEARCH_PANEL_MARGIN * 2)
  let panelWidth = Math.min(SEARCH_PANEL_MAX_WIDTH, Math.max(SEARCH_PANEL_MIN_WIDTH, Math.min(availableViewportWidth, availableRootWidth)))
  const minWidth = Math.min(availableViewportWidth, availableRootWidth)
  if (minWidth < SEARCH_PANEL_MIN_WIDTH) {
    panelWidth = Math.max(200, minWidth)
  }

  const baseLeft = rootRect.left + SEARCH_PANEL_MARGIN
  const maxLeftWithinRoot = rootRect.right - SEARCH_PANEL_MARGIN - panelWidth
  let desiredLeft = baseLeft
  desiredLeft = Math.max(baseLeft, desiredLeft)
  desiredLeft = Math.min(desiredLeft, Math.max(baseLeft, maxLeftWithinRoot))

  const top = rootRect.top + SEARCH_PANEL_MARGIN
  searchAnchor.value = { top: Math.max(SEARCH_PANEL_MARGIN, top), left: desiredLeft, width: panelWidth }
}

const searchPanelStyle = computed(() => {
  const anchor = searchAnchor.value
  if (anchor) {
    return {
      top: `${anchor.top}px`,
      left: `${anchor.left}px`,
      width: `${anchor.width}px`,
    }
  }
  const rootRect = scrollRootEl.value?.getBoundingClientRect() ?? null
  const viewportWidth = window.innerWidth || 0
  const availableViewportWidth = viewportWidth > 0 ? viewportWidth - SEARCH_PANEL_MARGIN * 2 : SEARCH_PANEL_MAX_WIDTH
  const availableRootWidth = rootRect ? Math.max(120, rootRect.width - SEARCH_PANEL_MARGIN * 2) : availableViewportWidth
  let panelWidth = Math.min(SEARCH_PANEL_MAX_WIDTH, Math.max(SEARCH_PANEL_MIN_WIDTH, Math.min(availableViewportWidth, availableRootWidth)))
  const minWidth = Math.min(availableViewportWidth, availableRootWidth)
  if (minWidth < SEARCH_PANEL_MIN_WIDTH) {
    panelWidth = Math.max(200, minWidth)
  }
  const top = rootRect ? Math.max(SEARCH_PANEL_MARGIN, rootRect.top + SEARCH_PANEL_MARGIN) : 72
  const fallbackLeft = viewportWidth > 0 ? viewportWidth - panelWidth - SEARCH_PANEL_MARGIN : SEARCH_PANEL_MARGIN
  const left = rootRect ? Math.max(SEARCH_PANEL_MARGIN, rootRect.left + SEARCH_PANEL_MARGIN) : Math.max(SEARCH_PANEL_MARGIN, fallbackLeft)
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${panelWidth}px`,
  }
})

/** 以視窗中心為錨點放大 */
async function handleZoomIn() {
  const ctx = createZoomContext()
  const currentZoom = viewMode.value === 'fit'
    ? Math.round(displayFitPercent.value ?? 100)
    : zoomTarget.value
  await setZoom(currentZoom + 25, ctx, { type: 'viewport-center' })
  triggerRerender(300)
}

/** 以視窗中心為錨點縮小 */
async function handleZoomOut() {
  const ctx = createZoomContext()
  const currentZoom = viewMode.value === 'fit'
    ? Math.round(displayFitPercent.value ?? 100)
    : zoomTarget.value
  await setZoom(currentZoom - 25, ctx, { type: 'viewport-center' })
  triggerRerender(300)
}

/** 包裝 composable 的 resetZoom，加入維持視覺中心與重新渲染邏輯 */
async function handleResetZoom() {
  const ctx = createZoomContext()
  await resetZoom(ctx, { type: 'viewport-center' })
  triggerRerender(300)
}

/** 包裝 composable 的 setFitMode，加入維持視覺中心與重新渲染邏輯 */
async function handleSetFitMode() {
  if (viewMode.value === 'fit') return
  const ctx = createZoomContext()
  await setFitMode(ctx, { type: 'viewport-center' })
  triggerRerender(300)
}

/** 統一的重新渲染觸發函式 */
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
  if (!root) return
  const el = root.querySelector(`[data-pdf-page="${idx}"]`) as HTMLElement | null
  if (el) {
    // 手動計算滾動位置，避免 scrollIntoView 影響外層 body
    const offsetTop = el.offsetTop
    const scrollTarget = offsetTop - (root.clientHeight / 2) + (el.clientHeight / 2)
    root.scrollTop = scrollTarget
    
    pendingIdx.add(idx)
    scheduleProcess()
  }
}

watch(
  () => media.descriptor?.path,
  async (p, oldP) => {
    const d = media.descriptor
    if (!p || !d || d.type !== 'pdf') return
    
    console.log('[PdfViewport] Path changed from', oldP, 'to', p)
    
    // 初始化 displayPageIndex 為 0（確保 currentPage 計算正確）
    displayPageIndex.value = 0
    centerIndex.value = 0
    
    // 等待檔案列表載入完成後再取最後頁碼（避免競態）
    try { await filelist.whenReady() } catch {}
    const last = filelist.getLastPage(p)
    console.log('[PdfViewport] Last page from storage:', last)
    
    if (typeof last === 'number' && last >= 1) {
      // 等待 media store 完成載入
      await new Promise<void>((resolve) => {
        const checkLoading = () => {
          if (!media.loading) {
            console.log('[PdfViewport] Loading complete')
            resolve()
          } else {
            requestAnimationFrame(checkLoading)
          }
        }
        checkLoading()
      })
      
      // 等待 DOM 元素真的渲染出來
      await new Promise<void>((resolve) => {
        const targetIdx = Math.min((d.pages || 1) - 1, Math.max(0, Math.floor(last) - 1))
        console.log('[PdfViewport] Waiting for DOM element, targetIdx:', targetIdx)
        const checkDOM = () => {
          const root = scrollRootEl.value
          const el = root?.querySelector(`[data-pdf-page="${targetIdx}"]`)
          if (el) {
            console.log('[PdfViewport] DOM element found')
            resolve()
          } else {
            requestAnimationFrame(checkDOM)
          }
        }
        // 先等一次 nextTick，再開始輪詢
        nextTick().then(() => checkDOM())
      })
      
      try {
        console.log('[PdfViewport] Calling gotoPage:', last)
        await gotoPage(last)
        console.log('[PdfViewport] gotoPage completed')
      } catch (e) {
        console.error('[PdfViewport] gotoPage failed:', e)
      }
    }
  },
)

function clearSearchResults() {
  searchMatches.value = []
  searchActiveIndex.value = -1
  searchPageMap.value = {}
  searchPageIndex.value = {}
}

function closeSearch() {
  searchVisible.value = false
  searchTerm.value = ''
  searchError.value = null
  clearSearchResults()
  searchAnchor.value = null
}

function openSearch() {
  setSearchAnchor(true)
  if (searchVisible.value) {
    nextTick(() => {
      const el = searchInputEl.value
      if (el) {
        el.focus()
        el.select()
      }
    })
    return
  }
  searchVisible.value = true
  searchError.value = null
  clearSearchResults()
  nextTick(() => {
    searchInputEl.value?.focus()
    searchInputEl.value?.select()
  })
  scheduleSearch(true)
}

function toggleSearch() {
  if (searchVisible.value) {
    closeSearch()
  } else {
    openSearch()
  }
}

function scheduleSearch(immediate = false) {
  if (!searchVisible.value) return
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
  if (immediate) {
    runSearch()
    return
  }
  searchDebounceTimer = window.setTimeout(() => {
    searchDebounceTimer = null
    runSearch()
  }, 220)
}

async function runSearch() {
  const term = normalizeSearchString(searchTerm.value)
  const token = ++activeSearchToken
  if (!searchVisible.value) return
  if (!term) {
    clearSearchResults()
    searchError.value = null
    searchBusy.value = false
    return
  }
  searchBusy.value = true
  searchError.value = null
  try {
    const total = totalPages.value || 0
    const matches: SearchMatch[] = []
    const pageMap: Record<number, number[]> = {}
    for (let pageIndex = 0; pageIndex < total; pageIndex++) {
      if (token !== activeSearchToken) return
      const content = await media.getPageTextContent(pageIndex)
      if (token !== activeSearchToken) return
      const { normalized, map } = buildNormalizedPageData(pageIndex, content)
      if (!normalized || !map.length) continue
      let from = 0
      while (true) {
        const found = normalized.indexOf(term, from)
        if (found === -1) break
        const last = found + term.length - 1
        const startChar = map[found]
        const endChar = map[last]
        if (typeof startChar === 'number' && typeof endChar === 'number') {
          matches.push({
            pageIndex,
            startCharIndex: Math.min(startChar, endChar),
            endCharIndex: Math.max(startChar, endChar),
          })
        }
        from = found + 1
      }
      if (matches.length) {
        const indices: number[] = []
        for (let i = 0; i < matches.length; i++) {
          if (matches[i].pageIndex === pageIndex) indices.push(i)
        }
        if (indices.length) pageMap[pageIndex] = indices
      }
    }
    if (token !== activeSearchToken) return
    const prevActive = searchActiveIndex.value
    searchMatches.value = matches
    searchPageMap.value = pageMap
    const initialPageIndices: Record<number, number> = {}
    for (const key of Object.keys(pageMap)) {
      const page = Number(key)
      initialPageIndices[page] = 0
    }
    let newActive = prevActive >= 0 && prevActive < matches.length ? prevActive : -1
    const center = centerIndex.value
    const centerMatches = pageMap[center] || []
    if (centerMatches.length) {
      if (centerMatches.includes(newActive)) {
        initialPageIndices[center] = Math.max(0, centerMatches.indexOf(newActive))
      } else {
        newActive = centerMatches[0]
        initialPageIndices[center] = 0
      }
    }
    searchPageIndex.value = initialPageIndices
    searchActiveIndex.value = newActive
    searchError.value = null
  } finally {
    if (token === activeSearchToken) {
      searchBusy.value = false
    }
  }
}

async function focusMatchByIndex(index: number) {
  if (index < 0) return
  const match = searchMatches.value[index]
  if (!match) return
  searchActiveIndex.value = index
  if (match.pageIndex in searchPageMap.value) {
    const indices = searchPageMap.value[match.pageIndex]
    const local = indices.indexOf(index)
    if (local >= 0) searchPageIndex.value = { ...searchPageIndex.value, [match.pageIndex]: local }
  }
  await scrollToMatch(match)
}

function ensurePageElement(match: SearchMatch) {
  const root = scrollRootEl.value
  if (!root) return { root: null, pageEl: null, charEl: null }
  const pageEl = root.querySelector(`[data-pdf-page="${match.pageIndex}"]`) as HTMLElement | null
  const charEl = pageEl?.querySelector(`.text-char[data-char-index="${match.startCharIndex}"]`) as HTMLElement | null
  return { root, pageEl, charEl }
}

async function scrollToMatch(match: SearchMatch) {
  await gotoPage(match.pageIndex + 1)
  await nextTick()
  if (pendingScrollAnimation !== null) {
    cancelAnimationFrame(pendingScrollAnimation)
    pendingScrollAnimation = null
  }
  pendingScrollAnimation = requestAnimationFrame(() => {
    pendingScrollAnimation = null
    const { root, pageEl, charEl } = ensurePageElement(match)
    if (!root || !pageEl) return
    if (!charEl) {
      pageEl.scrollIntoView({ block: 'center' })
      return
    }
    const rootRect = root.getBoundingClientRect()
    const charRect = charEl.getBoundingClientRect()
    const offsetTop = charRect.top - rootRect.top
    const targetTop = root.scrollTop + offsetTop - root.clientHeight / 2 + charRect.height
    root.scrollTo({ top: Math.max(0, targetTop) })
  })
}

async function showNextMatch() {
  if (!searchMatches.value.length) return
  let next = searchActiveIndex.value
  if (next < 0) {
    const perPage = searchPageMap.value[centerIndex.value] || []
    if (perPage.length) {
      const local = (searchPageIndex.value[centerIndex.value] ?? 0) + 1
      const wrappedLocal = local % perPage.length
      searchPageIndex.value = { ...searchPageIndex.value, [centerIndex.value]: wrappedLocal }
      next = perPage[wrappedLocal]
    } else {
      next = 0
    }
  } else {
    next = (next + 1) % searchMatches.value.length
  }
  await focusMatchByIndex(next)
}

async function showPrevMatch() {
  if (!searchMatches.value.length) return
  const total = searchMatches.value.length
  let prev = searchActiveIndex.value
  if (prev < 0) {
    const perPage = searchPageMap.value[centerIndex.value] || []
    if (perPage.length) {
      const currentLocal = searchPageIndex.value[centerIndex.value] ?? 0
      const wrappedLocal = (currentLocal - 1 + perPage.length) % perPage.length
      searchPageIndex.value = { ...searchPageIndex.value, [centerIndex.value]: wrappedLocal }
      prev = perPage[wrappedLocal]
    } else {
      prev = total - 1
    }
  } else {
    prev = (prev - 1 + total) % total
  }
  await focusMatchByIndex(prev)
}

function isEditableElement(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  const editable = el.isContentEditable
  return editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function onGlobalKeyDown(e: KeyboardEvent) {
  const key = e.key?.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && key === 'f') {
    if (isEditableElement(e.target) && e.target !== searchInputEl.value) return
    e.preventDefault()
    toggleSearch()
    return
  }
  if (!searchVisible.value) return
  if (key === 'escape') {
    e.preventDefault()
    closeSearch()
    return
  }
  if (key === 'enter') {
    if (isEditableElement(e.target) && e.target !== searchInputEl.value) return
    e.preventDefault()
    if (e.shiftKey) showPrevMatch()
    else showNextMatch()
  }
}

function handleWindowResize() {
  if (!searchVisible.value) return
  setSearchAnchor(true)
}

function triggerInteraction() {
  isInteracting.value = true
  if (interactionTimer) clearTimeout(interactionTimer)
  // 使用設定中的延遲時間，0 表示立即顯示
  const delay = settings.s.textLayerRerenderDelayMs
  interactionTimer = window.setTimeout(() => {
    isInteracting.value = false
    interactionTimer = null
  }, delay)
}

const pageHighlightMap = computed(() => {
  const map = new Map<number, Array<{ start: number; end: number; active?: boolean }>>()
  const matches = searchMatches.value
  const active = searchActiveIndex.value
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const list = map.get(match.pageIndex) || []
    list.push({
      start: match.startCharIndex,
      end: match.endCharIndex,
      active: i === active,
    })
    map.set(match.pageIndex, list)
  }
  return map
})

function getPageHighlightRanges(idx: number) {
  return pageHighlightMap.value.get(idx) || []
}

const searchSummary = computed(() => {
  const term = searchTerm.value.trim()
  const total = searchMatches.value.length
  if (!term || total <= 0) return '0 / 0'
  if (searchActiveIndex.value >= 0) return `${searchActiveIndex.value + 1} / ${total}`
  const center = centerIndex.value
  const perPage = searchPageMap.value[center]
  if (perPage && perPage.length) {
    const localIdx = Math.max(0, Math.min(perPage.length - 1, searchPageIndex.value[center] ?? 0))
    const globalIdx = perPage[localIdx]
    if (typeof globalIdx === 'number') return `${globalIdx + 1} / ${total}`
  }
  return `0 / ${total}`
})

watch([() => media.descriptor?.path, currentPage], ([p, cp]) => {
  const d = media.descriptor
  if (!p || !d || d.type !== 'pdf') return
  if (typeof cp === 'number' && cp > 0) filelist.setLastPage(p, cp)
})

watch(searchTerm, () => {
  if (!searchVisible.value) return
  scheduleSearch()
})

watch(searchVisible, (visible) => {
  if (!visible) {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
    clearSearchResults()
    searchBusy.value = false
    searchError.value = null
    searchAnchor.value = null
  } else {
    setSearchAnchor(true)
    scheduleSearch(true)
  }
})

watch(docId, async () => {
  await nextTick()
  updateVisibleByScroll()
})

watch(
  () => media.descriptor?.path,
  () => {
    pageNormalizedCache.clear()
    closeSearch()
  },
)

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
  
  // 確保選單不超出視窗邊界
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  const estimatedMenuWidth = 200 // 估計選單寬度
  const estimatedMenuHeight = 240 // 估計選單高度
  
  let x = e.clientX
  let y = e.clientY
  
  // 檢查右側邊界
  if (viewportWidth > 0 && x + estimatedMenuWidth > viewportWidth - 12) {
    x = viewportWidth - estimatedMenuWidth - 12
  }
  
  // 檢查底部邊界
  if (viewportHeight > 0 && y + estimatedMenuHeight > viewportHeight - 12) {
    y = viewportHeight - estimatedMenuHeight - 12
  }
  
  // 確保不超出左上角
  x = Math.max(12, x)
  y = Math.max(12, y)
  
  menu.value = { open: true, x, y, pageIndex: idx, aboveHalf }
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

// Shift 鍵狀態：按下時反轉插入方向（前/後）
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
  // 讓使用者選擇 PDF 或圖片
  const picked = await openDialog({
    multiple: false,
    filters: [
      { name: 'PDF / 圖片', extensions: ['pdf','png','jpg','jpeg','webp','gif','bmp','tiff','tif'] },
    ],
  })
  if (!picked) return
  const path = Array.isArray(picked) ? picked[0] : picked
  const lower = path.toLowerCase()
  const insertIndex = Math.max(0, Math.min((d.pages || 0), before ? pageIndex : pageIndex + 1))

  // 快照：用於錯誤時回滾
  const oldPagesArr = media.pdfPages.slice()
  const oldDescriptor = { ...d }
  const oldSizes: Record<number, { widthPt: number; heightPt: number }> = { ...media.pageSizesPt }
  const oldCenter = centerIndex.value

  let inserted = 0
  let finalPages = d.pages || 0

  try {
    if (lower.endsWith('.pdf')) {
      // 先開啟來源 PDF 取得頁數，做「樂觀更新」讓 UI 立刻出現占位
      const src = await pdfOpen(path)
      inserted = src.pages

      // 前端陣列與尺寸索引位移 + 插入占位
      media.pdfPages.splice(insertIndex, 0, ...Array(inserted).fill(null))
      const shifted: Record<number, { widthPt: number; heightPt: number }> = {}
      for (const k of Object.keys(oldSizes)) {
        const idx = Number(k)
        const v = oldSizes[idx]
        if (idx < insertIndex) shifted[idx] = v
        else shifted[idx + inserted] = v
      }
      const def = insertDefaultDimsPt()
      for (let i = 0; i < inserted; i++) shifted[insertIndex + i] = def
      media.pageSizesPt = shifted as any
      media.descriptor = { ...d, pages: Math.max(0, (d.pages || 0) + inserted) } as any
      if (insertIndex <= oldCenter) centerIndex.value = oldCenter + inserted
      media.markDirty()
      pendingIdx.clear()
      for (let i = insertIndex; i < insertIndex + Math.min(inserted + 6, (media.descriptor?.pages || 0) - insertIndex); i++) pendingIdx.add(i)
      scheduleHiResRerender(0)

      // 實際複製頁面
      for (let i = 0; i < src.pages; i++) {
        const res = await pdfCopyPage({ srcDocId: src.docId, srcIndex: i, destDocId: id, destIndex: insertIndex + i })
        finalPages = res.pages
      }
      try { await pdfClose(src.docId) } catch {}
    } else {
      // 圖片：先「樂觀更新」插入 1 頁占位
      inserted = 1
      media.pdfPages.splice(insertIndex, 0, null)
      const shifted: Record<number, { widthPt: number; heightPt: number }> = {}
      for (const k of Object.keys(oldSizes)) {
        const idx = Number(k)
        const v = oldSizes[idx]
        if (idx < insertIndex) shifted[idx] = v
        else shifted[idx + inserted] = v
      }
      shifted[insertIndex] = insertDefaultDimsPt()
      media.pageSizesPt = shifted as any
      media.descriptor = { ...d, pages: Math.max(0, (d.pages || 0) + 1) } as any
      if (insertIndex <= oldCenter) centerIndex.value = oldCenter + 1
      media.markDirty()
      pendingIdx.clear()
      for (let i = insertIndex; i < insertIndex + Math.min(inserted + 6, (media.descriptor?.pages || 0) - insertIndex); i++) pendingIdx.add(i)
      scheduleHiResRerender(0)

      // 轉檔 + 複製
      const dir = await tempDir()
      const tempPath = await join(dir, `insert-${Date.now()}.pdf`)
      await imageToPdf({ srcPath: path, destPath: tempPath })
      const src = await pdfOpen(tempPath)
      const res = await pdfCopyPage({ srcDocId: src.docId, srcIndex: 0, destDocId: id, destIndex: insertIndex })
      finalPages = res.pages
      try { await pdfClose(src.docId) } catch {}
    }

    // 複製完成後，更新頁數並觸發重新渲染（確保尺寸同步）
    if (inserted > 0) {
      media.descriptor = { ...media.descriptor!, pages: finalPages } as any
      pendingIdx.clear()
      const tp = finalPages
      for (let i = insertIndex; i < Math.min(tp, insertIndex + inserted + 6); i++) pendingIdx.add(i)
      scheduleHiResRerender(0)
    }
  } catch (e: any) {
    // 回滾
    media.pdfPages = oldPagesArr as any
    media.pageSizesPt = oldSizes as any
    media.descriptor = oldDescriptor as any
    centerIndex.value = oldCenter
    alert(e?.message || String(e))
  }
}

async function rotatePlus90(pageIndex: number) {
  closeMenu()
  const d = media.descriptor
  const id = media.docId
  if (!d || d.type !== 'pdf' || id == null) return
  try {
    const delta = (shiftDown.value ? -90 : 90)
    await pdfRotatePageRelative({ docId: id, index: pageIndex, deltaDeg: delta })
    media.markDirty()
    try {
      media.cancelInflight(pageIndex)
    } catch {}
    media.pdfPages[pageIndex] = null
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

// DOM 虛擬化：只渲染視野附近的頁面內容，其他頁面只保留占位框
// 這會大幅減少 DOM 節點數量，提升記憶體與渲染效能
const mountedPages = computed(() => {
  const buffer = 2 // 前後各保留 2 頁的內容
  const s = visibleStart.value - buffer
  const e = visibleEnd.value + buffer
  const set = new Set<number>()
  const tp = totalPages.value || 0
  for (let i = s; i <= e; i++) {
    if (i >= 0 && i < tp) set.add(i)
  }
  return set
})

function shouldRenderPageContent(idx: number) {
  return mountedPages.value.has(idx)
}

let resizeObs: ResizeObserver | null = null
const scrollRootEl = ref<HTMLElement | null>(null)
let rafScheduled = false
const pendingIdx = new Set<number>()
const containerW = ref(0)
let hiResTimer: number | null = null
const pageCardSizes = ref<Record<number, { width: number; height: number }>>({})
const pendingCardSizeUpdates = new Map<number, { width: number; height: number }>()
let sizeFlushRaf: number | null = null
const pageCardObservers = new Map<number, ResizeObserver>()

function scheduleSizeFlush() {
  if (sizeFlushRaf != null) return
  if (typeof window === 'undefined' || !('requestAnimationFrame' in window)) {
    flushPendingSizes()
    return
  }
  sizeFlushRaf = window.requestAnimationFrame(() => {
    sizeFlushRaf = null
    flushPendingSizes()
  })
}

function flushPendingSizes() {
  if (!pendingCardSizeUpdates.size) return
  const next = { ...pageCardSizes.value }
  let changed = false
  for (const [idx, size] of pendingCardSizeUpdates) {
    const prev = next[idx]
    if (!prev || prev.width !== size.width || prev.height !== size.height) {
      next[idx] = size
      changed = true
    }
  }
  pendingCardSizeUpdates.clear()
  if (changed) pageCardSizes.value = next
}

function queuePageCardSize(idx: number, width: number, height: number) {
  const roundedWidth = Math.round(width * 100) / 100
  const roundedHeight = Math.round(height * 100) / 100
  const prev = pendingCardSizeUpdates.get(idx)
  if (prev && prev.width === roundedWidth && prev.height === roundedHeight) return
  pendingCardSizeUpdates.set(idx, { width: roundedWidth, height: roundedHeight })
  scheduleSizeFlush()
}

function deletePageCardSize(idx: number) {
  if (!(idx in pageCardSizes.value)) return
  const next = { ...pageCardSizes.value }
  delete next[idx]
  pageCardSizes.value = next
}

function registerPageCard(idx: number, el: HTMLElement | null) {
  const existing = pageCardObservers.get(idx)
  if (existing) {
    try { existing.disconnect() } catch (_) {}
    pageCardObservers.delete(idx)
  }
  if (el) {
    queuePageCardSize(idx, el.clientWidth, el.clientHeight)
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect
          queuePageCardSize(idx, width, height)
        }
      })
      observer.observe(el)
      pageCardObservers.set(idx, observer)
    }
  } else {
    deletePageCardSize(idx)
  }
}

const visibleStart = ref(0)
const visibleEnd = ref(0)
let scrollRaf: number | null = null
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
    // 即時預載：在捲動過程中，直接將 overscan 範圍加入待處理，提升預載體感
    for (let i = visibleStart.value; i <= visibleEnd.value; i++) {
      pendingIdx.add(i)
    }
    scheduleProcess()
  }
}

function onScroll() {
  triggerInteraction()
  if (scrollRaf !== null) return
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null
    updateVisibleByScroll()
    if (scrollEndTimer) clearTimeout(scrollEndTimer)
    const endMs = Math.max(0, Number(settings.s.scrollEndDebounceMs) || 0)
    scrollEndTimer = window.setTimeout(() => {
      centerIndex.value = displayPageIndex.value
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

// IntersectionObserver 已移除，改由 scroll + overscan 即時預載

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
  window.addEventListener('keydown', onGlobalKeyDown, { capture: true })
  window.addEventListener('resize', handleWindowResize)
  
  // 首次掛載時，檢查是否需要跳轉到 lastPage
  const p = media.descriptor?.path
  const d = media.descriptor
  if (p && d && d.type === 'pdf') {
    try { await filelist.whenReady() } catch {}
    const last = filelist.getLastPage(p)
    console.log('[PdfViewport] onMounted - last page from storage:', last)
    if (typeof last === 'number' && last >= 1) {
      // 等待 DOM 元素渲染
      await nextTick()
      const targetIdx = Math.min((d.pages || 1) - 1, Math.max(0, Math.floor(last) - 1))
      const el = scrollRootEl.value?.querySelector(`[data-pdf-page="${targetIdx}"]`)
      console.log('[PdfViewport] onMounted - target element exists:', !!el, 'targetIdx:', targetIdx)
      if (el) {
        try {
          console.log('[PdfViewport] onMounted - calling gotoPage:', last)
          await gotoPage(last)
          console.log('[PdfViewport] onMounted - gotoPage completed')
        } catch (e) {
          console.error('[PdfViewport] onMounted - gotoPage failed:', e)
        }
      }
    }
  }
  
  scrollRootEl.value?.addEventListener('scroll', onScroll, { passive: true })
  await nextTick()
  updateVisibleByScroll()
  if (scrollRootEl.value && 'ResizeObserver' in window) {
    let lastResizeWidth = 0
    let resizeDebounceTimer: number | null = null

    // Scrollbar 寬度通常在 15-17px 之間
    const SCROLLBAR_WIDTH_MIN = 14
    const SCROLLBAR_WIDTH_MAX = 18

    resizeObs = new ResizeObserver(() => {
      const w = scrollRootEl.value?.clientWidth || 0
      if (w <= 0) return

      const oldW = containerW.value
      const sizeDiff = Math.abs(w - oldW)

      // 過濾 Scrollbar 變動：如果寬度變化在 Scrollbar 寬度範圍內，忽略此次更新
      // 這可以防止 Scrollbar 出現/消失導致的無限迴圈
      if (oldW > 0 && sizeDiff >= SCROLLBAR_WIDTH_MIN && sizeDiff <= SCROLLBAR_WIDTH_MAX) {
        // 可能是 Scrollbar 變動，使用 debounce 延遲處理
        if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer)
        resizeDebounceTimer = window.setTimeout(() => {
          resizeDebounceTimer = null
          // 再次檢查寬度是否穩定
          const currentW = scrollRootEl.value?.clientWidth || 0
          if (currentW !== containerW.value && currentW > 0) {
            containerW.value = currentW
            scheduleUpdateFitPercent()
          }
        }, 100)
        return
      }

      if (oldW > 0 && w !== oldW) {
        const root = scrollRootEl.value
        const currentPageEl = root?.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement

        // 在實際大小模式下，保存水平和垂直滾動位置
        const isActualMode = viewMode.value === 'actual'
        const savedScrollLeft = root?.scrollLeft || 0
        const savedScrollTop = root?.scrollTop || 0

        containerW.value = w
        scheduleUpdateFitPercent()
        if (searchVisible.value) setSearchAnchor(true)

        nextTick(() => {
          requestAnimationFrame(() => {
            if (currentPageEl && root) {
              if (isActualMode) {
                // 實際大小模式：完全保持滾動位置不變（不使用 scrollIntoView）
                // 只在垂直方向微調，確保當前頁面仍在可見範圍內
                const elementTop = currentPageEl.offsetTop
                const elementHeight = currentPageEl.offsetHeight
                const containerHeight = root.clientHeight
                const currentScrollTop = root.scrollTop

                // 檢查當前頁面是否仍在視野中
                const isVisible =
                  elementTop < currentScrollTop + containerHeight &&
                  elementTop + elementHeight > currentScrollTop

                if (isVisible) {
                  // 頁面仍在視野中，完全保持滾動位置
                  root.scrollTop = savedScrollTop
                  root.scrollLeft = savedScrollLeft
                } else {
                  // 頁面不在視野中，調整垂直位置但保持水平不變
                  root.scrollTop = elementTop - containerHeight / 2 + elementHeight / 2
                  root.scrollLeft = savedScrollLeft
                }
              } else {
                // 符合寬度模式：手動置中，避免影響外層 body
                const offsetTop = currentPageEl.offsetTop
                const scrollTarget = offsetTop - (root.clientHeight / 2) + (currentPageEl.clientHeight / 2)
                root.scrollTop = scrollTarget
              }
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
        scheduleUpdateFitPercent()
        if (searchVisible.value) setSearchAnchor(true)
      }
    })
    resizeObs.observe(scrollRootEl.value)
  }
  // IntersectionObserver 移除後，預載由 updateVisibleByScroll + scheduleProcess 觸發
})

onBeforeUnmount(() => {
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  if (hiResTimer) clearTimeout(hiResTimer)
  if (fitTimer) clearTimeout(fitTimer)
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
  if (pendingScrollAnimation !== null) {
    cancelAnimationFrame(pendingScrollAnimation)
    pendingScrollAnimation = null
  }
  window.removeEventListener('keydown', onGlobalKeyDown, { capture: true })
  window.removeEventListener('resize', handleWindowResize)
  scrollRootEl.value?.removeEventListener('scroll', onScroll)
  for (const obs of pageCardObservers.values()) {
    try { obs.disconnect() } catch {
      /* noop */
    }
  }
  pageCardObservers.clear()
  pageCardSizes.value = {}
  pendingCardSizeUpdates.clear()
  if (sizeFlushRaf != null && typeof window !== 'undefined' && 'cancelAnimationFrame' in window) {
    window.cancelAnimationFrame(sizeFlushRaf)
    sizeFlushRaf = null
  }
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
  
  // Fit 模式的百分比 = (容器寬度 / PDF 原始寬度) × 100
  // 這表示：要讓 PDF 符合容器寬度，需要縮放到多少百分比
  if (cachedBase && cachedBase > 0) {
    displayFitPercent.value = Math.max(5, Math.min(400, Math.round((cW / cachedBase) * 100)))
    return
  }
  media.getPageSizePt(idx).then((sz) => {
    if (!sz) return
    const base = sz.widthPt * (96 / 72)  // PDF 原始寬度（96 DPI，即 100% 時的 CSS 寬度）
    if (base > 0) {
      displayFitPercent.value = Math.max(5, Math.min(400, Math.round((cW / base) * 100)))
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
  
  // 添加觸控板縮放支援
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
  if (interactionTimer) {
    clearTimeout(interactionTimer)
    interactionTimer = null
  }
})

/**
 * 滾輪縮放處理
 * 使用 useZoom 的 handleWheelZoom，區分游標位置：
 * - 在頁面卡片上：精準還原游標指向的點
 * - 在縫隙中：使用數學計算（類似 Google Maps）
 */
function handleWheelZoom(e: WheelEvent) {
  triggerInteraction()
  const ctx = createZoomContext()
  if (!ctx) return
  zoomHandleWheel(e, ctx, () => triggerRerender(300))
}

const shouldInvertColors = computed(() => settings.s.theme === 'dark' && settings.s.invertColorsInDarkMode)

function imgStyle(idx: number) {
  const styles: Record<string, string> = {}
  
  // 顏色反轉
  if (shouldInvertColors.value) {
    styles.filter = 'invert(1) hue-rotate(180deg)'
  }
  
  // 在 actual 模式下，設定圖片寬度以匹配卡片，避免閃爍
  if (viewMode.value === 'actual') {
    const base = media.baseCssWidthAt100(idx)
    if (base) {
      styles.width = `${Math.max(50, Math.round(base * (zoomTarget.value / 100)))}px`
    }
  }
  
  return Object.keys(styles).length > 0 ? styles : undefined
}

function pageCardStyle(idx: number) {
  const baseStyle: Record<string, string> = {
    // 限制瀏覽器的重排範圍，大幅減少 Reflow
    contain: 'layout paint style',
    // 使用 content-visibility 進一步優化（Tauri WebView 支援）
    contentVisibility: 'auto',
    containIntrinsicBlockSize: '1000px',
    // 確保內部的絕對定位元素以我為基準
    position: 'relative',
  }

  // 取得該頁面的原始尺寸資訊
  const size = media.pageSizesPt[idx]

  if (viewMode.value === 'fit') {
    // Fit 模式下，我們通常依賴 CSS 的寬度 (w-full)，但為了防止高度塌陷，
    // 我們可以用 aspect-ratio (現代瀏覽器支援度很好)
    if (size) {
      // 計算長寬比
      baseStyle.aspectRatio = `${size.widthPt} / ${size.heightPt}`
    }
    return baseStyle
  }

  // Actual 模式
  const base = media.baseCssWidthAt100(idx)
  if (base && size) {
    const scale = zoomTarget.value / 100
    const w = Math.max(50, Math.round(base * scale))
    // 關鍵修正：根據寬度和原始比例，算出精確的像素高度
    const ratio = size.heightPt / size.widthPt
    const h = Math.round(w * ratio)

    return {
      ...baseStyle,
      width: `${w}px`,
      height: `${h}px`, // 強制鎖定高度
      willChange: 'width, height'
    }
  }

  return baseStyle
}

// Get page dimensions and scale for text layer
function getPageTextLayerProps(idx: number) {
  const sizeInfo = media.pageSizesPt[idx]
  if (!sizeInfo) return null

  const baseCssWidth = media.baseCssWidthAt100(idx) || sizeInfo.widthPt * (96 / 72)

  let displayWidthPx: number | undefined
  let displayHeightPx: number | undefined

  if (viewMode.value === 'actual') {
    // 修正：在 actual 模式下直接計算目標尺寸，不等待 RO 測量
    // 解決縮放時文字層延遲更新的問題
    const targetWidth = baseCssWidth * (zoomTarget.value / 100)
    const w = Math.max(50, Math.round(targetWidth))
    displayWidthPx = w

    // 計算高度以保持與 pageCardStyle 一致的比例
    const aspect = sizeInfo.heightPt / Math.max(sizeInfo.widthPt, 0.001)
    displayHeightPx = Math.round(w * aspect)
  } else {
    // Fit 模式優先使用測量值
    const measured = pageCardSizes.value[idx]
    if (measured?.width && measured.width > 0) {
      displayWidthPx = measured.width
      displayHeightPx = measured.height
    } else {
      // Fallback：使用容器寬度
      const available = containerW.value ? Math.max(0, containerW.value - 48) : 0
      if (available > 0) {
        displayWidthPx = available
      } else {
        displayWidthPx = baseCssWidth
      }
      const aspect = sizeInfo.heightPt / Math.max(sizeInfo.widthPt, 0.001)
      displayHeightPx = displayWidthPx * aspect
    }
  }

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

/**
 * 效能優化：只為中心附近的頁面渲染文字層
 * 減少 DOM 節點數量，大幅提升滾動效能
 */
const TEXT_LAYER_RANGE = 1 // 中心頁面 ±1 頁
function shouldRenderTextLayer(idx: number): boolean {
  if (!settings.s.enableTextExtraction) return false
  // 搜尋時需要高亮，擴大範圍
  if (searchVisible.value && searchMatches.value.some(m => m.pageIndex === idx)) {
    return true
  }
  return Math.abs(idx - centerIndex.value) <= TEXT_LAYER_RANGE
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
  // 讓外層可呼叫跳轉頁數
  gotoPage,
  toggleSearch,
  openSearch,
  closeSearch,
  searchVisible,
})
</script>

<template>
  <div
    ref="scrollRootEl"
    class="flex-1 overflow-auto scrollbar-visible overscroll-y-contain bg-muted min-h-0"
    style="scrollbar-gutter: stable; will-change: scroll-position; overflow-anchor: none;"
  >
    <div v-if="!totalPages" class="p-4">尚未載入頁面</div>
    <div
      v-else
      :class="viewMode === 'fit' ? 'p-4 space-y-3' : 'p-4 space-y-3 inline-block min-w-full'"
    >
      <div class="w-full min-h-full pt-4 pb-10">
        <div
          v-for="idx in renderIndices"
          :key="idx"
          :class="viewMode === 'fit' ? 'w-full mb-10 flex justify-center' : 'mb-10 flex justify-center'"
          :style="viewMode === 'actual' ? { marginBottom: Math.round(40 * (zoomTarget / 100)) + 'px' } : undefined"
          :data-pdf-page="idx"
          @contextmenu.prevent="onPageContextMenu(idx, $event)"
        >
          <div :class="viewMode === 'fit' ? 'mx-auto px-6 max-w-none w-full' : 'px-6'">
            <div
              :class="['bg-card rounded-md shadow border border-border relative inline-block', viewMode === 'fit' ? 'overflow-hidden w-full' : 'overflow-visible']"
              :style="pageCardStyle(idx)"
              :ref="(el) => registerPageCard(idx, el as HTMLElement | null)"
            >
              <!-- DOM 虛擬化：只渲染視野附近頁面的實際內容 -->
              <template v-if="shouldRenderPageContent(idx)">
                <img
                  v-if="getPageDisplayUrl(idx)"
                  :src="getPageDisplayUrl(idx)"
                  :alt="`page-${idx}`"
                  :class="[
                    viewMode === 'fit' ? 'w-full block' : 'block',
                    'disable-live-text',
                  ]"
                  :style="imgStyle(idx)"
                  style="pointer-events: none;"
                  decoding="async"
                  loading="lazy"
                  draggable="false"
                />
                <canvas
                  v-else-if="isRawPage(idx)"
                  :class="[
                    viewMode === 'fit' ? 'w-full block' : 'block',
                    'disable-live-text',
                  ]"
                  :style="imgStyle(idx)"
                  style="pointer-events: none;"
                  :data-raw-page="idx"
                  :ref="(el: any) => drawRawInto(el as HTMLCanvasElement | null, idx)"
                />
                <div v-else class="w-full aspect-[1/1.414] bg-muted animate-pulse"></div>

                <!-- Text selection layer (只渲染中心附近頁面以優化效能) -->
                <div
                  v-if="docId != null && shouldRenderTextLayer(idx)"
                  class="absolute inset-0 pointer-events-none"
                  :style="{
                    zIndex: 1,
                    opacity: (settings.s.hideTextLayerWhileInteracting && isInteracting) ? 0 : 1,
                    transition: 'opacity 0.12s ease-out',
                  }"
                >
                  <PdfTextLayer
                    v-for="layerProps in getPageTextLayerPropsList(idx)"
                    :key="`text-layer-${idx}`"
                    :doc-id="docId"
                    :page-index="idx"
                    v-bind="layerProps"
                    style="pointer-events: auto;"
                  />
                </div>
              </template>
              <!-- 未掛載的頁面：空白占位，保持高度 -->
              <div v-else class="w-full aspect-[1/1.414] bg-muted/30"></div>
            </div>
            <div class="mt-3 text-xs text-[hsl(var(--muted-foreground))] text-center">第 {{ idx + 1 }} 頁</div>
          </div>
        </div>
      </div>
    </div>
    <teleport to="body">
      <div
        v-if="searchVisible"
        class="fixed z-[2100] flex items-center gap-2 bg-card/95 backdrop-blur border border-border rounded-md shadow px-3 py-2 text-sm"
        role="search"
        :style="searchPanelStyle"
      >
        <input
          ref="searchInputEl"
          v-model="searchTerm"
          type="text"
          placeholder="搜尋..."
          class="px-2 py-1 rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary/60 bg-background text-foreground flex-1 min-w-0"
          style="width: 0;"
        />
        <span class="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 min-w-[48px] text-center">
          <template v-if="searchBusy">搜尋中</template>
          <template v-else-if="searchError">無</template>
          <template v-else>{{ searchSummary }}</template>
        </span>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button
            class="px-2 py-1 rounded border border-transparent hover:bg-hover disabled:opacity-40 flex-shrink-0"
            type="button"
            :disabled="!searchMatches.length || searchBusy"
            @click="showPrevMatch"
            title="上一個 (Shift+Enter)"
          >
            ↑
          </button>
          <button
            class="px-2 py-1 rounded border border-transparent hover:bg-hover disabled:opacity-40 flex-shrink-0"
            type="button"
            :disabled="!searchMatches.length || searchBusy"
            @click="showNextMatch"
            title="下一個 (Enter)"
          >
            ↓
          </button>
        </div>
        <button
          class="px-2 py-1 rounded border border-transparent hover:bg-hover text-muted-foreground flex-shrink-0"
          type="button"
          @click="closeSearch"
          title="關閉 (Esc)"
        >
          ✕
        </button>
      </div>
    </teleport>
    <teleport to="body">
      <div
        v-if="menu.open"
        data-context-menu
        class="fixed z-[2000] bg-card border border-border rounded shadow text-sm w-max max-w-[calc(100vw-24px)]"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      >
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="deletePageFromMenu(menu.pageIndex)">
          刪除此頁
        </button>
        <div class="border-t border-border my-1"></div>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="insertBlankQuick(menu.pageIndex)">
          插入空白頁（{{ (menu.aboveHalf !== shiftDown) ? '之前' : '之後' }}）
        </button>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="insertFileQuick(menu.pageIndex)">
          插入檔案（{{ (menu.aboveHalf !== shiftDown) ? '之前' : '之後' }}）
        </button>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="rotatePlus90(menu.pageIndex)">
          旋轉 {{ shiftDown ? '-90°' : '+90°' }}
        </button>
        <div class="border-t border-border my-1"></div>
        <button
          class="w-full text-left px-3 py-2 hover:bg-hover flex items-center justify-between gap-4 whitespace-nowrap overflow-hidden"
          @pointerenter="(ev: any) => { cancelExportClose(); const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); exportMenu.x = Math.round(r.right + 2); exportMenu.y = Math.round(r.top); exportMenu.open = true }"
          @pointerleave="() => scheduleExportClose(180)"
        >
          <span class="overflow-hidden text-ellipsis">匯出</span>
          <span class="opacity-60 flex-shrink-0">▸</span>
        </button>
      </div>
    </teleport>
    <teleport to="body">
      <div
        v-if="exportMenu.open"
        data-export-submenu
        class="fixed z-[2010] bg-card border border-border rounded shadow text-sm w-max max-w-[calc(100vw-24px)]"
        :style="{ left: exportMenu.x + 'px', top: exportMenu.y + 'px' }"
        @pointerenter="cancelExportClose"
        @pointerleave="() => scheduleExportClose(120)"
      >
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="exportPageAsImage(menu.pageIndex)">
          圖片…
        </button>
        <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="exportPageAsPdf(menu.pageIndex)">
          PDF…
        </button>
      </div>
    </teleport>
  </div>
</template>
