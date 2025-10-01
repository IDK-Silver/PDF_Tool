import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue'
import type { ComponentPublicInstance, Ref } from 'vue'
import type { PDFDocumentProxy } from '../../lib/pdfjs'
import type { PagePointerContext } from '../../types/viewer'
import { loadPdfViewer } from '../../lib/pdfjs-viewer'

type EmitFn = (...args: any[]) => void

export interface PageView {
  pageNumber: number
  width: number
  height: number
  scale: number
  canvas: HTMLCanvasElement | null
  renderTask: any
  container?: HTMLDivElement | null
  inner?: HTMLDivElement | null
  renderToken?: number
  queued?: boolean
  lastRenderedScale?: number
  textTask?: any
  textToken?: number
  textBuilder?: any
}

export function usePdfViewerEngine(options: {
  doc: Ref<PDFDocumentProxy | null>
  scale: Ref<number>
  emit: EmitFn
  textIdleMs?: number
  renderIdleMs?: number
  zoomTweenMs?: number
  zoomBridge?: 'host' | 'canvas' | 'none'
}) {
  const emit = options.emit

  const containerRef = ref<HTMLDivElement | null>(null)
  const pages = ref<PageView[]>([])

  const baseHeights = ref<number[]>([])
  const baseWidths = ref<number[]>([])
  const containerPaddingTop = ref<number>(16)
  const pageListGap = ref<number>(24)
  const pageLabelExtra = ref<number>(20)
  const pageGap = computed(() => pageListGap.value + pageLabelExtra.value)

  const scaledHeights = ref<number[]>([])
  const tops = ref<number[]>([])

  const displayScale = computed(() => options.scale.value ?? 1.2)

  const bufferPages = ref<number>(2)
  const textBufferPages = ref<number>(1)
  const currentIndex = ref<number>(0)

  let inFlight = 0
  const renderQueue: PageView[] = []
  const TEXT_IDLE_MS = Number.isFinite(options.textIdleMs) ? (options.textIdleMs as number) : 100
  const RENDER_IDLE_MS = Number.isFinite(options.renderIdleMs) ? (options.renderIdleMs as number) : 20
  const ZOOM_TWEEN_MS = Number.isFinite(options.zoomTweenMs) ? (options.zoomTweenMs as number) : 120
  const ZOOM_BRIDGE: "host" | "canvas" | "none" =
    (options.zoomBridge as any) ?? "none";
  let textIdleTimer: number | null = null
  let renderIdleTimer: number | null = null
  let renderPaused = false
  let cssZoomTargetScale: number | null = null
  let cssZoomBaseScale: number | null = null
  let zoomTweenProgress = 1
  let zoomTweenActive = false
  let zoomTweenRaf: number | null = null
  let zoomFinalizeAnchor: { x: number; y: number; viewportX: number; viewportY: number; pageIndex?: number; pdfLocalY?: number; pdfLocalX?: number } | null = null
  let pendingZoomAnchor: { x?: number; y?: number; viewportX?: number; viewportY?: number } | null = null
  let tweenOverrideMs: number | null = null
  let lastDoc: PDFDocumentProxy | null = null
  let lastScale = 1
  let suppressVisibleUpdate = false

  function enqueue(pv: PageView) {
    if (pv.queued) return
    pv.queued = true
    renderQueue.push(pv)
    pump()
  }

  function pump() {
    while (inFlight < 3 && renderQueue.length) {
      const pv = renderQueue.shift()!
      void startRender(pv)
    }
  }

  async function startRender(pv: PageView) {
    const doc = lastDoc
    if (!doc || !pv.canvas) { pv.queued = false; return }
    inFlight++
    const token = (pv.renderToken = (pv.renderToken || 0) + 1)
    pv.scale = displayScale.value
    try {
      await renderPage(doc, pv)
      if (pv.renderToken !== token) return
      pv.lastRenderedScale = pv.scale
      scheduleTextLayerPass()
    } finally {
      pv.queued = false
      inFlight--
      pump()
    }
  }

  async function renderPage(doc: PDFDocumentProxy, pageView: PageView) {
    try {
      const pdfPage = await doc.getPage(pageView.pageNumber)
      const viewport = pdfPage.getViewport({ scale: pageView.scale })
      const outputScale = window.devicePixelRatio || 1
      pageView.width = viewport.width
      pageView.height = viewport.height

      if (!pageView.canvas) return

      const canvas = pageView.canvas
      const context = canvas.getContext('2d')
      if (!context) return

      await cancelTask(pageView.renderTask)

      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
      const renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform })
      pageView.renderTask = markRaw(renderTask)
      await renderTask.promise
      try {
        canvas.style.transform = 'none'
        canvas.style.willChange = ''
      } catch {}
    } catch (error: any) {
      const name = error?.name || ''
      const msg = (error?.message || '').toString().toLowerCase()
      if (
        name === 'RenderingCancelledException' ||
        msg.includes('rendering cancelled') ||
        msg.includes('rendering canceled') ||
        msg.includes('cancel')
      ) return
      emit('doc-error', error)
    }
  }

  async function cancelTask(task: any) {
    if (!task) return
    try { task.cancel?.() } catch {}
    try { await task.promise } catch {}
  }

  async function cancelTextTask(task: any) {
    if (!task) return
    try { task.cancel?.() } catch {}
    try { await task.promise } catch {}
  }

  async function renderTextLayerForPage(doc: PDFDocumentProxy, pageView: PageView) {
    try {
      const container = pageView.inner || pageView.container || null
      if (!container) return
      await cancelTextTask(pageView.textTask)
      pageView.textTask = null
      pageView.textBuilder?.cancel?.()
      pageView.textBuilder = null

      const pdfPage = await doc.getPage(pageView.pageNumber)
      const viewport = pdfPage.getViewport({ scale: pageView.scale })
      try { container.querySelector('.textLayer')?.remove() } catch {}

      const { TextLayerBuilder } = await loadPdfViewer()
      const builder = new (TextLayerBuilder as any)({
        pdfPage,
        onAppend: (div: HTMLDivElement) => {
          try { container.appendChild(div) } catch {}
        },
      })
      pageView.textBuilder = markRaw(builder)
      const promise = builder.render({ viewport })
      pageView.textTask = markRaw({ promise, cancel: () => builder.cancel() })
    await promise
    try {
      const divEl = (builder as any).div as HTMLDivElement
      if (divEl) {
        divEl.style.width = `${viewport.width}px`
        divEl.style.height = `${viewport.height}px`
        divEl.style.pointerEvents = 'auto'
        ;(divEl.style as any)['userSelect'] = 'text'
        ;(divEl.style as any)['webkitUserSelect'] = 'text'
        divEl.style.zIndex = '2'
        try {
          divEl.style.setProperty('--scale-factor', String(viewport.scale))
          divEl.style.setProperty('--total-scale-factor', String(viewport.scale))
        } catch {}
      }
      // If a zoom bridge is active, ensure text layer follows the same transform
      if (cssZoomTargetScale != null) {
        const fromScale = pageView.lastRenderedScale ?? cssZoomBaseScale ?? lastScale
        const host = pageView.inner || pageView.container
        const ratio = fromScale ? (cssZoomTargetScale / fromScale) : 1
        if (divEl && Number.isFinite(ratio) && ratio > 0 && fromScale && fromScale !== cssZoomTargetScale) {
          try {
            divEl.style.transformOrigin = '0 0'
            divEl.style.transform = `scale(${ratio})`
            divEl.style.willChange = 'transform'
            if (host) host.style.overflow = 'visible'
          } catch {}
        }
      }
    } catch {}
    } catch (error: any) {
      const name = error?.name || ''
      const msg = (error?.message || '').toString().toLowerCase()
      if (
        name === 'RenderingCancelledException' ||
        msg.includes('rendering cancelled') ||
        msg.includes('rendering canceled') ||
        (msg.includes('textlayer') && msg.includes('cancel')) ||
        msg.includes('cancel')
      ) return
      emit('doc-error', error)
    }
  }

  async function resetPages() {
    for (const view of pages.value) {
      await cancelTask(view.renderTask)
      view.renderTask = null
      try { await cancelTask(view.textTask) } catch {}
      view.textTask = null
    }
    pages.value = []
    baseHeights.value = []
    baseWidths.value = []
    scaledHeights.value = []
    tops.value = []
    cssZoomTargetScale = null
    cssZoomBaseScale = null
    pendingZoomAnchor = null
  }

  function recomputeLayout(scale: number) {
    const n = baseHeights.value.length
    const h = new Array<number>(n)
    const t = new Array<number>(n)
    const w = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      h[i] = (baseHeights.value[i] || 0) * scale
      w[i] = (baseWidths.value[i] || 0) * scale
    }
    let acc = containerPaddingTop.value
    for (let i = 0; i < n; i++) {
      t[i] = acc
      acc += h[i] + pageGap.value
    }
    scaledHeights.value = h
    tops.value = t
    for (const pv of pages.value) {
      const idx = pv.pageNumber - 1
      pv.width = w[idx] || 0
      pv.height = h[idx] || 0
    }
  }

  function binarySearchIndex(anchor: number): number {
    const t = tops.value
    const h = scaledHeights.value
    const n = t.length
    if (n === 0) return 0
    if (anchor <= t[0]) return 0
    if (anchor >= t[n - 1] + h[n - 1]) return n - 1
    let lo = 0, hi = n - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const start = t[mid]
      const end = start + h[mid]
      if (anchor < start) hi = mid - 1
      else if (anchor >= end) lo = mid + 1
      else return mid
    }
    return Math.max(0, Math.min(n - 1, lo))
  }

  // reanchorToCenter was replaced by finalizeZoom() that uses a normalized anchor.

  function updateRenderWindow() {
    const n = pages.value.length
    if (!n || renderPaused) return
    const idx = currentIndex.value
    const start = Math.max(0, idx - bufferPages.value)
    const end = Math.min(n - 1, idx + bufferPages.value)
    for (let i = 0; i < n; i++) {
      const pv = pages.value[i]
      const inRange = i >= start && i <= end
      if (!pv.canvas) continue
      if (inRange) {
        if (pv.lastRenderedScale !== displayScale.value) enqueue(pv)
      } else {
        if (pv.renderTask) void cancelTask(pv.renderTask)
        if (pv.textTask) void cancelTextTask(pv.textTask)
        try {
          const host = pv.inner || pv.container
          host?.querySelector('.textLayer')?.remove()
        } catch {}
        pv.queued = false
      }
    }
  }

  function scheduleRenderPass() {
    if (renderIdleTimer) { try { clearTimeout(renderIdleTimer) } catch {} }
    if (RENDER_IDLE_MS <= 0) {
      renderPaused = false
      updateRenderWindow()
      return
    }
    renderPaused = true
    renderIdleTimer = window.setTimeout(() => {
      renderIdleTimer = null
      renderPaused = false
      updateRenderWindow()
    }, RENDER_IDLE_MS)
  }

  function scheduleTextLayerPass() {
    if (textIdleTimer) { try { clearTimeout(textIdleTimer) } catch {} }
    if (TEXT_IDLE_MS <= 0) {
      textIdleTimer = null
      void renderTextLayersForWindow()
      return
    }
    textIdleTimer = window.setTimeout(() => {
      textIdleTimer = null
      void renderTextLayersForWindow()
    }, TEXT_IDLE_MS)
  }

  async function renderTextLayersForWindow() {
    const n = pages.value.length
    if (!n || !lastDoc) return
    const idx = currentIndex.value
    const start = Math.max(0, idx - textBufferPages.value)
    const end = Math.min(n - 1, idx + textBufferPages.value)
    for (let i = start; i <= end; i++) {
      const pv = pages.value[i]
      try { await renderTextLayerForPage(lastDoc, pv) } catch {}
    }
  }

  // Removed width:100% bridging to avoid double-scaling visual overshoot during zoom

  function applyHostTransformForZoom() {
    const n = pages.value.length
    if (!n || cssZoomTargetScale == null) return
    const idx = currentIndex.value
    const start = Math.max(0, idx - bufferPages.value)
    const end = Math.min(n - 1, idx + bufferPages.value)
    for (let i = start; i <= end; i++) {
      const pv = pages.value[i]
      const host = pv.inner || pv.container
      const canvas = pv.canvas
      if (!host) continue
      const fromScale = pv.lastRenderedScale ?? cssZoomBaseScale ?? lastScale
      if (!fromScale || fromScale === cssZoomTargetScale) {
        // clear transforms regardless of bridge
        if (ZOOM_BRIDGE === 'host') {
          try { host.style.transform = 'none'; host.style.willChange = '' } catch {}
        } else if (ZOOM_BRIDGE === 'canvas') {
          if (canvas) { try { canvas.style.transform = 'none'; canvas.style.willChange = '' } catch {} }
          try { host.querySelector('.textLayer')?.setAttribute('style','') } catch {}
        } else {
          // none: make sure styles are reset
          try { host.style.transform = 'none'; host.style.willChange = '' } catch {}
          if (canvas) { try { canvas.style.transform = 'none'; canvas.style.willChange = '' } catch {} }
          try { host.querySelector('.textLayer')?.setAttribute('style','') } catch {}
        }
        try { host.style.overflow = '' } catch {}
        continue
      }
      let ratio = cssZoomTargetScale / fromScale
      if (zoomTweenActive) {
        const r0 = 1
        ratio = r0 + (ratio - r0) * zoomTweenProgress
      }
      if (!Number.isFinite(ratio) || ratio <= 0) continue
      try {
        if (ZOOM_BRIDGE === 'host') {
          host.style.transformOrigin = '0 0'
          host.style.transform = `scale(${ratio})`
          host.style.willChange = 'transform'
        } else if (ZOOM_BRIDGE === 'canvas') {
          if (canvas) {
            canvas.style.transformOrigin = '0 0'
            canvas.style.transform = `scale(${ratio})`
            canvas.style.willChange = 'transform'
          }
          const textLayer = host.querySelector<HTMLElement>('.textLayer') || null
          if (textLayer) {
            textLayer.style.transformOrigin = '0 0'
            textLayer.style.transform = `scale(${ratio})`
            textLayer.style.willChange = 'transform'
          }
        }
        // Zoom-in -> avoid clipping; Zoom-out -> avoid overlap
        host.style.overflow = ratio > 1 ? 'visible' : ''
      } catch {}
    }
  }

  function startZoomTween() {
    const dur = Number.isFinite(tweenOverrideMs) && tweenOverrideMs !== null ? (tweenOverrideMs as number) : ZOOM_TWEEN_MS!
    tweenOverrideMs = null
    if (!Number.isFinite(dur) || dur <= 0) {
      zoomTweenActive = false
      zoomTweenProgress = 1
      applyHostTransformForZoom()
      // No tween: finalize immediately
      finalizeZoom()
      return
    }
    if (zoomTweenRaf) cancelAnimationFrame(zoomTweenRaf)
    zoomTweenActive = true
    zoomTweenProgress = 0
    const start = performance.now()
    const ease = (t: number) => 1 - Math.cos((t * Math.PI) / 2) // easeOutSine
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      zoomTweenProgress = ease(p)
      applyHostTransformForZoom()
      if (p < 1) zoomTweenRaf = requestAnimationFrame(step)
      else {
        zoomTweenActive = false
        zoomTweenRaf = null
        applyHostTransformForZoom()
        finalizeZoom()
      }
    }
    zoomTweenRaf = requestAnimationFrame(step)
  }

  function finalizeZoom() {
    // Clear visual bridge and update layout atomically
    const container = containerRef.value
    if (!container) return
    const anchor = zoomFinalizeAnchor
    zoomFinalizeAnchor = null
    // Update predicted layout to the new scale
    recomputeLayout(lastScale)
    // After new layout, scroll back to anchor if provided
    const stateAfter = {
      scrollWidth: container.scrollWidth,
      scrollHeight: container.scrollHeight,
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight,
    }
    if (anchor) {
      // Horizontal anchor（內容比例）
      let targetLeft = 0
      if (typeof anchor.pageIndex === 'number' && anchor.pageIndex >= 0 && anchor.pageIndex < pages.value.length && Number.isFinite(anchor.pdfLocalX as number)) {
        // 以頁內絕對 X 座標回捲（優先）
        const pv = pages.value[anchor.pageIndex]
        const host = pv.inner || pv.container
        const containerRect = container.getBoundingClientRect()
        let pageLeftNew = 0
        try {
          const pageRect = host?.getBoundingClientRect()
          if (pageRect) pageLeftNew = container.scrollLeft + (pageRect.left - containerRect.left)
        } catch {}
        targetLeft = pageLeftNew + (anchor.pdfLocalX as number) * lastScale - anchor.viewportX
        const maxLeft = Math.max(0, stateAfter.scrollWidth - stateAfter.clientWidth)
        targetLeft = Math.max(0, Math.min(targetLeft, maxLeft))
      } else {
        const leftRaw = stateAfter.scrollWidth > 0 ? (anchor.x * stateAfter.scrollWidth - anchor.viewportX) : 0
        const maxLeft = Math.max(0, stateAfter.scrollWidth - stateAfter.clientWidth)
        targetLeft = Math.max(0, Math.min(leftRaw, maxLeft))
      }

      // Vertical anchor：優先以 PDF 絕對座標（頁內 y 單位）回捲；沒有則退回全域比例。
      let targetTop = 0
      if (
        typeof anchor.pageIndex === 'number' && anchor.pageIndex >= 0 &&
        anchor.pageIndex < tops.value.length && Array.isArray(scaledHeights.value)
      ) {
        const idx = anchor.pageIndex
        const pageTop = tops.value[idx] || 0
        if (Number.isFinite(anchor.pdfLocalY as number)) {
          // 將 PDF 絕對座標乘上新倍率換回像素
          targetTop = pageTop + (anchor.pdfLocalY as number) * lastScale - anchor.viewportY
        } else if (stateAfter.scrollHeight > 0) {
          // 後備：用全域比例
          const topRaw = anchor.y * stateAfter.scrollHeight - anchor.viewportY
          targetTop = topRaw
        }
      } else if (stateAfter.scrollHeight > 0) {
        const topRaw = anchor.y * stateAfter.scrollHeight - anchor.viewportY
        targetTop = topRaw
      }
      const maxTop = Math.max(0, stateAfter.scrollHeight - stateAfter.clientHeight)
      targetTop = Math.max(0, Math.min(targetTop, maxTop))
      container.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' })
    }
    // Clear transforms
    cssZoomBaseScale = null
    cssZoomTargetScale = null
    applyHostTransformForZoom()
  }

  function setCanvasRef(el: HTMLCanvasElement | Element | ComponentPublicInstance | null, page: PageView) {
    page.canvas = (el as HTMLCanvasElement | null) ?? null
  }

  function setContainerRef(el: HTMLDivElement | Element | ComponentPublicInstance | null, page: PageView) {
    page.container = (el as HTMLDivElement | null) ?? null
  }

  function setInnerRef(el: HTMLDivElement | Element | ComponentPublicInstance | null, page: PageView) {
    page.inner = (el as HTMLDivElement | null) ?? null
  }

  function prepareZoomAnchor(anchor: { x?: number; y?: number; viewportX?: number; viewportY?: number } | null) {
    if (!anchor) {
      pendingZoomAnchor = null
      return
    }
    const sanitized: { x?: number; y?: number; viewportX?: number; viewportY?: number } = {}
    if (Number.isFinite(anchor.x as number)) sanitized.x = anchor.x as number
    if (Number.isFinite(anchor.y as number)) sanitized.y = anchor.y as number
    if (Number.isFinite(anchor.viewportX as number)) sanitized.viewportX = anchor.viewportX as number
    if (Number.isFinite(anchor.viewportY as number)) sanitized.viewportY = anchor.viewportY as number
    pendingZoomAnchor = sanitized
  }

  let rafId: number | null = null
  function updateCurrentPage() {
    const container = containerRef.value
    if (!container || !pages.value.length) return
    const anchor = container.scrollTop + container.clientHeight / 2
    const idx = binarySearchIndex(anchor)
    currentIndex.value = idx
    emit('visible-page', (idx || 0) + 1)
  }

  function onScroll() {
    if (suppressVisibleUpdate) return
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      rafId = null
      updateCurrentPage()
      updateRenderWindow()
      if (cssZoomTargetScale != null) applyHostTransformForZoom()
      scheduleTextLayerPass()
    })
  }

  function normalizeWheelDelta(event: WheelEvent) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * 360
    return event.deltaY
  }

  function clamp01(value: number) {
    if (!Number.isFinite(value)) return 0.5
    return Math.min(1, Math.max(0, value))
  }

  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey) return
    const container = containerRef.value
    if (!container) return
    event.preventDefault()
    const deltaY = normalizeWheelDelta(event)
    if (!Number.isFinite(deltaY)) return
    const rect = container.getBoundingClientRect()
    const viewportX = event.clientX - rect.left
    const viewportY = event.clientY - rect.top
    const width = Math.max(container.scrollWidth, container.clientWidth)
    const height = Math.max(container.scrollHeight, container.clientHeight)
    const anchorX = clamp01((container.scrollLeft + viewportX) / width)
    const anchorY = clamp01((container.scrollTop + viewportY) / height)

    emit('pinch-zoom', { deltaY, anchorX, anchorY, viewportX, viewportY })
  }

  watch(containerRef, (el, prev) => {
    try { prev?.removeEventListener('scroll', onScroll) } catch {}
    try { prev?.removeEventListener('wheel', onWheel) } catch {}
    el?.addEventListener('scroll', onScroll, { passive: true })
    el?.addEventListener('wheel', onWheel, { passive: false })
  })

  let resizeObs: ResizeObserver | null = null
  watch(containerRef, (el) => {
    try { resizeObs?.disconnect() } catch {}
    if (el) {
      resizeObs = new ResizeObserver(() => {
        if (!pages.value.length) return
        const container = containerRef.value!
        const anchor = container.scrollTop + container.clientHeight / 2
        const idx = binarySearchIndex(anchor)
        const within = Math.max(0, anchor - (tops.value[idx] || 0))
        const ratio = (scaledHeights.value[idx] || 1) > 0 ? Math.min(1, within / (scaledHeights.value[idx] || 1)) : 0
        const newAnchorTop = (tops.value[idx] || 0) + (scaledHeights.value[idx] || 0) * ratio - container.clientHeight / 2
        suppressVisibleUpdate = true
        container.scrollTo({ top: Math.max(0, newAnchorTop), behavior: 'auto' })
        requestAnimationFrame(() => {
          suppressVisibleUpdate = false
          updateCurrentPage()
          updateRenderWindow()
        })
      })
      resizeObs.observe(el)
    }
  })

  function scrollToPage(pageNumber: number) {
    const container = containerRef.value
    if (!container) return
    const clamped = Math.max(1, Math.min(pages.value.length || 1, pageNumber))
    if (!tops.value.length) return
    const targetTop = tops.value[clamped - 1]
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
  }

  function getPageMetrics(pageNumber: number) {
    const container = containerRef.value
    if (!container) return null
    const idx = Math.max(0, Math.min((pages.value.length || 1) - 1, pageNumber - 1))
    const pageTop = tops.value[idx] || 0
    const pageHeight = scaledHeights.value[idx] || 0
    return { pageTop, pageHeight, scrollTop: container.scrollTop }
  }

  function scrollToPageOffset(pageNumber: number, offsetPx: number) {
    const container = containerRef.value
    if (!container) return
    const idx = Math.max(0, Math.min((pages.value.length || 1) - 1, pageNumber - 1))
    const pageTop = tops.value[idx] || 0
    const target = pageTop + Math.max(0, offsetPx)
    container.scrollTo({ top: Math.max(0, target), behavior: 'auto' })
  }

  function onPageContextMenu(event: MouseEvent, page: PageView) {
    event.preventDefault()
    const canvas = page.canvas
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const pdfX = offsetX / page.scale
    const pdfY = (page.height - offsetY) / page.scale

    const context: PagePointerContext = {
      pageNumber: page.pageNumber,
      pageIndex: page.pageNumber - 1,
      scale: page.scale,
      width: page.width,
      height: page.height,
      offsetX,
      offsetY,
      clientX: event.clientX,
      clientY: event.clientY,
      pdfX,
      pdfY,
    }

    emit('page-contextmenu', context)
  }

  async function handleDocumentChange(doc: PDFDocumentProxy | null, scale: number) {
    const currentDoc = toRaw(doc) as PDFDocumentProxy | null
    if (!doc || !currentDoc) {
      await resetPages()
      lastDoc = null
      return
    }

    if (doc !== lastDoc) {
      await resetPages()
      renderQueue.length = 0
      inFlight = 0
      emit('doc-loading')
      const total = doc.numPages
      baseHeights.value = []
      baseWidths.value = []
      for (let i = 1; i <= total; i++) {
        const p = await doc.getPage(i)
        const vp = p.getViewport({ scale: 1 })
        baseWidths.value.push(vp.width)
        baseHeights.value.push(vp.height)
      }
      pages.value = Array.from({ length: total }, (_, index) =>
        reactive<PageView>({
          pageNumber: index + 1,
          width: 0,
          height: 0,
          scale,
          canvas: null,
          renderTask: null,
          container: null,
        }),
      )
      recomputeLayout(scale)
      await nextTick()
      try {
        const firstLabel = pages.value[0]?.container?.querySelector<HTMLDivElement>('.page-number')
        if (firstLabel) {
          const lh = Math.ceil(firstLabel.getBoundingClientRect().height)
          if (lh > 0) {
            pageLabelExtra.value = 8 + lh
            recomputeLayout(scale)
          }
        }
      } catch {}
      lastDoc = doc
      lastScale = scale
      const container = containerRef.value
      if (container) {
        const anchor = container.scrollTop + container.clientHeight / 2
        currentIndex.value = binarySearchIndex(anchor)
      } else {
        currentIndex.value = 0
      }
      updateRenderWindow()
      scheduleTextLayerPass()
      if (options.doc.value === doc) emit('doc-loaded', total)
      return
    }

    if (scale !== lastScale) {
      emit('doc-loading')
      const prev = lastScale
      cssZoomBaseScale = prev
      cssZoomTargetScale = scale
      // Capture current anchor at viewport center for final reanchor（頁索引 + PDF 絕對座標 y + 水平比例）
      const container = containerRef.value
      const preset = pendingZoomAnchor
      pendingZoomAnchor = null
      if (container) {
        const fallbackViewportX = container.clientWidth / 2
        const fallbackViewportY = container.clientHeight / 2
        const viewportX = Number.isFinite(preset?.viewportX as number)
          ? (preset!.viewportX as number)
          : fallbackViewportX
        const viewportY = Number.isFinite(preset?.viewportY as number)
          ? (preset!.viewportY as number)
          : fallbackViewportY
        const width = Math.max(container.scrollWidth, container.clientWidth)
        const height = Math.max(container.scrollHeight, container.clientHeight)
        const rawX = preset?.x
        const rawY = preset?.y
        const computedX = Number.isFinite(rawX as number)
          ? (rawX as number)
          : (width ? (container.scrollLeft + viewportX) / width : 0.5)
        const computedY = Number.isFinite(rawY as number)
          ? (rawY as number)
          : (height ? (container.scrollTop + viewportY) / height : 0.5)
        const normX = Math.min(1, Math.max(0, computedX))
        const normY = Math.min(1, Math.max(0, computedY))
        const anchorTop = container.scrollTop + viewportY
        const idx = binarySearchIndex(anchorTop)
        const pageTop = tops.value[idx] || 0
        const withinY = anchorTop - pageTop
        const prevPageHeight = (baseHeights.value[idx] || 0) * prev
        const withinYClamped = Math.min(Math.max(0, withinY), Math.max(0, prevPageHeight))
        const pdfLocalY = withinYClamped / Math.max(1e-6, prev)
        let pdfLocalX = 0
        try {
          const anchorLeft = container.scrollLeft + viewportX
          const pv = pages.value[idx]
          const host = pv?.inner || pv?.container
          const containerRect = container.getBoundingClientRect()
          const pageRect = host?.getBoundingClientRect()
          const pageLeft = pageRect ? (container.scrollLeft + (pageRect.left - containerRect.left)) : 0
          const withinX = anchorLeft - pageLeft
          const prevPageWidth = (baseWidths.value[idx] || 0) * prev
          const withinXClamped = Math.min(Math.max(0, withinX), Math.max(0, prevPageWidth))
          pdfLocalX = withinXClamped / Math.max(1e-6, prev)
        } catch {}
        zoomFinalizeAnchor = {
          x: normX,
          y: normY,
          viewportX,
          viewportY,
          pageIndex: idx,
          pdfLocalY,
          pdfLocalX,
        }
      } else if (preset) {
        const normX = Math.min(1, Math.max(0, (preset.x as number) ?? 0.5))
        const normY = Math.min(1, Math.max(0, (preset.y as number) ?? 0.5))
        zoomFinalizeAnchor = {
          x: normX,
          y: normY,
          viewportX: (preset.viewportX as number) ?? 0,
          viewportY: (preset.viewportY as number) ?? 0,
        }
      } else {
        zoomFinalizeAnchor = null
      }
      applyHostTransformForZoom()
      // IMPORTANT: update lastScale BEFORE starting tween/finalize so finalizeZoom uses target scale
      lastScale = scale
      startZoomTween()
      for (const pv of pages.value) { pv.lastRenderedScale = undefined }
      scheduleRenderPass()
      // Do not reanchor immediately; finalize after tween
      scheduleTextLayerPass()
      emit('doc-loaded', pages.value.length)
    }
  }

  onMounted(() => {
    const el = containerRef.value
    if (el) {
      const cs = getComputedStyle(el)
      const pt = parseFloat(cs.paddingTop || '16')
      if (!Number.isNaN(pt)) containerPaddingTop.value = pt
    }
  })

  watch(
    () => [options.doc.value, displayScale.value] as const,
    async ([doc, scale]) => {
      await handleDocumentChange(doc, scale)
    },
    { immediate: true },
  )

  onBeforeUnmount(async () => {
    await resetPages()
    const el = containerRef.value
    try { el?.removeEventListener('scroll', onScroll) } catch {}
    try { el?.removeEventListener('wheel', onWheel) } catch {}
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    if (textIdleTimer) { try { clearTimeout(textIdleTimer) } catch {}; textIdleTimer = null }
    if (renderIdleTimer) { try { clearTimeout(renderIdleTimer) } catch {}; renderIdleTimer = null }
    try { resizeObs?.disconnect() } catch {}
  })

  function getScrollState() {
    const container = containerRef.value
    if (!container) return null
    return {
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      scrollWidth: container.scrollWidth,
      scrollHeight: container.scrollHeight,
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight,
    }
  }

  function scrollToPosition(pos: { left?: number; top?: number }) {
    const container = containerRef.value
    if (!container) return
    const targetLeft = pos.left ?? container.scrollLeft
    const targetTop = pos.top ?? container.scrollTop
    container.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' })
  }

  return {
    containerRef,
    pages,
    displayScale,
    setCanvasRef,
    setContainerRef,
    setInnerRef,
    prepareZoomAnchor,
    scrollToPage,
    getPageMetrics,
    scrollToPageOffset,
    onPageContextMenu,
    getScrollState,
    scrollToPosition,
    // allow caller to disable tween once (e.g., for keyboard zoom)
    disableTweenOnce: (ms = 0) => { tweenOverrideMs = ms },
  }
}
