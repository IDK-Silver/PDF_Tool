/**
 * PDF 縮放管理 composable
 * 統一處理縮放邏輯，避免重複程式碼與複雜的視窗計算
 *
 * 重構重點：
 * 1. 單一真相來源 (Single Source of Truth)
 * 2. 同步計算錨點位置以避免 Layout Thrashing
 * 3. 支援多種錨點類型（視窗中心、滑鼠位置、頁面元素）
 */
import { ref, computed, nextTick, type Ref } from 'vue'

export interface ZoomOptions {
  /** 縮放步進值（百分比） */
  step?: number
  /** 最小縮放值 */
  min?: number
  /** 最大縮放值 */
  max?: number
}

export type ViewMode = 'fit' | 'actual'

/**
 * 錨點類型：用於描述縮放時的視覺錨點
 */
export type AnchorPoint =
  | { type: 'viewport-center' }
  | { type: 'mouse'; clientX: number; clientY: number }
  | { type: 'element'; pageIndex: number; ratioX: number; ratioY: number }

/**
 * 縮放上下文：包含執行縮放所需的所有資訊
 */
export interface ZoomContext {
  /** 滾動容器元素 */
  scrollContainer: HTMLElement
  /** 獲取頁面元素的函式 */
  getPageElement: (index: number) => HTMLElement | null
  /** 獲取頁面卡片元素的函式 */
  getPageCardElement: (index: number) => HTMLElement | null
  /** 獲取頁面在 100% 時的 CSS 寬度 */
  getBaseCssWidth: (index: number) => number | null
  /** 當前中心頁面索引 */
  centerPageIndex: number
}

/**
 * 計算結果：預先計算的滾動位置
 */
interface PrecomputedScroll {
  scrollTop: number
  scrollLeft: number
}

/**
 * 尋找視覺錨點
 * 從滑鼠位置或視窗中心找出最佳的錨點頁面和相對位置
 */
function findVisualAnchor(
  ctx: ZoomContext,
  clientX: number,
  clientY: number
): { pageIndex: number; ratioX: number; ratioY: number } | null {
  const { scrollContainer, getPageCardElement } = ctx
  const root = scrollContainer

  // 1. 嘗試直接命中頁面卡片
  const hitEl = document.elementFromPoint(clientX, clientY)
  let cardEl = hitEl?.closest('.bg-card') as HTMLElement | null
  let pageWrapper = cardEl?.closest('[data-pdf-page]') as HTMLElement | null

  // 2. 如果沒命中（在縫隙），找最近的頁面
  if (!cardEl || !pageWrapper) {
    let minDistance = Infinity
    let closestPageIndex = -1

    const allPages = root.querySelectorAll('[data-pdf-page]')
    for (const el of allPages) {
      const rect = el.getBoundingClientRect()
      const dist = Math.abs((rect.top + rect.height / 2) - clientY)
      if (dist < minDistance) {
        minDistance = dist
        closestPageIndex = Number((el as HTMLElement).dataset.pdfPage)
      }
    }

    if (closestPageIndex >= 0) {
      cardEl = getPageCardElement(closestPageIndex)
      pageWrapper = root.querySelector(`[data-pdf-page="${closestPageIndex}"]`) as HTMLElement
    }
  }

  if (!cardEl || !pageWrapper) return null

  const rect = cardEl.getBoundingClientRect()
  return {
    pageIndex: Number(pageWrapper.dataset.pdfPage),
    ratioX: (clientX - rect.left) / rect.width,
    ratioY: (clientY - rect.top) / rect.height
  }
}

/**
 * 計算元素相對於滾動容器內容的絕對位置
 */
function getAbsolutePosition(el: HTMLElement, root: HTMLElement) {
  const elRect = el.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  return {
    top: elRect.top - rootRect.top + root.scrollTop,
    left: elRect.left - rootRect.left + root.scrollLeft
  }
}

/**
 * 預計算縮放後的滾動位置（同步計算，避免 Layout Thrashing）
 *
 * 策略：
 * 1. 記錄錨點在當前內容中的絕對位置
 * 2. 根據縮放比例計算新位置
 * 3. 返回需要設定的 scrollTop/scrollLeft
 */
function precomputeScrollPosition(
  ctx: ZoomContext,
  anchor: AnchorPoint,
  oldZoom: number,
  newZoom: number
): PrecomputedScroll | null {
  const { scrollContainer: root } = ctx
  const rootRect = root.getBoundingClientRect()
  const scale = newZoom / oldZoom

  if (anchor.type === 'viewport-center') {
    // 視窗中心作為錨點
    const centerX = rootRect.width / 2
    const centerY = rootRect.height / 2

    // 計算中心點在內容中的位置
    const contentX = root.scrollLeft + centerX
    const contentY = root.scrollTop + centerY

    // 縮放後的新位置
    return {
      scrollTop: contentY * scale - centerY,
      scrollLeft: contentX * scale - centerX
    }
  }

  if (anchor.type === 'mouse') {
    // 滑鼠位置作為錨點
    const mouseViewportX = anchor.clientX - rootRect.left
    const mouseViewportY = anchor.clientY - rootRect.top

    // 計算滑鼠在內容中的位置
    const contentX = root.scrollLeft + mouseViewportX
    const contentY = root.scrollTop + mouseViewportY

    // 縮放後維持滑鼠指向的點不動
    return {
      scrollTop: contentY * scale - mouseViewportY,
      scrollLeft: root.scrollWidth <= root.clientWidth ? 0 : contentX * scale - mouseViewportX
    }
  }

  // element 類型的錨點需要在 DOM 更新後處理
  return null
}

/**
 * 在 DOM 更新後修正滾動位置（用於需要查詢新 DOM 狀態的情況）
 */
function adjustScrollAfterDomUpdate(
  ctx: ZoomContext,
  anchor: { pageIndex: number; ratioX: number; ratioY: number },
  viewportAnchorX: number,
  viewportAnchorY: number
): void {
  const { scrollContainer: root, getPageCardElement } = ctx
  const cardEl = getPageCardElement(anchor.pageIndex)

  if (!cardEl) return

  const { top: cardTop, left: cardLeft } = getAbsolutePosition(cardEl, root)
  const cardWidth = cardEl.offsetWidth
  const cardHeight = cardEl.offsetHeight

  const targetScrollTop = cardTop + (cardHeight * anchor.ratioY) - viewportAnchorY

  let targetScrollLeft = 0
  if (root.scrollWidth > root.clientWidth) {
    targetScrollLeft = cardLeft + (cardWidth * anchor.ratioX) - viewportAnchorX
  }

  root.scrollTop = targetScrollTop
  root.scrollLeft = targetScrollLeft
}

export interface ZoomState {
  /** 當前視圖模式 */
  viewMode: Ref<ViewMode>
  /** actual 模式下的縮放目標值（百分比） */
  zoomTarget: Ref<number>
  /** fit 模式下顯示的縮放百分比 */
  displayFitPercent: Ref<number | null>
  /** 當前顯示的縮放值（計算屬性） */
  displayZoom: Ref<number>
  /** 是否可以繼續放大 */
  canZoomIn: Ref<boolean>
  /** 是否可以繼續縮小 */
  canZoomOut: Ref<boolean>

  /**
   * 核心縮放 API：設定縮放值並維持視覺錨點
   * @param newZoom 新的縮放百分比
   * @param ctx 縮放上下文（包含 DOM 引用）
   * @param anchor 錨點類型
   * @param onBeforeApply 在套用縮放前的回調（用於同步計算）
   * @returns Promise，在滾動位置調整完成後 resolve
   */
  setZoom: (
    newZoom: number,
    ctx: ZoomContext | null,
    anchor?: AnchorPoint,
    onBeforeApply?: () => void
  ) => Promise<void>

  /** 放大（便捷方法） */
  zoomIn: (ctx?: ZoomContext | null, anchor?: AnchorPoint) => Promise<void>
  /** 縮小（便捷方法） */
  zoomOut: (ctx?: ZoomContext | null, anchor?: AnchorPoint) => Promise<void>
  /** 以自定義步進值調整縮放 */
  adjustZoomBy: (delta: number, ctx?: ZoomContext | null, anchor?: AnchorPoint) => Promise<void>
  /** 重置為 100% */
  resetZoom: (ctx?: ZoomContext | null, anchor?: AnchorPoint) => Promise<void>
  /** 切換為 fit 模式 */
  setFitMode: (ctx?: ZoomContext | null, anchor?: AnchorPoint) => Promise<void>
  /** 取得 fit 模式的基準百分比 */
  getFitBaseline: () => number
  /** 設定有效的縮放上限（考慮 DPI cap）*/
  setEffectiveMax: (maxZoom: number) => void

  /**
   * 滾輪縮放專用 API
   * 針對觸控板和滑鼠滾輪優化，支援累積 delta 和平滑縮放
   */
  handleWheelZoom: (
    e: WheelEvent,
    ctx: ZoomContext,
    onZoomChange?: () => void
  ) => void

  /** 尋找視覺錨點（暴露給外部使用） */
  findAnchor: typeof findVisualAnchor
}

export function useZoom(options: ZoomOptions = {}): ZoomState {
  const { step = 25, min = 10, max = 400 } = options

  const viewMode = ref<ViewMode>('fit')
  const zoomTarget = ref(100)
  const displayFitPercent = ref<number | null>(null)
  const effectiveMax = ref(max)

  // 滾輪累積器
  let wheelAccumulator = 0
  let wheelRaf: number | null = null

  const displayZoom = computed(() => {
    const value = viewMode.value === 'fit' ? (displayFitPercent.value ?? 100) : zoomTarget.value
    return Math.round(value)
  })

  const canZoomIn = computed(() => {
    if (viewMode.value === 'fit') return true
    return zoomTarget.value < effectiveMax.value
  })

  const canZoomOut = computed(() => {
    if (viewMode.value === 'fit') return true
    return zoomTarget.value > min
  })

  function getFitBaseline(): number {
    const p = Math.round(displayFitPercent.value ?? 100)
    return Math.max(min, Math.min(effectiveMax.value, p))
  }

  function clampZoom(value: number): number {
    return Math.max(min, Math.min(effectiveMax.value, value))
  }

  function setEffectiveMax(maxZoom: number) {
    effectiveMax.value = Math.max(min, Math.min(max, maxZoom))
  }

  /**
   * 核心縮放 API
   */
  async function setZoom(
    newZoom: number,
    ctx: ZoomContext | null,
    anchor: AnchorPoint = { type: 'viewport-center' },
    onBeforeApply?: () => void
  ): Promise<void> {
    const clampedZoom = clampZoom(newZoom)

    // 獲取當前縮放值
    const oldZoom = viewMode.value === 'fit' ? getFitBaseline() : zoomTarget.value

    if (Math.abs(clampedZoom - oldZoom) < 0.1) return

    // 如果沒有提供 context，直接更新狀態
    if (!ctx) {
      viewMode.value = 'actual'
      zoomTarget.value = clampedZoom
      return
    }

    const { scrollContainer: root } = ctx
    const rootRect = root.getBoundingClientRect()

    // 解析錨點
    let resolvedAnchor: { pageIndex: number; ratioX: number; ratioY: number } | null = null
    let viewportAnchorX = rootRect.width / 2
    let viewportAnchorY = rootRect.height / 2

    if (anchor.type === 'viewport-center') {
      const centerX = rootRect.left + rootRect.width / 2
      const centerY = rootRect.top + rootRect.height / 2
      viewportAnchorX = rootRect.width / 2
      viewportAnchorY = rootRect.height / 2
      resolvedAnchor = findVisualAnchor(ctx, centerX, centerY)
    } else if (anchor.type === 'mouse') {
      viewportAnchorX = anchor.clientX - rootRect.left
      viewportAnchorY = anchor.clientY - rootRect.top
      resolvedAnchor = findVisualAnchor(ctx, anchor.clientX, anchor.clientY)
    } else if (anchor.type === 'element') {
      resolvedAnchor = {
        pageIndex: anchor.pageIndex,
        ratioX: anchor.ratioX,
        ratioY: anchor.ratioY
      }
    }

    // 嘗試預計算滾動位置（用於純數學計算的情況）
    const precomputed = precomputeScrollPosition(ctx, anchor, oldZoom, clampedZoom)

    // 執行預先回調
    if (onBeforeApply) onBeforeApply()

    // 更新狀態
    viewMode.value = 'actual'
    zoomTarget.value = clampedZoom

    // 等待 DOM 更新
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        // 如果有預計算結果且不需要查詢新 DOM
        if (precomputed && !resolvedAnchor) {
          root.scrollTop = precomputed.scrollTop
          root.scrollLeft = precomputed.scrollLeft
          resolve()
          return
        }

        // 需要基於新 DOM 計算滾動位置
        if (resolvedAnchor) {
          adjustScrollAfterDomUpdate(ctx, resolvedAnchor, viewportAnchorX, viewportAnchorY)
        } else if (precomputed) {
          root.scrollTop = precomputed.scrollTop
          root.scrollLeft = precomputed.scrollLeft
        }

        resolve()
      })
    })
  }

  async function zoomIn(ctx?: ZoomContext | null, anchor?: AnchorPoint): Promise<void> {
    const currentZoom = viewMode.value === 'fit' ? getFitBaseline() : zoomTarget.value
    return setZoom(currentZoom + step, ctx ?? null, anchor)
  }

  async function zoomOut(ctx?: ZoomContext | null, anchor?: AnchorPoint): Promise<void> {
    const currentZoom = viewMode.value === 'fit' ? getFitBaseline() : zoomTarget.value
    return setZoom(currentZoom - step, ctx ?? null, anchor)
  }

  async function adjustZoomBy(delta: number, ctx?: ZoomContext | null, anchor?: AnchorPoint): Promise<void> {
    const currentZoom = viewMode.value === 'fit' ? getFitBaseline() : zoomTarget.value
    return setZoom(currentZoom + delta, ctx ?? null, anchor)
  }

  async function resetZoom(ctx?: ZoomContext | null, anchor?: AnchorPoint): Promise<void> {
    return setZoom(100, ctx ?? null, anchor ?? { type: 'viewport-center' })
  }

  async function setFitMode(ctx?: ZoomContext | null, anchor?: AnchorPoint): Promise<void> {
    if (viewMode.value === 'fit') return

    if (!ctx) {
      viewMode.value = 'fit'
      return
    }

    const { scrollContainer: root } = ctx
    const rootRect = root.getBoundingClientRect()

    // 解析錨點
    let resolvedAnchor: { pageIndex: number; ratioX: number; ratioY: number } | null = null
    let viewportAnchorY = rootRect.height / 2

    if (!anchor || anchor.type === 'viewport-center') {
      const centerX = rootRect.left + rootRect.width / 2
      const centerY = rootRect.top + rootRect.height / 2
      resolvedAnchor = findVisualAnchor(ctx, centerX, centerY)
    }

    // 切換模式
    viewMode.value = 'fit'

    // 等待 DOM 更新後修正位置
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        if (resolvedAnchor) {
          const cardEl = ctx.getPageCardElement(resolvedAnchor.pageIndex)
          if (cardEl) {
            const { top: cardTop } = getAbsolutePosition(cardEl, root)
            const cardHeight = cardEl.offsetHeight
            const targetScrollTop = cardTop + (cardHeight * resolvedAnchor.ratioY) - viewportAnchorY
            root.scrollTop = targetScrollTop
            root.scrollLeft = 0  // fit 模式通常沒有水平滾動
          }
        }
        resolve()
      })
    })
  }

  /**
   * 滾輪縮放專用處理
   * 修正重點：
   * 1. 解決固定 Margin/Padding 導致的「向下偏移」問題：改用「頁面相對錨點」取代「全域數學公式」
   * 2. 只有當游標指在縫隙(Gap)時，才回退到純數學計算
   */
  function handleWheelZoom(
    e: WheelEvent,
    ctx: ZoomContext,
    onZoomChange?: () => void
  ): void {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()

    wheelAccumulator += e.deltaY

    if (wheelRaf !== null) return

    const { scrollContainer: root, getBaseCssWidth, getPageCardElement } = ctx
    const mouseX = e.clientX
    const mouseY = e.clientY
    const rootRect = root.getBoundingClientRect()

    // --- [修正 1] 在縮放前，精確捕捉滑鼠相對於「特定頁面」的錨點 ---
    const hitEl = document.elementFromPoint(mouseX, mouseY)
    const cardEl = hitEl?.closest('.bg-card') as HTMLElement | null
    const pageWrapper = cardEl?.closest('[data-pdf-page]') as HTMLElement | null
    const pageIndex = (cardEl && pageWrapper) ? Number(pageWrapper.dataset.pdfPage) : -1

    let anchorData: { pageIndex: number; ratioX: number; ratioY: number } | null = null

    // 如果滑鼠指在頁面上，計算相對比例 (0.0 ~ 1.0)
    if (pageIndex >= 0 && cardEl) {
      const rect = cardEl.getBoundingClientRect()
      anchorData = {
        pageIndex,
        ratioX: (mouseX - rect.left) / rect.width,
        ratioY: (mouseY - rect.top) / rect.height,
      }
    }
    // -----------------------------------------------------------

    wheelRaf = requestAnimationFrame(() => {
      wheelRaf = null
      const currentDelta = wheelAccumulator
      wheelAccumulator = 0

      // 1. 決定起始縮放值
      let startZoom = zoomTarget.value
      const wasInFitMode = viewMode.value !== 'actual'

      if (wasInFitMode) {
        if (pageIndex >= 0 && cardEl) {
          const currentCardWidth = cardEl.offsetWidth
          const baseWidth = getBaseCssWidth(pageIndex)
          if (currentCardWidth > 0 && baseWidth && baseWidth > 0) {
            startZoom = (currentCardWidth / baseWidth) * 100
          } else {
            startZoom = Math.round(displayFitPercent.value ?? 100)
          }
        } else {
          startZoom = Math.round(displayFitPercent.value ?? 100)
        }
      }

      // 2. 計算新縮放值
      const sensitivity = 1.0
      const zoomChange = Math.max(-50, Math.min(50, -currentDelta * sensitivity))
      const newZoom = clampZoom(startZoom + zoomChange)

      if (Math.abs(newZoom - startZoom) < 0.1) return

      // 3. 更新狀態
      viewMode.value = 'actual'
      zoomTarget.value = newZoom

      // 4. 使用 nextTick 修正滾動位置
      nextTick(() => {
        const mouseViewportX = mouseX - rootRect.left
        const mouseViewportY = mouseY - rootRect.top

        // --- [修正 2] 根據是否有錨點，決定修正策略 ---
        if (anchorData) {
          // A. 錨點模式 (解決偏移問題)：
          // 找出該頁面新的 DOM 位置，並依據之前的比例還原位置
          const newCardEl = getPageCardElement(anchorData.pageIndex)

          if (newCardEl) {
            const { top, left } = getAbsolutePosition(newCardEl, root)
            const newH = newCardEl.offsetHeight
            const newW = newCardEl.offsetWidth

            // 公式：頁面頂端 + (頁面高度 * 相對比例) - 滑鼠在視窗的位置
            root.scrollTop = top + (newH * anchorData.ratioY) - mouseViewportY

            if (root.scrollWidth > root.clientWidth) {
              root.scrollLeft = left + (newW * anchorData.ratioX) - mouseViewportX
            } else {
              root.scrollLeft = 0
            }
          }
        } else {
          // B. 純數學模式 (Fallback)：
          // 當滑鼠指在縫隙時，回退到原本的邏輯
          const scale = newZoom / startZoom
          const targetScrollTop = (root.scrollTop + mouseViewportY) * scale - mouseViewportY

          let targetScrollLeft = root.scrollLeft
          if (root.scrollWidth <= root.clientWidth) {
            targetScrollLeft = 0
          } else {
            targetScrollLeft = (root.scrollLeft + mouseViewportX) * scale - mouseViewportX
          }

          root.scrollTop = targetScrollTop
          root.scrollLeft = targetScrollLeft
        }

        if (onZoomChange) onZoomChange()
      })
    })
  }

  return {
    viewMode,
    zoomTarget,
    displayFitPercent,
    displayZoom,
    canZoomIn,
    canZoomOut,
    setZoom,
    zoomIn,
    zoomOut,
    adjustZoomBy,
    resetZoom,
    setFitMode,
    getFitBaseline,
    setEffectiveMax,
    handleWheelZoom,
    findAnchor: findVisualAnchor,
  }
}
