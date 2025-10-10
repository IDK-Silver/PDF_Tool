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
 * 策略：記錄視窗中心在滾動內容中的位置，縮放後維持該位置在視窗中心
 */
function preserveVisualCenter(
  scrollContainer: HTMLElement | null,
  _currentPageIndex: number, // 保留用於介面兼容，實際不使用
  oldZoom: number,
  newZoom: number,
  callback: () => void,
  onComplete?: () => void
) {
  if (!scrollContainer || oldZoom === newZoom) {
    callback()
    if (onComplete) {
      requestAnimationFrame(() => onComplete())
    }
    return
  }

  // 記錄縮放前的滾動狀態
  const scrollLeft = scrollContainer.scrollLeft
  const scrollTop = scrollContainer.scrollTop
  const clientWidth = scrollContainer.clientWidth
  const clientHeight = scrollContainer.clientHeight

  // 計算視窗中心點在滾動內容中的絕對位置
  const centerX = scrollLeft + clientWidth / 2
  const centerY = scrollTop + clientHeight / 2

  // 執行縮放
  callback()

  // 在下一幀調整滾動位置
  requestAnimationFrame(() => {
    // 計算縮放比例
    const scale = newZoom / oldZoom

    // 縮放後，原來的中心點應該在新位置
    const newCenterX = centerX * scale
    const newCenterY = centerY * scale

    // 計算新的滾動位置，使中心點保持在視窗中心
    scrollContainer.scrollLeft = newCenterX - clientWidth / 2
    scrollContainer.scrollTop = newCenterY - clientHeight / 2

    // 呼叫完成回調
    if (onComplete) {
      requestAnimationFrame(() => onComplete())
    }
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
      
      // 使用 preserveVisualCenter 維持視覺中心，而不是 centerCurrentPage
      preserveVisualCenter(scrollContainer ?? null, currentPageIndex, baseline, newZoom, () => {
        viewMode.value = 'actual'
        zoomTarget.value = newZoom
      }, onComplete)
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
