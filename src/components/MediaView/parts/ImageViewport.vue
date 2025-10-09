<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
import { openInFileManager } from '@/modules/media/openInFileManager'

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
const menu = ref<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })

let zoomDebounceTimer: number | null = null
let fitTimer: number | null = null
let resizeObs: ResizeObserver | null = null

function onImageContextMenu(e: MouseEvent) {
  e.preventDefault()
  menu.value = { open: true, x: e.clientX, y: e.clientY }
}

function closeMenu() {
  menu.value.open = false
}

function onGlobalClick(e: MouseEvent) {
  if (!menu.value.open) return
  const target = e.target as HTMLElement | null
  const inMenu = target?.closest('[data-image-context-menu]')
  if (!inMenu) {
    closeMenu()
  }
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeMenu()
  }
}

async function revealInFileManagerFromMenu() {
  const path = media.descriptor?.path
  closeMenu()
  if (!path) return
  try {
    await openInFileManager(path)
  } catch (err) {
    console.error('展示檔案於檔案管理器失敗', err)
    alert('無法在檔案管理器中開啟此檔案。')
  }
}

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
    const oldZoom = zoomTarget.value
    const newZoom = Math.min(400, oldZoom + 10)
    const zoomRatio = newZoom / oldZoom
    
    // 記錄當前滾動位置和視窗中心點
    const oldScrollLeft = root.scrollLeft
    const oldScrollTop = root.scrollTop
    const viewportCenterX = root.clientWidth / 2
    const viewportCenterY = root.clientHeight / 2
    
    // 視窗中心點在內容中的位置
    const contentCenterX = oldScrollLeft + viewportCenterX
    const contentCenterY = oldScrollTop + viewportCenterY
    
    zoomTarget.value = newZoom
    
    nextTick(() => {
      requestAnimationFrame(() => {
        // 計算縮放後的內容中心點位置
        const newContentCenterX = contentCenterX * zoomRatio
        const newContentCenterY = contentCenterY * zoomRatio
        
        // 計算新的滾動位置，使中心點保持不變
        root.scrollLeft = newContentCenterX - viewportCenterX
        root.scrollTop = newContentCenterY - viewportCenterY
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
    const oldZoom = zoomTarget.value
    const newZoom = Math.max(10, oldZoom - 10)
    const zoomRatio = newZoom / oldZoom
    
    // 記錄當前滾動位置和視窗中心點
    const oldScrollLeft = root.scrollLeft
    const oldScrollTop = root.scrollTop
    const viewportCenterX = root.clientWidth / 2
    const viewportCenterY = root.clientHeight / 2
    
    // 視窗中心點在內容中的位置
    const contentCenterX = oldScrollLeft + viewportCenterX
    const contentCenterY = oldScrollTop + viewportCenterY
    
    zoomTarget.value = newZoom
    
    nextTick(() => {
      requestAnimationFrame(() => {
        // 計算縮放後的內容中心點位置
        const newContentCenterX = contentCenterX * zoomRatio
        const newContentCenterY = contentCenterY * zoomRatio
        
        // 計算新的滾動位置，使中心點保持不變
        root.scrollLeft = newContentCenterX - viewportCenterX
        root.scrollTop = newContentCenterY - viewportCenterY
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

function handleWheel(e: WheelEvent) {
  // 檢測觸控板縮放手勢（Ctrl + wheel 或 pinch）
  if (!e.ctrlKey && !e.metaKey) return
  
  e.preventDefault()
  
  const root = scrollRootEl.value
  const img = imageEl.value
  if (!root || !img) return
  
  // 確保在 actual 模式
  if (viewMode.value !== 'actual') {
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()
  }
  
  // 計算縮放變化量（觸控板的 deltaY 通常較小，需要調整靈敏度）
  const delta = -e.deltaY
  const sensitivity = 0.5  // 調整靈敏度
  let zoomChange = delta * sensitivity
  
  // 限制每次變化量
  zoomChange = Math.max(-20, Math.min(20, zoomChange))
  
  const oldZoom = zoomTarget.value
  const newZoom = Math.max(10, Math.min(400, oldZoom + zoomChange))
  
  // 如果沒有實際變化，直接返回
  if (Math.abs(newZoom - oldZoom) < 0.1) return
  
  const zoomRatio = newZoom / oldZoom
  
  // 記錄當前滾動位置
  const oldScrollLeft = root.scrollLeft
  const oldScrollTop = root.scrollTop
  
  // 滑鼠在視窗中的位置（相對於 scrollRoot）
  const rootRect = root.getBoundingClientRect()
  const mouseViewportX = e.clientX - rootRect.left
  const mouseViewportY = e.clientY - rootRect.top
  
  // 滑鼠在內容中的位置
  const mouseContentX = oldScrollLeft + mouseViewportX
  const mouseContentY = oldScrollTop + mouseViewportY
  
  zoomTarget.value = newZoom
  
  nextTick(() => {
    requestAnimationFrame(() => {
      // 計算縮放後，滑鼠下的點在內容中的新位置
      const newMouseContentX = mouseContentX * zoomRatio
      const newMouseContentY = mouseContentY * zoomRatio
      
      // 計算新的滾動位置，使滑鼠下的點保持不變
      root.scrollLeft = newMouseContentX - mouseViewportX
      root.scrollTop = newMouseContentY - mouseViewportY
    })
  })
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
  window.addEventListener('click', onGlobalClick, { capture: true })
  window.addEventListener('keydown', onEsc)
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
  window.removeEventListener('click', onGlobalClick, { capture: true })
  window.removeEventListener('keydown', onEsc)
})

const currentPage = computed(() => media.imageUrl ? 1 : 0)
const totalPages = computed(() => media.imageUrl ? 1 : 0)

watch(() => media.descriptor?.path, () => closeMenu())

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
    @wheel="handleWheel"
    @contextmenu.prevent="onImageContextMenu"
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
  <teleport to="body">
    <div
      v-if="menu.open"
      data-image-context-menu
      class="fixed z-[2000] bg-card border border-border rounded shadow text-sm w-max"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    >
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="revealInFileManagerFromMenu">
        在檔案管理器中開啟
      </button>
    </div>
  </teleport>
</template>
