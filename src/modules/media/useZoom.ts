/**
 * PDF 縮放管理 composable
 * 統一處理縮放邏輯，避免重複程式碼與複雜的視窗計算
 */
import { ref, computed, type Ref } from 'vue'

export interface ZoomOptions {
  /** 縮放步進值（百分比） */
  step?: number
  /** 最小縮放值 */
  min?: number
  /** 最大縮放值 */
  max?: number
}

export type ViewMode = 'fit' | 'actual'

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
  
  /** 放大 */
  zoomIn: (scrollContainer?: HTMLElement | null, currentPageIndex?: number, onComplete?: () => void) => void
  /** 縮小 */
  zoomOut: (scrollContainer?: HTMLElement | null, currentPageIndex?: number, onComplete?: () => void) => void
  /** 重置為 100% */
  resetZoom: (scrollContainer?: HTMLElement | null) => void
  /** 切換為 fit 模式 */
  setFitMode: () => void
  /** 取得 fit 模式的基準百分比 */
  getFitBaseline: () => number
  /** 設定有效的縮放上限（考慮 DPI cap）*/
  setEffectiveMax: (maxZoom: number) => void
}

/**
 * 計算縮放後要維持的視覺焦點位置
 * 策略：追蹤當前頁面元素的位置，縮放後維持該元素在視窗中的相對位置
 */
function preserveVisualCenter(
  scrollContainer: HTMLElement | null,
  currentPageIndex: number,
  oldZoom: number,
  newZoom: number,
  callback: () => void,
  onComplete?: () => void
) {
  if (!scrollContainer || oldZoom === newZoom) {
    callback()
    if (onComplete) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => onComplete())
        })
      })
    }
    return
  }

  // 找到當前頁面元素
  const pageEl = scrollContainer.querySelector(
    `[data-pdf-page="${currentPageIndex}"]`
  ) as HTMLElement | null

  if (!pageEl) {
    // 找不到元素，直接執行縮放
    callback()
    if (onComplete) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => onComplete())
        })
      })
    }
    return
  }

  // 記錄縮放前的狀態
  const clientWidth = scrollContainer.clientWidth
  const clientHeight = scrollContainer.clientHeight

  // 獲取頁面元素相對於滾動容器的位置
  const containerRect = scrollContainer.getBoundingClientRect()
  const pageRect = pageEl.getBoundingClientRect()

  // 計算視窗中心點相對於頁面元素的偏移量（相對位置）
  const viewportCenterX = containerRect.left + clientWidth / 2
  const viewportCenterY = containerRect.top + clientHeight / 2
  const offsetXFromPage = viewportCenterX - pageRect.left
  const offsetYFromPage = viewportCenterY - pageRect.top

  // 執行縮放
  callback()

  // 使用多層 rAF + setTimeout 確保 DOM 完全更新（Vue 響應式 + CSS 重排 + 瀏覽器渲染）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // 額外的 setTimeout 確保所有同步操作完成
      setTimeout(() => {
        requestAnimationFrame(() => {
          // 獲取縮放後頁面元素的新位置
          const newPageRect = pageEl.getBoundingClientRect()
          const newContainerRect = scrollContainer.getBoundingClientRect()

          // 計算縮放比例
          const scale = newZoom / oldZoom

          // 計算縮放後，原本的偏移量應該是多少
          const newOffsetXFromPage = offsetXFromPage * scale
          const newOffsetYFromPage = offsetYFromPage * scale

          // 計算新的視窗中心點應該在哪裡（相對於視窗）
          const targetCenterX = newPageRect.left + newOffsetXFromPage
          const targetCenterY = newPageRect.top + newOffsetYFromPage

          // 計算當前視窗中心點
          const currentCenterX = newContainerRect.left + clientWidth / 2
          const currentCenterY = newContainerRect.top + clientHeight / 2

          // 計算需要調整的滾動量
          const scrollAdjustX = targetCenterX - currentCenterX
          const scrollAdjustY = targetCenterY - currentCenterY

          // 應用滾動調整
          scrollContainer.scrollLeft += scrollAdjustX
          scrollContainer.scrollTop += scrollAdjustY

          // 呼叫完成回調
          if (onComplete) {
            requestAnimationFrame(() => onComplete())
          }
        })
      }, 0)
    })
  })
}

/**
 * 模式切換時的滾動位置維持
 * 從 fit 切換到 actual 時，將當前頁面置中
 */
function centerCurrentPage(
  scrollContainer: HTMLElement | null,
  currentPageIndex: number
) {
  if (!scrollContainer) return

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const pageEl = scrollContainer.querySelector(
        `[data-pdf-page="${currentPageIndex}"]`
      ) as HTMLElement | null
      
      if (pageEl) {
        pageEl.scrollIntoView({ block: 'center', behavior: 'auto' })
      }
    })
  })
}

export function useZoom(options: ZoomOptions = {}): ZoomState {
  const { step = 10, min = 10, max = 400 } = options

  const viewMode = ref<ViewMode>('fit')
  const zoomTarget = ref(100)
  const displayFitPercent = ref<number | null>(null)
  const effectiveMax = ref(max) // 有效的最大縮放值（考慮 DPI cap）

  const displayZoom = computed(() =>
    viewMode.value === 'fit' ? (displayFitPercent.value ?? 100) : zoomTarget.value
  )

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
   * 執行縮放調整
   * @param delta 縮放變化量（正數放大，負數縮小）
   * @param scrollContainer 滾動容器
   * @param currentPageIndex 當前頁面索引
   * @param onComplete 完成回調
   */
  function adjustZoom(
    delta: number,
    scrollContainer?: HTMLElement | null,
    currentPageIndex: number = 0,
    onComplete?: () => void
  ) {
    // 如果當前在 fit 模式，先切換到 actual 模式並使用 fit 的百分比作為起點
    if (viewMode.value !== 'actual') {
      const baseline = getFitBaseline()
      const newZoom = clampZoom(baseline + delta)
      viewMode.value = 'actual'
      zoomTarget.value = newZoom
      centerCurrentPage(scrollContainer ?? null, currentPageIndex)
      if (onComplete) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => onComplete())
          })
        })
      }
      return
    }

    // 在 actual 模式下，直接調整縮放並維持視覺中心
    const oldZoom = zoomTarget.value
    const newZoom = clampZoom(oldZoom + delta)
    
    preserveVisualCenter(scrollContainer ?? null, currentPageIndex, oldZoom, newZoom, () => {
      zoomTarget.value = newZoom
    }, onComplete)
  }

  function zoomIn(scrollContainer?: HTMLElement | null, currentPageIndex: number = 0, onComplete?: () => void) {
    adjustZoom(step, scrollContainer, currentPageIndex, onComplete)
  }

  function zoomOut(scrollContainer?: HTMLElement | null, currentPageIndex: number = 0, onComplete?: () => void) {
    adjustZoom(-step, scrollContainer, currentPageIndex, onComplete)
  }

  function resetZoom(scrollContainer?: HTMLElement | null) {
    viewMode.value = 'actual'
    zoomTarget.value = 100

    if (scrollContainer) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollContainer.scrollLeft = 0
          scrollContainer.scrollTop = 0
        })
      })
    }
  }

  function setFitMode() {
    if (viewMode.value !== 'fit') {
      viewMode.value = 'fit'
    }
  }

  return {
    viewMode,
    zoomTarget,
    displayFitPercent,
    displayZoom,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    resetZoom,
    setFitMode,
    getFitBaseline,
    setEffectiveMax,
  }
}
