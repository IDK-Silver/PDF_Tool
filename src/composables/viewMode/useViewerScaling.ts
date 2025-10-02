import { nextTick, ref, watch, type Ref } from 'vue'
import type { AppSettings } from '../persistence'

type ViewerScalingOptions = {
  viewerRef: Ref<any>
  viewerContainerRef: Ref<HTMLDivElement | null>
  pdfDoc: Ref<any>
  isPdfFile: Ref<boolean>
  isImageFile: Ref<boolean>
  currentPage: Ref<number>
  settings: Ref<AppSettings>
  leftCollapsed?: Ref<boolean> | undefined
}

type ApplyAnchor = { x?: number; y?: number; viewportX?: number; viewportY?: number }

type ZoomMode = 'actual' | 'fit' | 'custom'

export function useViewerScaling(options: ViewerScalingOptions) {
  const minScale = 0.01
  const maxScale = 4

  const scale = ref(1)
  const zoomMode = ref<ZoomMode>('fit')
  const suppressVisibleUpdate = ref(false)
  const basePageWidth = ref(0)
  const lastAppliedScale = ref(1)

  const currentPage = options.currentPage
  const viewerRef = options.viewerRef

  let pinchChain: Promise<void> = Promise.resolve()

  function clampScale(value: number) {
    const upper = scale.value > maxScale ? Math.max(lastAppliedScale.value, scale.value) : maxScale
    return Math.min(upper, Math.max(minScale, value))
  }

  function computeFitScale(): number {
    const container = options.viewerContainerRef.value
    if (!basePageWidth.value) return scale.value

    let innerWidth = container ? Math.max(0, container.clientWidth - 32) : 0
    if (options.isImageFile.value) {
      const viewer: any = viewerRef.value
      const widthFromViewer = viewer?.getContainerWidth?.()
      innerWidth = typeof widthFromViewer === 'number' && widthFromViewer > 0
        ? widthFromViewer
        : (container ? container.clientWidth : 0)
    }

    if (innerWidth <= 0) return scale.value
    const rawScale = innerWidth / basePageWidth.value
    return Number.isFinite(rawScale) && rawScale > 0 ? rawScale : scale.value
  }

  async function ensureBasePageWidth() {
    try {
      if (!options.pdfDoc.value) return
      const page = await options.pdfDoc.value.getPage(1)
      const viewport = page.getViewport({ scale: 1 })
      basePageWidth.value = viewport.width
    } catch {
      // ignore
    }
  }

  async function applyScaleWithAnchor(
    newScale: number,
    mode: ZoomMode = 'custom',
    anchor?: ApplyAnchor,
  ) {
    const viewer: any = viewerRef.value
    const page = currentPage.value || 1
    const before = viewer?.getPageMetrics?.(page)
    const oldOffset = before ? Math.max(0, before.scrollTop - before.pageTop) : 0
    const ratio = lastAppliedScale.value ? newScale / lastAppliedScale.value : 1
    const scrollStateBefore = viewer?.getScrollState?.()
    const fallbackContainer = options.viewerContainerRef.value
    const viewportWidth = scrollStateBefore?.clientWidth ?? fallbackContainer?.clientWidth ?? 0
    const viewportHeight = scrollStateBefore?.clientHeight ?? fallbackContainer?.clientHeight ?? 0
    const pointerViewportX = anchor?.viewportX ?? (viewportWidth ? viewportWidth / 2 : 0)
    const pointerViewportY = anchor?.viewportY ?? (viewportHeight ? viewportHeight / 2 : 0)

    const contentWidthBefore = Math.max(scrollStateBefore?.scrollWidth ?? 0, 1)
    const contentHeightBefore = Math.max(scrollStateBefore?.scrollHeight ?? 0, 1)
    const anchorX = Math.min(1, Math.max(0, anchor?.x ?? (scrollStateBefore ? (scrollStateBefore.scrollLeft + pointerViewportX) / contentWidthBefore : 0.5)))
    const anchorY = Math.min(1, Math.max(0, anchor?.y ?? (scrollStateBefore ? (scrollStateBefore.scrollTop + pointerViewportY) / contentHeightBefore : 0.5)))

    if (viewer?.prepareZoomAnchor) {
      viewer.prepareZoomAnchor({
        x: anchorX,
        y: anchorY,
        viewportX: pointerViewportX,
        viewportY: pointerViewportY,
      })
    }

    zoomMode.value = mode
    scale.value = newScale
    suppressVisibleUpdate.value = true
    await nextTick(); await nextTick()

    if (options.isImageFile.value && viewer?.scrollToPageOffset) {
      viewer.scrollToPageOffset(page, Math.max(0, oldOffset * ratio))
    }
    lastAppliedScale.value = newScale
    currentPage.value = page
    await nextTick()

    const scrollStateAfter = viewer?.getScrollState?.()
    const shouldAdjustImage = options.isImageFile.value && viewer?.scrollToPosition && scrollStateAfter
    if (shouldAdjustImage) {
      const contentWidthAfter = Math.max(scrollStateAfter.scrollWidth ?? 0, 1)
      const contentHeightAfter = Math.max(scrollStateAfter.scrollHeight ?? 0, 1)
      const leftRaw = anchorX * contentWidthAfter - pointerViewportX
      const maxLeft = Math.max(0, contentWidthAfter - scrollStateAfter.clientWidth)
      const targetLeft = Math.max(0, Math.min(leftRaw, maxLeft))

      let targetTop: number | undefined
      if (anchor?.y != null) {
        const topRaw = anchorY * contentHeightAfter - pointerViewportY
        const maxTop = Math.max(0, contentHeightAfter - scrollStateAfter.clientHeight)
        targetTop = Math.max(0, Math.min(topRaw, maxTop))
      }

      viewer.scrollToPosition({ left: targetLeft, top: targetTop })
    }

    suppressVisibleUpdate.value = false
  }

  function setZoomFit() {
    void applyScaleWithAnchor(computeFitScale(), 'fit')
  }

  function setZoomActual() {
    void applyScaleWithAnchor(1, 'actual')
  }

  function zoomIn(step = 0.1) {
    const target = clampScale(scale.value + step)
    void applyScaleWithAnchor(target, 'actual')
  }

  function zoomOut(step = 0.1) {
    const target = clampScale(scale.value - step)
    void applyScaleWithAnchor(target, 'actual')
  }

  function onPinchZoom(payload: { deltaY: number; anchorX: number; anchorY: number; viewportX: number; viewportY: number }) {
    if (!payload || !Number.isFinite(payload.deltaY)) return
    const factor = Math.exp(-payload.deltaY / 600)
    const target = clampScale(scale.value * factor)
    if (Math.abs(target - scale.value) < 0.0001) return
    const anchor = {
      x: payload.anchorX,
      y: payload.anchorY,
      viewportX: payload.viewportX,
      viewportY: payload.viewportY,
    }
    pinchChain = pinchChain
      .then(() => applyScaleWithAnchor(target, 'actual', anchor))
      .catch((error) => {
        console.error('[ViewerScaling] Pinch zoom failed:', error)
      })
  }

  function handleSidebarToggle() {
    if (!options.isPdfFile.value) return
    if (!options.settings.value?.switchToActualOnSidebarToggle) return
    if (zoomMode.value !== 'fit') return
    const target = Number.isFinite(scale.value) && (scale.value as number) > 0
      ? (scale.value as number)
      : 1
    try { viewerRef.value?.disableTweenOnce?.(0) } catch {}
    void applyScaleWithAnchor(target, 'actual')
  }

  function handleWindowResize() {
    if (zoomMode.value === 'fit' && options.pdfDoc.value) {
      void applyScaleWithAnchor(computeFitScale(), 'fit')
    }
  }

  watch([options.pdfDoc, () => zoomMode.value], async ([doc, mode]) => {
    if (!doc) return
    await ensureBasePageWidth()
    if (mode === 'fit') scale.value = computeFitScale()
  })

  if (options.leftCollapsed) {
    watch(
      () => options.leftCollapsed!.value,
      () => handleSidebarToggle(),
      { flush: 'pre' },
    )
  }

  return {
    scale,
    zoomMode,
    suppressVisibleUpdate,
    basePageWidth,
    lastAppliedScale,
    computeFitScale,
    ensureBasePageWidth,
    applyScaleWithAnchor,
    setZoomFit,
    setZoomActual,
    zoomIn,
    zoomOut,
    onPinchZoom,
    handleWindowResize,
  }
}
