import { nextTick } from 'vue'
import type { Ref } from 'vue'
import type { PageView } from './usePdfViewerEngine'
import { createSearchData, findAllOccurrences } from '../../utils/searchText'

type HighlightOptions = {
  pages: Ref<PageView[]>
  scrollToPageOffset: (pageNumber: number, offsetPx: number) => void
}

type HighlightResult = { total: number; active: number | null }

type HighlightConfig = { caseSensitive?: boolean; activeIndex?: number; countOnly?: boolean }

function makeHighlightDiv(x: number, y: number, w: number, h: number, current = false): HTMLDivElement {
  const div = document.createElement('div')
  div.className = current ? 'find-highlight-current' : 'find-highlight'
  Object.assign(div.style, {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${Math.max(1, w)}px`,
    height: `${Math.max(1, h)}px`,
    background: current ? 'rgba(255, 196, 0, 0.45)' : 'rgba(255, 235, 59, 0.28)',
    pointerEvents: 'none',
    borderRadius: '2px',
    border: current ? '2px solid rgba(255, 187, 0, 0.9)' : '1px solid rgba(255, 193, 7, 0.75)',
    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.2) inset',
  } as Partial<CSSStyleDeclaration>)
  return div
}

function collectTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let n: Node | null
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) {
    const t = n as Text
    if (t.nodeValue && t.nodeValue.length) nodes.push(t)
  }
  return nodes
}

async function waitForTextLayer(page: PageView): Promise<HTMLElement | null> {
  const host = page.inner || page.container
  if (!host) return null
  const tries = 8
  const delayMs = 50
  for (let i = 0; i < tries; i++) {
    const tl = host.querySelector('.textLayer') as HTMLElement | null
    if (tl) return tl
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return null
}

export function usePageHighlights(options: HighlightOptions) {
  function clearHighlights(pageIndex?: number) {
    try {
      const indices = Array.isArray(options.pages.value) ? options.pages.value.map((_, i) => i) : []
      const targets = pageIndex != null ? [pageIndex] : indices
      for (const idx of targets) {
        const page = options.pages.value[idx]
        const host = page?.inner || page?.container
        const overlay = host?.querySelector('.page-overlay') as HTMLElement | null
        if (!overlay) continue
        const existing = overlay.querySelectorAll('.find-highlight, .find-highlight-current')
        existing.forEach((el) => el.parentElement?.removeChild(el))
      }
    } catch {}
  }

  async function highlightInPage(pageIndex: number, query: string, cfg?: HighlightConfig): Promise<HighlightResult> {
    clearHighlights(pageIndex)
    const trimmed = (query || '').trim()
    if (!trimmed) return { total: 0, active: null }
    const pageView = options.pages.value[pageIndex]
    if (!pageView) return { total: 0, active: null }
    const host = pageView.inner || pageView.container
    const overlay = host?.querySelector('.page-overlay') as HTMLElement | null
    if (!host || !overlay) return { total: 0, active: null }
    const textLayer = await waitForTextLayer(pageView)
    if (!textLayer) return { total: 0, active: null }
    await nextTick()

    const caseSensitive = !!cfg?.caseSensitive
    const matches: Array<{ rects: Array<{ x: number; y: number; w: number; h: number }> }> = []
    const pageRect = (host as HTMLElement).getBoundingClientRect()

    const nodes = collectTextNodes(textLayer)
    const indexMap: Array<{ node: Text; start: number; end: number }> = []
    let accLen = 0
    for (const node of nodes) {
      const val = node.nodeValue || ''
      const start = accLen
      const end = start + val.length
      indexMap.push({ node, start, end })
      accLen = end
    }
    const fullText = nodes.map(n => n.nodeValue || '').join('')
    const { normalizedHay, hayText, needleText } = createSearchData(fullText, trimmed, caseSensitive, true)
    if (!needleText) return { total: 0, active: null }
    const hits = findAllOccurrences(hayText, needleText)
    for (const normStart of hits) {
      const normEnd = normStart + needleText.length
      const startOriginal = normalizedHay.map[normStart]
      const endOriginal = normEnd > 0
        ? ((normEnd - 1) < normalizedHay.map.length ? normalizedHay.map[normEnd - 1] + 1 : fullText.length)
        : (startOriginal ?? 0)
      if (startOriginal == null || endOriginal == null || endOriginal <= startOriginal) continue
      let si = 0
      while (si < indexMap.length && !(startOriginal >= indexMap[si].start && startOriginal < indexMap[si].end)) si++
      if (si >= indexMap.length) continue
      let ei = si
      while (ei < indexMap.length && endOriginal > indexMap[ei].end) ei++
      if (ei >= indexMap.length) ei = indexMap.length - 1
      const startRec = indexMap[si]
      const endRec = indexMap[ei]
      const startOffset = Math.max(0, startOriginal - startRec.start)
      const endOffset = Math.max(0, Math.min(endOriginal - endRec.start, endRec.end - endRec.start))
      try {
        const range = document.createRange()
        range.setStart(startRec.node, startOffset)
        range.setEnd(endRec.node, endOffset)
        const rects: Array<{ x: number; y: number; w: number; h: number }> = []
        const rectList = range.getClientRects()
        for (const r of Array.from(rectList)) {
          if (!r.width || !r.height) continue
          rects.push({ x: r.left - pageRect.left, y: r.top - pageRect.top, w: r.width, h: r.height })
        }
        if (rects.length) matches.push({ rects })
      } catch {
        // ignore bad ranges
      }
    }

    if (!matches.length) return { total: 0, active: null }

    const drawEnabled = !cfg?.countOnly
    const activeIndex = Math.max(0, Math.min(matches.length - 1, cfg?.activeIndex ?? 0))
    if (drawEnabled) {
      matches.forEach((match, matchIndex) => {
        match.rects.forEach((rect) => {
          overlay.appendChild(makeHighlightDiv(rect.x, rect.y, rect.w, rect.h, matchIndex === activeIndex))
        })
      })
      const focusRect = matches[activeIndex]?.rects?.[0]
      if (focusRect) {
        try { options.scrollToPageOffset(pageIndex + 1, Math.max(0, focusRect.y - 60)) } catch {}
      }
    }
    return { total: matches.length, active: drawEnabled ? activeIndex : null }
  }

  return {
    clearHighlights,
    highlightInPage,
  }
}
