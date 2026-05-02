<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
import { imageToPdf } from '@/modules/media/service'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { dirname, join } from '@tauri-apps/api/path'
import { useFileListStore } from '@/modules/filelist/store'
import { useZoom, type ZoomContext } from '@/modules/media/useZoom'
import AnnotationLayer from './AnnotationLayer.vue'
import WebGpuImageCanvas from './WebGpuImageCanvas.vue'
import { useAnnotationStore } from '@/modules/annotation/store'
import type { MediaSession } from '@/modules/media/session'

const props = withDefaults(defineProps<{
  media?: MediaSession
  contextMenuMode?: 'default' | 'disabled' | 'custom'
  annotationsEnabled?: boolean
  scrollbarMode?: 'visible' | 'hidden'
  fitStrategy?: 'width' | 'contain'
  layoutDensity?: 'default' | 'compact'
}>(), {
  media: undefined,
  contextMenuMode: 'default',
  annotationsEnabled: true,
  scrollbarMode: 'visible',
  fitStrategy: 'width',
  layoutDensity: 'default',
})

const emit = defineEmits<{
  (e: 'context-menu', payload: { x: number; y: number; filePath: string | null }): void
}>()

const media = props.media ?? useMediaStore()
const settings = useSettingsStore()
const filelist = useFileListStore()
const annotationStore = useAnnotationStore()

const scrollRootEl = ref<HTMLElement | null>(null)
const imageNaturalWidth = ref<number | null>(null)
const imageNaturalHeight = ref<number | null>(null)
const containerWidth = ref(0)
const containerHeight = ref(0)
const menu = ref<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })

// --- 1. 建立 ZoomContext ---
// 這是讓 useZoom 能夠操作此組件的關鍵介面
function createZoomContext(): ZoomContext | null {
  const root = scrollRootEl.value
  if (!root) return null

  return {
    scrollContainer: root,
    // 圖片模式只有一頁 (index 0)，直接回傳包裹圖片的容器
    getPageElement: (_idx) => root.querySelector('[data-image-container]'),
    getPageCardElement: (_idx) => root.querySelector('[data-image-card]'),
    // 圖片的基準寬度就是它的原始寬度
    getBaseCssWidth: (_idx) => imageNaturalWidth.value,
    centerPageIndex: 0, // 永遠是第 0 頁
  }
}

// --- 2. 引入 useZoom ---
const {
  viewMode,
  zoomTarget,
  displayFitPercent,
  displayZoom,
  canZoomIn,
  canZoomOut, // 這些狀態現在由 useZoom 管理
  setFitMode,
  resetZoom,
  zoomIn: doZoomIn,
  zoomOut: doZoomOut,
  setEffectiveMax,
  handleWheelZoom, // 統一的滾輪處理
} = useZoom({
  min: 5,
  max: 800 // 圖片通常容許更大的縮放倍率
})

const clampZoomMax = (v: number | null | undefined) => {
  const val = Number.isFinite(v) ? Number(v) : 400
  return Math.min(800, Math.max(50, Math.round(val)))
}
const zoomMax = computed(() => clampZoomMax(settings.s.zoomMaxPercent))
watch(zoomMax, (v) => setEffectiveMax(v), { immediate: true })

const shouldInvertColors = computed(() => settings.actualTheme === 'dark' && settings.s.invertColorsInDarkMode)
const isCompactLayout = computed(() => props.layoutDensity === 'compact')
const fitHorizontalPadding = computed(() => isCompactLayout.value ? 8 : 48)
const fitVerticalPadding = computed(() => isCompactLayout.value ? 8 : 80)
const imageContainerClass = computed(() =>
  viewMode.value === 'fit'
    ? (isCompactLayout.value
      ? 'w-full px-1 py-1 flex justify-center items-center min-h-full'
      : 'w-full px-6 py-10 flex justify-center items-center min-h-full')
    : (isCompactLayout.value
      ? 'px-1 py-1 inline-flex min-w-full justify-center flex-shrink-0 items-center min-h-full'
      : 'px-6 py-10 inline-flex min-w-full justify-center flex-shrink-0 items-center min-h-full')
)
const imageActualBottomSpacing = computed(() => isCompactLayout.value ? 8 : 40)

function getContainFitMetrics() {
  const naturalW = imageNaturalWidth.value
  const naturalH = imageNaturalHeight.value
  if (!naturalW || !naturalH) return null

  const width = containerWidth.value || scrollRootEl.value?.clientWidth || 0
  const height = containerHeight.value || scrollRootEl.value?.clientHeight || 0
  if (width <= 0 || height <= 0) return null

  const availableW = Math.max(100, width - fitHorizontalPadding.value)
  const availableH = Math.max(100, height - fitVerticalPadding.value)
  const scale = Math.min(availableW / naturalW, availableH / naturalH)

  return {
    percent: Math.max(5, Math.min(800, Math.round(scale * 100))),
    width: naturalW * scale,
    height: naturalH * scale,
  }
}

// 計算圖片卡片樣式 - 直接使用 zoomTarget 確保響應式更新
const imageCardStyle = computed(() => {
  if (viewMode.value === 'fit') {
    if (props.fitStrategy !== 'contain') return undefined
    const metrics = getContainFitMetrics()
    if (!metrics) return undefined
    return { width: `${metrics.width}px` }
  }

  if (imageNaturalWidth.value == null) return undefined
  const width = imageNaturalWidth.value * (zoomTarget.value / 100)
  return { width: `${width}px` }
})

// --- 事件處理 ---

function onImageContextMenu(e: MouseEvent) {
  e.preventDefault()
  if (props.contextMenuMode === 'disabled') return
  if (props.contextMenuMode === 'custom') {
    emit('context-menu', {
      x: e.clientX,
      y: e.clientY,
      filePath: media.selected?.path ?? null,
    })
    return
  }
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

async function convertImageToPdfFromMenu() {
  closeMenu()
  const d = media.descriptor
  if (!d || d.type !== 'image') return
  const base = (d.name?.replace(/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i, '') || 'image') + '.pdf'
  const suggested = await join(await dirname(d.path), base)
  const picked = await saveDialog({ defaultPath: suggested, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (!picked) return
  try {
    const res = await imageToPdf({ srcPath: d.path, destPath: picked })
    try { filelist.add(res.path) } catch {}
    await media.selectPath(res.path)
  } catch (e: any) {
    alert(e?.message || String(e))
  }
}

// --- 縮放封裝函數 (對接 activeControls) ---

function handleZoomIn() {
  const ctx = createZoomContext()
  doZoomIn(ctx, { type: 'viewport-center' })
}

function handleZoomOut() {
  const ctx = createZoomContext()
  doZoomOut(ctx, { type: 'viewport-center' })
}

function handleResetZoom() {
  const ctx = createZoomContext()
  resetZoom(ctx, { type: 'viewport-center' })
}

async function handleSetFitMode() {
  const ctx = createZoomContext()
  await setFitMode(ctx, { type: 'viewport-center' })
  scheduleUpdateFitPercent()
}

function handleWheel(e: WheelEvent) {
  // 讓 useZoom 接管滾輪
  const ctx = createZoomContext()
  if (ctx) {
    handleWheelZoom(e, ctx)
  }
}

// --- 監聽與生命週期 ---

let fitTimer: number | null = null

function syncContainerMetrics() {
  const root = scrollRootEl.value
  const width = root?.clientWidth || 0
  const height = root?.clientHeight || 0
  if (width !== containerWidth.value) containerWidth.value = width
  if (height !== containerHeight.value) containerHeight.value = height
}

function updateFitPercent() {
  if (viewMode.value !== 'fit') return
  const naturalW = imageNaturalWidth.value
  const naturalH = imageNaturalHeight.value
  if (!naturalW || !naturalH) return

  syncContainerMetrics()

  const width = containerWidth.value || scrollRootEl.value?.clientWidth || 0
  if (width <= 0) return

  if (props.fitStrategy === 'contain') {
    const metrics = getContainFitMetrics()
    if (!metrics) return
    displayFitPercent.value = metrics.percent
    return
  }

  const availableW = Math.max(100, width - fitHorizontalPadding.value)
  displayFitPercent.value = Math.max(5, Math.min(800, Math.round((availableW / naturalW) * 100)))
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

function onWebGpuImageReady(payload: { width: number; height: number }) {
  imageNaturalWidth.value = payload.width || null
  imageNaturalHeight.value = payload.height || null
  syncContainerMetrics()
  scheduleUpdateFitPercent()
}

function onWebGpuImageError() {
  void media.fallbackLoadImageBlob()
}

// Annotation layer support
function getAnnotationLayerProps() {
  const naturalW = imageNaturalWidth.value
  const naturalH = imageNaturalHeight.value
  if (!naturalW || !naturalH) return null

  // Calculate display size based on view mode and zoom
  let displayWidth: number
  let displayHeight: number

  if (viewMode.value === 'fit') {
    if (props.fitStrategy === 'contain') {
      const metrics = getContainFitMetrics()
      if (!metrics) return null
      displayWidth = metrics.width
      displayHeight = metrics.height
    } else {
      const containerW = containerWidth.value || scrollRootEl.value?.clientWidth || 800
      displayWidth = containerW - fitHorizontalPadding.value
      displayHeight = displayWidth * (naturalH / naturalW)
    }
  } else {
    // In actual mode, use zoom target
    displayWidth = naturalW * (zoomTarget.value / 100)
    displayHeight = naturalH * (zoomTarget.value / 100)
  }

  // Use natural dimensions as "PDF points" for coordinate conversion
  return {
    pageIndex: 0,
    displayWidth,
    displayHeight,
    pageWidthPt: naturalW,
    pageHeightPt: naturalH,
  }
}

function shouldRenderAnnotationLayer(): boolean {
  if (!props.annotationsEnabled) return false
  return annotationStore.activeTool !== null || annotationStore.getPageAnnotations(0).length > 0
}

// 當視窗大小改變 (ResizeObserver)
let resizeObs: ResizeObserver | null = null
onMounted(() => {
  const root = scrollRootEl.value
  if (root) {
    // 【關鍵修正 1】：解決觸控板變成下滑的問題
    // 設定 passive: false，讓 preventDefault() 生效
    root.addEventListener('wheel', handleWheel, { passive: false })

    syncContainerMetrics()

    if ('ResizeObserver' in window) {
      resizeObs = new ResizeObserver(() => {
        syncContainerMetrics()
        scheduleUpdateFitPercent()
      })
      resizeObs.observe(root)
    }
  }
  window.addEventListener('click', onGlobalClick, { capture: true })
  window.addEventListener('keydown', onEsc)
  scheduleUpdateFitPercent()
})

onBeforeUnmount(() => {
  if (fitTimer) clearTimeout(fitTimer)
  try { resizeObs?.disconnect() } catch {}
  window.removeEventListener('click', onGlobalClick, { capture: true })
  window.removeEventListener('keydown', onEsc)
  scrollRootEl.value?.removeEventListener('wheel', handleWheel)
})

// 當圖片路徑改變時，重置為 Fit 模式
watch(() => media.imageUrl, () => {
  imageNaturalWidth.value = null
  imageNaturalHeight.value = null
  viewMode.value = 'fit'
  zoomTarget.value = 100
  displayFitPercent.value = null
  scheduleUpdateFitPercent()
})

watch(
  () => [media.descriptor?.path, media.descriptor?.width, media.descriptor?.height] as const,
  ([, width, height]) => {
    if (media.descriptor?.type !== 'image') return
    imageNaturalWidth.value = width || null
    imageNaturalHeight.value = height || null
    syncContainerMetrics()
    scheduleUpdateFitPercent()
  },
  { immediate: true },
)

watch(() => media.descriptor?.path, () => closeMenu())

// 曝露給父層使用
defineExpose({
  viewMode,
  displayZoom,
  currentPage: computed(() => media.imageUrl ? 1 : 0),
  totalPages: computed(() => media.imageUrl ? 1 : 0),
  canZoomIn,
  canZoomOut,
  setFitMode: handleSetFitMode,
  resetZoom: handleResetZoom,
  zoomIn: handleZoomIn,
  zoomOut: handleZoomOut,
})
</script>

<template>
  <div
    ref="scrollRootEl"
    class="flex-1 overflow-auto overscroll-y-contain bg-muted min-h-0"
    :class="props.scrollbarMode === 'hidden' ? 'scrollbar-hidden' : 'scrollbar-visible'"
    :style="{
      'scrollbar-gutter': props.scrollbarMode === 'hidden' ? 'auto' : 'stable',
      'will-change': 'scroll-position',
      'overflow-anchor': 'none',
      '--zoom-factor': zoomTarget / 100 
    }"
    data-image-view
    @contextmenu.prevent="onImageContextMenu"
  >
    <div
      :class="imageContainerClass"
      :style="viewMode === 'actual' ? { marginBottom: `calc(${imageActualBottomSpacing}px * var(--zoom-factor))` } : undefined"
      data-image-container
      data-pdf-page="0"
    >
      <div
        class="bg-card rounded-md shadow border border-border overflow-hidden flex-shrink-0 relative"
        :class="viewMode === 'fit' ? 'max-w-none w-full' : undefined"
        :style="imageCardStyle"
        data-image-card
      >
        <WebGpuImageCanvas
          v-if="media.imageUrl"
          :src="media.imageUrl"
          :invert="shouldInvertColors"
          :class="viewMode === 'fit' ? 'w-full block' : 'block'"
          :style="viewMode === 'actual' ? { width: '100%' } : undefined"
          aria-label="image"
          @ready="onWebGpuImageReady"
          @error="onWebGpuImageError"
          draggable="false"
        />
        <!-- Annotation layer (SVG overlay for annotations) -->
        <AnnotationLayer
          v-if="shouldRenderAnnotationLayer() && getAnnotationLayerProps()"
          v-bind="getAnnotationLayerProps()!"
        />
      </div>
    </div>
  </div>
  
  <teleport to="body">
    <div
      v-if="props.contextMenuMode === 'default' && menu.open"
      data-image-context-menu
      class="fixed z-[2000] bg-card border border-border rounded shadow text-sm w-max"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    >
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap" @click="convertImageToPdfFromMenu">
        轉成 PDF…
      </button>
    </div>
  </teleport>
</template>
