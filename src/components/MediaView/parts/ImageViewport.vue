<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'

const media = useMediaStore()
const settings = useSettingsStore()

const viewMode = ref<'fit' | 'actual'>('fit')
const zoomTarget = ref(100)
const zoomApplied = ref(100)
const displayFitPercent = ref<number | null>(null)
const displayZoom = computed(() => (viewMode.value === 'fit' ? (displayFitPercent.value ?? 100) : zoomTarget.value))
const liveScale = computed(() => (viewMode.value === 'actual' ? Math.max(0.1, zoomTarget.value / Math.max(1, zoomApplied.value)) : 1))
const shouldInvertColors = computed(() => settings.s.theme === 'dark' && settings.s.invertColorsInDarkMode)

const scrollRootEl = ref<HTMLElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const imageNaturalWidth = ref<number | null>(null)

let zoomDebounceTimer: number | null = null
let fitTimer: number | null = null
let resizeObs: ResizeObserver | null = null

function imgTransformStyle() {
  const transforms: string[] = []
  const styles: Record<string, string> = {}
  if (viewMode.value === 'actual') {
    const s = liveScale.value
    if (Number.isFinite(s) && s !== 1) {
      transforms.push(`scale(${s})`)
      styles.transformOrigin = 'top left'
    }
  }
  if (shouldInvertColors.value) {
    styles.filter = 'invert(1) hue-rotate(180deg)'
  }
  if (transforms.length > 0) {
    styles.transform = transforms.join(' ')
  }
  return Object.keys(styles).length > 0 ? styles : undefined
}

function fitPercentBaseline(): number {
  const p = Math.round(displayFitPercent.value ?? 100)
  return Math.max(10, Math.min(400, p))
}

function scheduleZoomApply() {
  if (zoomDebounceTimer) {
    clearTimeout(zoomDebounceTimer)
    zoomDebounceTimer = null
  }
  const ms = Math.max(120, Math.min(300, settings.s.zoomDebounceMs || 180))
  zoomDebounceTimer = window.setTimeout(() => {
    zoomDebounceTimer = null
    if (viewMode.value !== 'actual') return

    const root = scrollRootEl.value
    const imageContainer = root?.querySelector('[data-image-view]') as HTMLElement | null
    if (!root || !imageContainer) {
      zoomApplied.value = zoomTarget.value
      return
    }
    const oldZoom = zoomApplied.value
    const newZoom = zoomTarget.value
    const zoomRatio = newZoom / oldZoom

    const containerRect = imageContainer.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const viewportCenterX = rootRect.left + rootRect.width / 2
    const viewportCenterY = rootRect.top + rootRect.height / 2
    const offsetX = viewportCenterX - containerRect.left + root.scrollLeft
    const offsetY = viewportCenterY - containerRect.top + root.scrollTop

    zoomApplied.value = newZoom
    nextTick(() => {
      requestAnimationFrame(() => {
        const newOffsetX = offsetX * zoomRatio
        const newOffsetY = offsetY * zoomRatio
        root.scrollLeft = newOffsetX - rootRect.width / 2
        root.scrollTop = newOffsetY - rootRect.height / 2
      })
    })
  }, ms)
}

function zoomIn() {
  if (viewMode.value !== 'actual') {
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()
    zoomApplied.value = zoomTarget.value
    nextTick(() => {
      const root = scrollRootEl.value
      if (root) {
        root.scrollTop = 0
        root.scrollLeft = 0
      }
    })
  }
  zoomTarget.value = Math.min(400, zoomTarget.value + 10)
  scheduleZoomApply()
}

function zoomOut() {
  if (viewMode.value !== 'actual') {
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()
    zoomApplied.value = zoomTarget.value
    nextTick(() => {
      const root = scrollRootEl.value
      if (root) {
        root.scrollTop = 0
        root.scrollLeft = 0
      }
    })
  }
  zoomTarget.value = Math.max(10, zoomTarget.value - 10)
  scheduleZoomApply()
}

function resetZoom() {
  const oldZoom = zoomApplied.value
  viewMode.value = 'actual'
  zoomTarget.value = 100
  zoomApplied.value = 100
  const root = scrollRootEl.value
  if (root) {
    const newZoom = 100
    const zoomRatio = newZoom / oldZoom
    const scrollCenterX = root.scrollLeft + root.clientWidth / 2
    const scrollCenterY = root.scrollTop + root.clientHeight / 2
    nextTick(() => {
      requestAnimationFrame(() => {
        const newScrollCenterX = scrollCenterX * zoomRatio
        const newScrollCenterY = scrollCenterY * zoomRatio
        root.scrollLeft = newScrollCenterX - root.clientWidth / 2
        root.scrollTop = newScrollCenterY - root.clientHeight / 2
      })
    })
  }
}

function setFitMode() {
  if (viewMode.value !== 'fit') {
    viewMode.value = 'fit'
    const baseline = fitPercentBaseline()
    zoomTarget.value = baseline
    zoomApplied.value = baseline
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
  zoomApplied.value = 100
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
    class="flex-1 overflow-auto scrollbar-visible overscroll-y-contain bg-muted flex items-center justify-center min-h-0"
    style="scrollbar-gutter: stable; will-change: scroll-position; overflow-anchor: none;"
    data-image-view
  >
    <div :class="viewMode === 'fit' ? 'w-full px-6 py-10' : 'px-6 py-10'">
      <div
        class="bg-card rounded-md shadow border border-border overflow-hidden mx-auto"
        :class="viewMode === 'fit' ? 'max-w-none w-full' : undefined"
        :style="viewMode === 'actual' && imageNaturalWidth != null ? { width: Math.max(50, Math.round(imageNaturalWidth * (zoomApplied / 100))) + 'px' } : undefined"
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
