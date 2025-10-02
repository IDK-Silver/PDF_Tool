import { nextTick, ref, watch, type Ref } from 'vue'
import type { PDFDocumentProxy } from '../../lib/pdfjs'
import type { PdfFile } from '../../types/pdf'
import type { AppSettings } from '../persistence'
import { createSearchData, findAllOccurrences } from '../../utils/searchText'

type SearchStateSnapshot = {
  open: boolean
  query: string
  index: number
}

type UpdateOptions = { keepIndex?: boolean }

type PdfSearchOptions = {
  viewerRef: Ref<any>
  pdfDoc: Ref<any>
  pageCount: Ref<number>
  isPdfFile: Ref<boolean>
  activeFileRef: Ref<PdfFile | null>
  scale?: Ref<number>
  settings?: Ref<AppSettings>
}

export function usePdfSearch(options: PdfSearchOptions) {
  const searchOpen = ref(false)
  const searchQuery = ref('')
  const searchTotal = ref<number | null>(null)
  const searchIndex = ref(0)
  const searchInputRef = ref<HTMLInputElement | null>(null)
  const searchStateByPath = ref(new Map<string, SearchStateSnapshot>())

  const searchPageMatches = ref<Array<{ pageIndex: number; count: number }>>([])
  const pageTextCache = new Map<number, string>()

  let searchComputeToken = 0

  function resetRuntime() {
    searchComputeToken += 1
    searchPageMatches.value = []
    searchTotal.value = null
    try { options.viewerRef.value?.clearFindHighlights?.() } catch {}
  }

  function clearCaches() {
    pageTextCache.clear()
    resetRuntime()
  }

  function persistSearchStateFor(path: string | null | undefined) {
    if (!path) return
    const snapshot: SearchStateSnapshot = {
      open: searchOpen.value,
      query: searchQuery.value,
      index: searchIndex.value,
    }
    searchStateByPath.value.set(path, snapshot)
  }

  function persistCurrentSearchState() {
    if (!options.isPdfFile.value) return
    persistSearchStateFor(options.activeFileRef.value?.path ?? null)
  }

  function applySearchStateFor(path: string | null, isPdf: boolean) {
    resetRuntime()
    if (!path || !isPdf) {
      searchOpen.value = false
      searchQuery.value = ''
      searchIndex.value = 0
      return
    }
    const stored = searchStateByPath.value.get(path) || null
    searchOpen.value = stored?.open ?? false
    searchQuery.value = stored?.query ?? ''
    searchIndex.value = stored?.index ?? 0
    persistCurrentSearchState()
  }

  async function getPageText(idx: number): Promise<string> {
    if (pageTextCache.has(idx)) return pageTextCache.get(idx) as string
    const doc = options.pdfDoc.value as PDFDocumentProxy | null
    if (!doc) return ''
    try {
      const page = await doc.getPage(idx + 1)
      const tc = await page.getTextContent()
      const text = tc.items.map((it: any) => (it?.str ?? '')).join(' ')
      pageTextCache.set(idx, text)
      return text
    } catch {
      return ''
    }
  }

  function countOccurrences(hay: string, needle: string): number {
    const { hayText, needleText } = createSearchData(hay, needle, false, true)
    if (!needleText) return 0
    return findAllOccurrences(hayText, needleText).length
  }

  function mapGlobalIndex(index: number) {
    if (!searchPageMatches.value.length) return null
    let offset = 0
    for (const entry of searchPageMatches.value) {
      if (index < offset + entry.count) {
        return { pageIndex: entry.pageIndex, matchIndex: index - offset }
      }
      offset += entry.count
    }
    return null
  }

  async function highlightCurrentMatch(expectedToken?: number, attempt = 0): Promise<void> {
    const viewer = options.viewerRef.value
    if (!viewer?.highlightInPage) return
    const q = searchQuery.value.trim()
    const total = searchTotal.value ?? 0
    if (!q || !total) {
      try { viewer.clearFindHighlights?.() } catch {}
      return
    }
    if (expectedToken != null && expectedToken !== searchComputeToken) return
    const mapping = mapGlobalIndex(Math.min(searchIndex.value, Math.max(0, total - 1)))
    if (!mapping) return
    viewer.scrollToPage?.(mapping.pageIndex + 1)
    await nextTick(); await nextTick()
    if (expectedToken != null && expectedToken !== searchComputeToken) return
    try {
      const result = await viewer.highlightInPage(mapping.pageIndex, q, { activeIndex: mapping.matchIndex })
      const success = result && Number.isFinite(result.total) && (result.total as number) > 0
      const retryDelaySetting = Number(options.settings?.value?.searchHighlightRetryDelayMs ?? 80)
      const retryDelay = Number.isFinite(retryDelaySetting) ? Math.max(0, retryDelaySetting) : 80
      const retryCountSetting = Number(options.settings?.value?.searchHighlightRetryCount ?? 4)
      const retryLimit = Number.isFinite(retryCountSetting) ? Math.max(0, Math.round(retryCountSetting)) : 4
      if (!success && attempt < retryLimit) {
        if (retryDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
        } else {
          await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
        }
        if (expectedToken != null && expectedToken !== searchComputeToken) return
        await highlightCurrentMatch(expectedToken, attempt + 1)
      }
    } catch (error) {
      console.error('[PdfSearch] highlight failed', error)
    }
  }

  async function updateSearchMatches(updateOpts: UpdateOptions = {}) {
    const keepIndex = !!updateOpts.keepIndex
    const q = searchQuery.value.trim()
    const totalPages = options.pageCount.value
    const viewer = options.viewerRef.value
    const token = ++searchComputeToken

    if (!q || !totalPages || !options.isPdfFile.value) {
      searchPageMatches.value = []
      searchTotal.value = q ? 0 : null
      if (!keepIndex) searchIndex.value = 0
      try { viewer?.clearFindHighlights?.() } catch {}
      persistCurrentSearchState()
      return
    }

    const entries: Array<{ pageIndex: number; count: number }> = []
    let total = 0
    // Robust count that doesn't rely on textLayer readiness: use getTextContent() + normalization
    for (let i = 0; i < totalPages; i++) {
      const txt = await getPageText(i)
      if (token !== searchComputeToken) return
      const count = countOccurrences(txt, q)
      if (count > 0) entries.push({ pageIndex: i, count })
      total += Math.max(0, count)
      // Incrementally update total for better UX on large docs
      searchTotal.value = total
    }
    if (token !== searchComputeToken) return

    searchPageMatches.value = entries
    searchTotal.value = total

    if (!total) {
      if (!keepIndex) searchIndex.value = 0
      try { viewer?.clearFindHighlights?.() } catch {}
      persistCurrentSearchState()
      return
    }

    if (!keepIndex || searchIndex.value >= total) searchIndex.value = 0
    if (!searchOpen.value && searchQuery.value.trim()) {
      searchOpen.value = true
    }
    await highlightCurrentMatch(token)
    persistCurrentSearchState()
  }

  function onSearchInput() {
    searchIndex.value = 0
    void updateSearchMatches()
  }

  async function findInDirection(dir: 1 | -1) {
    if (!options.isPdfFile.value) return
    const q = searchQuery.value.trim()
    if (!q) return
    if (searchTotal.value == null) await updateSearchMatches({ keepIndex: false })
    const total = searchTotal.value ?? 0
    if (!total) return
    searchIndex.value = (searchIndex.value + (dir === 1 ? 1 : -1) + total) % total
    await highlightCurrentMatch()
    persistCurrentSearchState()
  }

  async function onSearchEnter(event: KeyboardEvent) {
    await findInDirection(event.shiftKey ? -1 : 1)
  }

  function goToPrevMatch() {
    void findInDirection(-1)
  }

  function goToNextMatch() {
    void findInDirection(1)
  }

  function toggleSearch(open?: boolean) {
    if (!options.isPdfFile.value && (open ?? true)) return
    const next = open ?? !searchOpen.value
    searchOpen.value = next
    if (next) {
      nextTick(() => searchInputRef.value?.focus())
      if (searchQuery.value.trim()) void updateSearchMatches({ keepIndex: true })
    } else {
      resetRuntime()
    }
    persistCurrentSearchState()
  }

  async function handleScaleChange() {
    if (!options.isPdfFile.value) return
    if (!searchOpen.value) return
    if (!searchQuery.value.trim()) return
    await highlightCurrentMatch()
  }

  async function handleDocLoaded() {
    if (!options.isPdfFile.value) return
    if (!searchOpen.value) return
    if (!searchQuery.value.trim()) return
    await updateSearchMatches({ keepIndex: true })
  }

  if (options.scale) {
    watch(() => options.scale!.value, () => { void handleScaleChange() })
  }

  watch(() => options.isPdfFile.value, (isPdf) => {
    if (!isPdf) {
      resetRuntime()
      searchOpen.value = false
      searchQuery.value = ''
      searchIndex.value = 0
    }
  })

  return {
    searchOpen,
    searchQuery,
    searchTotal,
    searchIndex,
    searchInputRef,
    searchPageMatches,
    pageTextCache,
    toggleSearch,
    onSearchInput,
    onSearchEnter,
    goToPrevMatch,
    goToNextMatch,
    updateSearchMatches,
    highlightCurrentMatch,
    persistSearchStateFor,
    persistCurrentSearchState,
    applySearchStateFor,
    clearCaches,
    resetRuntime,
    handleScaleChange,
    handleDocLoaded,
  }
}
