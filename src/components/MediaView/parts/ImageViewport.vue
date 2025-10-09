<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'

const media = useMediaStore()
const settings = useSettingsStore()

const viewMode = ref<'fit' | 'actual'>('fit')
const zoomTarget = ref(100)
const displayFitPercent = ref<number | null>(null)
const displayZoom = computed(() => (viewMode.value === 'fit' ? (displayFitPercent.value ?? 100) : zoomTarget.value))
const shouldInvertColors = computed(() => settings.s.theme === 'dark' && settings.s.invertColorsInDarkMode)

const scrollRootEl = ref<HTMLElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const imageNaturalWidth = ref<number | null>(null)

let zoomDebounceTimer: number | null = null
let fitTimer: number | null = null
let resizeObs: ResizeObserver | null = null

function imgTransformStyle() {
  const styles: Record<string, string> = {}
  if (shouldInvertColors.value) {
    styles.filter = 'invert(1) hue-rotate(180deg)'
  }
  return Object.keys(styles).length > 0 ? styles : undefined
}

function fitPercentBaseline(): number {
  const p = Math.round(displayFitPercent.value ?? 100)
  return Math.max(10, Math.min(400, p))
}

function zoomIn() {
  const root = scrollRootEl.value
  const img = imageEl.value
  if (viewMode.value !== 'actual') {
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()  // 從當前 fit 的縮放值開始
    nextTick(() => {
      if (root) {
        root.scrollTop = 0
        root.scrollLeft = 0
      }
    })
  } else if (root && img) {
    // 記錄縮放前的狀態
    const newZoom = Math.min(400, zoomTarget.value + 10)
    
    // 獲取圖片和視窗的實際位置
    const rootRect = root.getBoundingClientRect()
    const imgRect = img.getBoundingClientRect()
    
    // 計算視窗中心點相對於圖片的位置（像素值）
    const viewportCenterX = rootRect.left + rootRect.width / 2
    const viewportCenterY = rootRect.top + rootRect.height / 2
    const offsetX = viewportCenterX - imgRect.left
    const offsetY = viewportCenterY - imgRect.top
    
    // 計算縮放比例
    const zoomRatio = newZoom / zoomTarget.value
    
    zoomTarget.value = newZoom
    
    nextTick(() => {
      requestAnimationFrame(() => {
        // 縮放後重新獲取圖片位置
        const newImgRect = img.getBoundingClientRect()
        const newRootRect = root.getBoundingClientRect()
        
        // 計算縮放後，原本的點應該在哪裡
        const newOffsetX = offsetX * zoomRatio
        const newOffsetY = offsetY * zoomRatio
        const targetCenterX = newImgRect.left + newOffsetX
        const targetCenterY = newImgRect.top + newOffsetY
        
        // 調整滾動位置使中心點保持不變
        const scrollAdjustX = targetCenterX - (newRootRect.left + newRootRect.width / 2)
        const scrollAdjustY = targetCenterY - (newRootRect.top + newRootRect.height / 2)
        
        root.scrollLeft += scrollAdjustX
        root.scrollTop += scrollAdjustY
      })
    })
    return
  }
  zoomTarget.value = Math.min(400, zoomTarget.value + 10)
}

function zoomOut() {
  const root = scrollRootEl.value
  const img = imageEl.value
  if (viewMode.value !== 'actual') {
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()  // 從當前 fit 的縮放值開始
    nextTick(() => {
      if (root) {
        root.scrollTop = 0
        root.scrollLeft = 0
      }
    })
  } else if (root && img) {
    // 記錄縮放前的狀態
    const newZoom = Math.max(10, zoomTarget.value - 10)
    
    // 獲取圖片和視窗的實際位置
    const rootRect = root.getBoundingClientRect()
    const imgRect = img.getBoundingClientRect()
    
    // 計算視窗中心點相對於圖片的位置（像素值）
    const viewportCenterX = rootRect.left + rootRect.width / 2
    const viewportCenterY = rootRect.top + rootRect.height / 2
    const offsetX = viewportCenterX - imgRect.left
    const offsetY = viewportCenterY - imgRect.top
    
    // 計算縮放比例
    const zoomRatio = newZoom / zoomTarget.value
    
    zoomTarget.value = newZoom
    
    nextTick(() => {
      requestAnimationFrame(() => {
        // 縮放後重新獲取圖片位置
        const newImgRect = img.getBoundingClientRect()
        const newRootRect = root.getBoundingClientRect()
        
        // 計算縮放後，原本的點應該在哪裡
        const newOffsetX = offsetX * zoomRatio
        const newOffsetY = offsetY * zoomRatio
        const targetCenterX = newImgRect.left + newOffsetX
        const targetCenterY = newImgRect.top + newOffsetY
        
        // 調整滾動位置使中心點保持不變
        const scrollAdjustX = targetCenterX - (newRootRect.left + newRootRect.width / 2)
        const scrollAdjustY = targetCenterY - (newRootRect.top + newRootRect.height / 2)
        
        root.scrollLeft += scrollAdjustX
        root.scrollTop += scrollAdjustY
      })
    })
    return
  }
  zoomTarget.value = Math.max(10, zoomTarget.value - 10)
}

function resetZoom() {
  viewMode.value = 'actual'
  zoomTarget.value = 100
  const root = scrollRootEl.value
  if (root) {
    nextTick(() => {
      root.scrollTop = 0
      root.scrollLeft = 0
    })
  }
}

function setFitMode() {
  if (viewMode.value !== 'fit') {
    viewMode.value = 'fit'
    const baseline = fitPercentBaseline()
    zoomTarget.value = baseline
  }
  scheduleUpdateFitPercent()
}

function onImageLoad(e: Event) {
  const el = e.target as HTMLImageElement
  imageNaturalWidth.value = el?.naturalWidth || null
  scheduleUpdateFitPercent()
}

function updateFitPercent() {
  if (viewMode.value !== 'fit') return
  const root = scrollRootEl.value
  if (!root) return
  const width = root.clientWidth
  const natural = imageNaturalWidth.value
  if (!width || !natural) return
  displayFitPercent.value = Math.max(5, Math.min(400, Math.round((width / natural) * 100)))
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

watch(viewMode, () => {
  if (viewMode.value === 'fit') {
    scheduleUpdateFitPercent()
  }
})

watch(() => media.imageUrl, () => {
  imageNaturalWidth.value = null
  viewMode.value = 'fit'
  zoomTarget.value = 100
  displayFitPercent.value = null
  scheduleUpdateFitPercent()
})

onMounted(() => {
  const root = scrollRootEl.value
  if (root && 'ResizeObserver' in window) {
    resizeObs = new ResizeObserver(() => {
      scheduleUpdateFitPercent()
    })
    resizeObs.observe(root)
  }
  scheduleUpdateFitPercent()
})

onBeforeUnmount(() => {
  if (zoomDebounceTimer) clearTimeout(zoomDebounceTimer)
  if (fitTimer) clearTimeout(fitTimer)
  try {
    resizeObs?.disconnect()
  } catch {
    /* noop */
  }
})

const currentPage = computed(() => media.imageUrl ? 1 : 0)
const totalPages = computed(() => media.imageUrl ? 1 : 0)

defineExpose({
  viewMode,
  displayZoom,
  currentPage,
  totalPages,
  setFitMode,
  resetZoom,
  zoomIn,
  zoomOut,
})
</script>

<template>
  <div
    ref="scrollRootEl"
    class="flex-1 overflow-auto scrollbar-visible overscroll-y-contain bg-muted min-h-0"
    :class="viewMode === 'fit' ? 'flex items-center justify-center' : ''"
    style="scrollbar-gutter: stable; will-change: scroll-position; overflow-anchor: none;"
    data-image-view
  >
    <div :class="viewMode === 'fit' ? 'w-full px-6 py-10' : 'px-6 py-10'">
      <div
        class="bg-card rounded-md shadow border border-border overflow-hidden mx-auto"
        :class="viewMode === 'fit' ? 'max-w-none w-full' : undefined"
        :style="viewMode === 'actual' && imageNaturalWidth != null ? { width: Math.max(50, Math.round(imageNaturalWidth * (zoomTarget / 100))) + 'px' } : undefined"
      >
        <img
          :src="media.imageUrl || undefined"
          alt="image"
          :class="viewMode === 'fit' ? 'w-full block' : 'block'"
          :style="imgTransformStyle()"
          ref="imageEl"
          @load="onImageLoad"
          @error="media.fallbackLoadImageBlob()"
          draggable="false"
        />
      </div>
    </div>
  </div>
</template>
