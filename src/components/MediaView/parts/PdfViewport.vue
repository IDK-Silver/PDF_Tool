<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import { tempDir, join } from '@tauri-apps/api/path'

import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import { useExportSettings } from '@/modules/export/settings'
import { useZoom, type ZoomContext } from '@/modules/media/useZoom'
import type { PageTextContent } from '@/modules/media/types'

import PdfTextLayer from './PdfTextLayer.vue'

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
const isLayoutResizing = ref(false)

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

function normalizeSearchString(value: string) {
  return value.replace(/\s+/g, '').toLowerCase()
}

function buildNormalizedPageData(pageIndex: number, content: PageTextContent | null) {
  if (!content) return { normalized: '', map: [] as number[] }

  // 使用 toRaw 獲取原始物件，避免 Vue Proxy 問題
  const rawContent = toRaw(content)

  const cached = pageNormalizedCache.get(pageIndex)
  if (cached && cached.source === rawContent) return cached

  const normalizedParts: string[] = []
  const indexMap: number[] = []
  let charIndex = 0

  // 確保 spans 是原始陣列，避免 Proxy 迭代問題
  const spans = toRaw(rawContent.spans) || []

  for (const span of spans) {
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
  const data = { normalized: normalizedParts.join(''), map: indexMap, source: rawContent }
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
  if (viewMode.value === 'fit') return
  const ctx = createZoomContext()
  await setFitMode(ctx, { type: 'viewport-center' })
  triggerRerender(300)

  // 多次嘗試置中，確保在 Fit 模式計算完成後置中
  const idx = displayPageIndex.value
  centerPageHorizontally(idx)
  requestAnimationFrame(() => {
    centerPageHorizontally(idx)
  })
  setTimeout(() => {
    centerPageHorizontally(idx)
  }, 100)
  setTimeout(() => {
    centerPageHorizontally(idx)
  }, 300)
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

  const tryScroll = async (retries = 5) => {
    const el = root.querySelector(`[data-pdf-page="${idx}"]`) as HTMLElement | null

    if (el) {
      const cardEl = el.querySelector('.bg-card') as HTMLElement | null

      // 若 Card 還沒渲染出來，繼續重試
      if (!cardEl && retries > 0) {
        requestAnimationFrame(() => tryScroll(retries - 1))
        return
      }

      const targetEl = cardEl || el
      const elTop = targetEl.offsetTop
      const elHeight = targetEl.offsetHeight
      const elWidth = targetEl.offsetWidth
      const containerHeight = root.clientHeight

      // 安全檢查：尺寸異常小代表 CSS 未載入，重試
      if ((elHeight < 10 || elWidth < 10) && retries > 0) {
        requestAnimationFrame(() => tryScroll(retries - 1))
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

      // [水平修正核心] 多段式確保置中，處理各種非同步佈局情況
      // 1. 立即嘗試置中
      centerPageHorizontally(idx)

      // 2. AnimationFrame: 等待渲染層更新
      requestAnimationFrame(() => {
        centerPageHorizontally(idx)
      })

      // 3. setTimeout 50ms: [關鍵] 等待 Scrollbar 出現導致的 Layout Shift 穩定
      setTimeout(() => {
        centerPageHorizontally(idx)
      }, 50)

      // 4. setTimeout 150ms: 確保在 Fit 模式計算完成後再次置中
      setTimeout(() => {
        centerPageHorizontally(idx)
      }, 150)

    } else if (retries > 0) {
      requestAnimationFrame(() => tryScroll(retries - 1))
    }
  }

  tryScroll()
}

watch(
  () => media.descriptor?.path,
  async (p) => {
    const d = media.descriptor
    if (!p || !d || d.type !== 'pdf') return

    displayPageIndex.value = 0
    centerIndex.value = 0

    try { await filelist.whenReady() } catch { }
    const last = filelist.getLastPage(p)

    if (typeof last === 'number' && last >= 1) {
      // 1. 等待 PDF 載入完成
      await new Promise<void>((resolve) => {
        const checkLoading = () => {
          if (!media.loading) resolve()
          else requestAnimationFrame(checkLoading)
        }
        checkLoading()
      })

      const targetIdx = Math.min((d.pages || 1) - 1, Math.max(0, Math.floor(last) - 1))

      // 2. 預載目標頁面尺寸（提前優化，gotoPage 內部也會確保所有需要的頁面尺寸都載入）
      try {
        await media.getPageSizePt(targetIdx)
      } catch (e) {
        console.warn('[PdfViewport] Failed to preload page size:', e)
      }

      // 3. 等待 Layout 準備
      await waitForLayout()

      // 4. 等待 DOM 元素渲染
      await new Promise<void>((resolve) => {
        displayPageIndex.value = targetIdx
        centerIndex.value = targetIdx
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

      // 5. 跳轉到目標頁面
      try {
        await gotoPage(last)
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
  void primeTextLayerForPage(displayPageIndex.value)
})

watch(
  () => media.descriptor?.path,
  () => {
    pageNormalizedCache.clear()
    closeSearch()
    lastSelection.value = null
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
    } catch { }
    try {
      media.cancelInflight(pageIndex)
    } catch { }
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

  let inserted = 0
  let finalPages = d.pages || 0

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
      const def = insertDefaultDimsPt()
      for (let i = 0; i < inserted; i++) shifted[insertIndex + i] = def
      media.pageSizesPt = shifted as any
      media.descriptor = { ...d, pages: Math.max(0, (d.pages || 0) + inserted) } as any
      if (insertIndex <= oldCenter) centerIndex.value = oldCenter + inserted
      media.markDirty()
      pendingIdx.clear()
      for (let i = insertIndex; i < insertIndex + Math.min(inserted + 6, (media.descriptor?.pages || 0) - insertIndex); i++) pendingIdx.add(i)
      scheduleHiResRerender(0)

      for (let i = 0; i < src.pages; i++) {
        const res = await pdfCopyPage({ srcDocId: src.docId, srcIndex: i, destDocId: id, destIndex: insertIndex + i })
        finalPages = res.pages
      }
      try { await pdfClose(src.docId) } catch { }
    } else {
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

      const dir = await tempDir()
      const tempPath = await join(dir, `insert-${Date.now()}.pdf`)
      await imageToPdf({ srcPath: path, destPath: tempPath })
      const src = await pdfOpen(tempPath)
      const res = await pdfCopyPage({ srcDocId: src.docId, srcIndex: 0, destDocId: id, destIndex: insertIndex })
      finalPages = res.pages
      try { await pdfClose(src.docId) } catch { }
    }

    if (inserted > 0) {
      media.descriptor = { ...media.descriptor!, pages: finalPages } as any
      pendingIdx.clear()
      const tp = finalPages
      for (let i = insertIndex; i < Math.min(tp, insertIndex + inserted + 6); i++) pendingIdx.add(i)
      scheduleHiResRerender(0)
    }
  } catch (e: any) {
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
    } catch { }
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
const scrollRootEl = ref<HTMLElement | null>(null)
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

function centerPageHorizontally(idx: number) {
  const root = scrollRootEl.value
  if (!root || idx < 0) return
  const pageEl = root.querySelector(`[data-pdf-page="${idx}"]`) as HTMLElement | null
  const cardEl = pageEl?.querySelector('.bg-card') as HTMLElement | null
  if (!cardEl) return
  const rootRect = root.getBoundingClientRect()
  const cardRect = cardEl.getBoundingClientRect()
  const cardLeftInContent = cardRect.left - rootRect.left + root.scrollLeft
  const targetScrollLeft = cardLeftInContent - Math.max(0, (root.clientWidth - cardEl.offsetWidth) / 2)
  root.scrollLeft = Math.max(0, targetScrollLeft)
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

  // 初始計算 Fit
  scheduleUpdateFitPercent()

  const p = media.descriptor?.path
  const d = media.descriptor
  if (p && d && d.type === 'pdf') {
    try { await filelist.whenReady() } catch { }
    const last = filelist.getLastPage(p)
    console.log('[PdfViewport] onMounted - last page from storage:', last)

    if (typeof last === 'number' && last >= 1) {
      const targetIdx = Math.min((d.pages || 1) - 1, Math.max(0, Math.floor(last) - 1))

      // [新增] 同樣預載目標頁面尺寸
      try {
        await media.getPageSizePt(targetIdx)
      } catch (e) {
        console.warn('[PdfViewport] onMounted - Failed to preload page size:', e)
      }

      // [Fix] 即使是 onMounted，也要確保 Layout 準備好
      await waitForLayout()

      // 設定 index 觸發虛擬渲染
      displayPageIndex.value = targetIdx
      centerIndex.value = targetIdx

      await nextTick()

      // 簡單的 retry 機制
      const attemptScroll = async (retries = 0) => {
        const el = scrollRootEl.value?.querySelector(`[data-pdf-page="${targetIdx}"]`)
        if (el) {
          await gotoPage(last)
        } else if (retries < 20) {
          // 增加重試次數
          requestAnimationFrame(() => attemptScroll(retries + 1))
        }
      }
      attemptScroll()
    }
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
            // [關鍵] 當容器寬度改變時，若在 Fit 模式，立即更新 FitPercent
            // 這樣 currentRenderingZoom 會立刻反應，文字層與圖片層會同步縮放
            updateFitPercent()
            // [修復] Scrollbar 出現/消失時也需要重新置中
            requestAnimationFrame(() => {
              centerPageHorizontally(centerIndex.value)
            })
          }
        }, 100)
        return
      }

      if (oldW > 0 && w !== oldW) {
        const root = scrollRootEl.value
        const currentPageEl = root?.querySelector(`[data-pdf-page="${centerIndex.value}"]`) as HTMLElement
        const savedScrollTop = root?.scrollTop || 0

        containerW.value = w
        updateFitPercent() // [關鍵] 立即同步

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

              // [修復] 容器寬度變化後重新計算水平置中
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
        updateFitPercent()
        if (searchVisible.value) setSearchAnchor(true)

        // [修復] 初次載入時也需要置中
        if (oldW === 0 && w > 0) {
          nextTick(() => {
            requestAnimationFrame(() => {
              centerPageHorizontally(centerIndex.value)
            })
            setTimeout(() => {
              centerPageHorizontally(centerIndex.value)
            }, 100)
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

    // [修復] 模式切換後多次嘗試置中，確保佈局完全穩定後置中
    centerPageHorizontally(lockedPage)
    requestAnimationFrame(() => {
      centerPageHorizontally(lockedPage)
    })
    setTimeout(() => {
      centerPageHorizontally(lockedPage)
    }, 50)
  }, 200)
})

let fitTimer: number | null = null
async function updateFitPercent() {
  const d = media.descriptor
  if (!d || d.type !== 'pdf') return
  const cW = containerW.value || 800
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
watch([centerIndex, () => settings.s.maxOutputWidth, () => settings.s.dprCap], () => {
  scheduleUpdateFitPercent()
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

const shouldInvertColors = computed(() => settings.s.theme === 'dark' && settings.s.invertColorsInDarkMode)

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
  <div
    ref="scrollRootEl"
    class="flex-1 scrollbar-visible overscroll-y-contain bg-muted min-h-0"
    :style="{
      'will-change': 'scroll-position',
      'overflow-anchor': 'none',
      '--zoom-factor': currentRenderingZoom / 100,
      'overflow-x': viewMode === 'fit' ? 'hidden' : 'auto',
      'overflow-y': 'scroll'
    }"
  >
    <div v-if="!totalPages" class="p-4">尚未載入頁面</div>
    <div v-else class="flex flex-col items-center min-w-full w-fit py-10 px-4 space-y-3">
      <div
        v-for="idx in renderIndices"
        :key="idx"
        class="flex justify-center"
        :style="{ marginBottom: 'calc(32px * var(--zoom-factor))' }"
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
            <div class="mt-3 text-xs text-[hsl(var(--muted-foreground))] text-center">第 {{ idx + 1 }} 頁</div>
          </div>
        </template>
        <div v-else :class="viewMode === 'fit' ? 'px-6 max-w-none' : 'px-6'">
          <div :style="pageCardStyle(idx)"></div>
          <div style="height: 28px"></div>
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
