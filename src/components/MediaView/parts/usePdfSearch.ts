import { computed, nextTick, onBeforeUnmount, ref, toRaw, watch, type ComputedRef, type Ref } from 'vue'
import type { PageTextContent } from '@/modules/media/types'

type PdfSearchMedia = {
  descriptor: { path?: string | null } | null
  getPageTextContent: (pageIndex: number) => Promise<PageTextContent | null>
}

type PdfSearchOptions = {
  media: PdfSearchMedia
  scrollRootEl: Ref<HTMLElement | null>
  centerIndex: Ref<number>
  totalPages: ComputedRef<number>
  gotoPage: (page: number) => Promise<void>
  getSearchInputEl: () => HTMLInputElement | null
  focusSearchInput: () => void
}

type SearchMatch = {
  pageIndex: number
  startCharIndex: number
  endCharIndex: number
}

export function usePdfSearch(options: PdfSearchOptions) {
  const {
    media,
    scrollRootEl,
    centerIndex,
    totalPages,
    gotoPage,
    getSearchInputEl,
    focusSearchInput,
  } = options

  const searchVisible = ref(false)
  const searchTerm = ref('')
  const searchMatches = ref<SearchMatch[]>([])
  const searchActiveIndex = ref(-1)
  const searchPageMap = ref<Record<number, number[]>>({})
  const searchPageIndex = ref<Record<number, number>>({})
  const searchBusy = ref(false)
  const searchError = ref<string | null>(null)
  let searchDebounceTimer: number | null = null
  let activeSearchToken = 0
  const pageNormalizedCache = new Map<number, { normalized: string; map: number[]; source: PageTextContent }>()
  let pendingScrollAnimation: number | null = null
  const searchAnchor = ref<{ top: number; left: number; width: number } | null>(null)
  const SEARCH_PANEL_MIN_WIDTH = 240
  const SEARCH_PANEL_MAX_WIDTH = 360
  const SEARCH_PANEL_MARGIN = 12

  function normalizeSearchString(value: string) {
    return value.replace(/\s+/g, '').toLowerCase()
  }

  function buildNormalizedPageData(pageIndex: number, content: PageTextContent | null) {
    if (!content) return { normalized: '', map: [] as number[] }

    const rawContent = toRaw(content)
    const cached = pageNormalizedCache.get(pageIndex)
    if (cached && cached.source === rawContent) return cached

    const normalizedParts: string[] = []
    const indexMap: number[] = []
    let charIndex = 0
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
    let panelWidth = Math.min(
      SEARCH_PANEL_MAX_WIDTH,
      Math.max(SEARCH_PANEL_MIN_WIDTH, Math.min(availableViewportWidth, availableRootWidth))
    )
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
    let panelWidth = Math.min(
      SEARCH_PANEL_MAX_WIDTH,
      Math.max(SEARCH_PANEL_MIN_WIDTH, Math.min(availableViewportWidth, availableRootWidth))
    )
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
        focusSearchInput()
      })
      return
    }
    searchVisible.value = true
    searchError.value = null
    clearSearchResults()
    nextTick(() => {
      focusSearchInput()
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

  function findSpanForChar(pageEl: HTMLElement, charIndex: number): HTMLElement | null {
    const spans = pageEl.querySelectorAll('.text-span[data-char-start][data-char-end]') as NodeListOf<HTMLElement>
    for (const span of spans) {
      const start = Number(span.dataset.charStart)
      const end = Number(span.dataset.charEnd)
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue
      if (charIndex >= start && charIndex <= end) return span
    }
    return null
  }

  function ensurePageElement(match: SearchMatch) {
    const root = scrollRootEl.value
    if (!root) return { root: null, pageEl: null, charEl: null }
    const pageEl = root.querySelector(`[data-pdf-page="${match.pageIndex}"]`) as HTMLElement | null
    const charEl = pageEl ? findSpanForChar(pageEl, match.startCharIndex) : null
    return { root, pageEl, charEl }
  }

  async function scrollToMatch(match: SearchMatch) {
    if (pendingScrollAnimation !== null) {
      cancelAnimationFrame(pendingScrollAnimation)
      pendingScrollAnimation = null
    }
    const root = scrollRootEl.value
    const directPageEl = root?.querySelector(`[data-pdf-page="${match.pageIndex}"]`) as HTMLElement | null
    const canDirectScroll = !!(root && directPageEl)

    if (!canDirectScroll) {
      await gotoPage(match.pageIndex + 1)
      await nextTick()
    }

    pendingScrollAnimation = requestAnimationFrame(() => {
      pendingScrollAnimation = null
      const { root, pageEl, charEl } = ensurePageElement(match)
      if (!root || !pageEl) return
      const rootRect = root.getBoundingClientRect()
      if (!charEl) {
        const pageRect = pageEl.getBoundingClientRect()
        const isVisible = pageRect.bottom >= rootRect.top && pageRect.top <= rootRect.bottom
        if (!isVisible) pageEl.scrollIntoView({ block: 'center' })
        return
      }
      const charRect = charEl.getBoundingClientRect()
      const isVisible = charRect.top >= rootRect.top && charRect.bottom <= rootRect.bottom
      if (isVisible) return
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
    const inputEl = getSearchInputEl()
    if ((e.ctrlKey || e.metaKey) && key === 'f') {
      if (isEditableElement(e.target) && e.target !== inputEl) return
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
      if (isEditableElement(e.target) && e.target !== inputEl) return
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

  watch(
    () => media.descriptor?.path,
    () => {
      pageNormalizedCache.clear()
      closeSearch()
    },
  )

  onBeforeUnmount(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
    if (pendingScrollAnimation !== null) {
      cancelAnimationFrame(pendingScrollAnimation)
      pendingScrollAnimation = null
    }
    pageNormalizedCache.clear()
  })

  return {
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
  }
}
