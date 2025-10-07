<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
const media = useMediaStore()
const settings = useSettingsStore()

const totalPages = computed(() => media.descriptor?.pages ?? 0)
// 檢視模式與縮放
const viewMode = ref<'fit'|'actual'>('fit')
const zoom = ref(100)
// 顯示用百分比：fit 以容器寬相對 96dpi 的等效百分比顯示
const displayFitPercent = ref<number | null>(null)
const displayZoom = computed(() => viewMode.value === 'fit' ? (displayFitPercent.value ?? 100) : zoom.value)
function dprForMode() {
  return viewMode.value === 'fit' ? Math.min((window.devicePixelRatio || 1), settings.s.dprCap) : 1
}
function dpiForActual() {
  return Math.max(24, Math.round(96 * (zoom.value / 100)))
}
function zoomIn() {
  if (viewMode.value !== 'actual') viewMode.value = 'actual'
  zoom.value = Math.min(400, zoom.value + 10)
  pendingIdx.clear(); [...visibleIdx].forEach(i => pendingIdx.add(i)); rafScheduled = false; scheduleHiResRerender()
}
function zoomOut() {
  if (viewMode.value !== 'actual') viewMode.value = 'actual'
  zoom.value = Math.max(10, zoom.value - 10)
  pendingIdx.clear(); [...visibleIdx].forEach(i => pendingIdx.add(i)); rafScheduled = false; scheduleHiResRerender()
}
function resetZoom() {
  viewMode.value = 'actual'
  zoom.value = 100
  pendingIdx.clear(); [...visibleIdx].forEach(i => pendingIdx.add(i)); rafScheduled = false; scheduleHiResRerender()
}
function setFitMode() {
  if (viewMode.value !== 'fit') {
    viewMode.value = 'fit'
    pendingIdx.clear(); [...visibleIdx].forEach(i => pendingIdx.add(i)); rafScheduled = false; scheduleHiResRerender()
  }
}
const centerIndex = ref(0)
const renderRadius = computed(() => Math.max(6, settings.s.highRadius + 6))
function currentCenterCssWidth(): number {
  const d = media.descriptor
  if (!d) return containerW.value || 800
  if (viewMode.value === 'fit') return containerW.value || 800
  if (d.type === 'pdf') {
    const base = media.baseCssWidthAt100(centerIndex.value)
    if (base) return Math.max(50, base * (zoom.value / 100))
    return containerW.value || 800
  }
  if (d.type === 'image') {
    return Math.max(50, imageNaturalWidth.value ? imageNaturalWidth.value * (zoom.value / 100) : (containerW.value || 800))
  }
  return containerW.value || 800
}

const estimateHeight = computed(() => {
  const anyEl = [...refs.keys()][0] as HTMLElement | undefined
  const cw = currentCenterCssWidth() || Math.max(200, anyEl?.clientWidth || 800)
  return Math.round(cw * 1.414) + 24 // A4 比例 + 頁間 padding 預估
})
const renderStart = computed(() => Math.max(0, centerIndex.value - renderRadius.value))
const renderEnd = computed(() => Math.min((totalPages.value || 1) - 1, centerIndex.value + renderRadius.value))
const renderCount = computed(() => Math.max(0, renderEnd.value - renderStart.value + 1))
const renderIndices = computed(() => Array.from({ length: renderCount.value }, (_, i) => renderStart.value + i))
const topSpacerHeight = computed(() => renderStart.value * estimateHeight.value)
const bottomSpacerHeight = computed(() => Math.max(0, (totalPages.value - renderEnd.value - 1)) * estimateHeight.value)

let io: IntersectionObserver | null = null
const refs = new Map<Element, number>()
let rafScheduled = false
const pendingIdx = new Set<number>()
const visibleIdx = new Set<number>()
const containerW = ref(0)
let hiResTimer: number | null = null

function scheduleHiResRerender(delay?: number) {
  if (hiResTimer) { clearTimeout(hiResTimer); hiResTimer = null }
  const ms = typeof delay === 'number' ? delay : (settings.s.highQualityDelayMs || 120)
  hiResTimer = window.setTimeout(() => {
    // 僅將中心附近的頁加入待渲染，避免一次大量請求
    const center = computeCenterIndex()
    const rangeHigh = settings.s.highRadius
    const allowed = new Set<number>()
    if (center >= 0) {
      for (let i = Math.max(0, center - rangeHigh); i <= Math.min(totalPages.value - 1, center + rangeHigh); i++) {
        allowed.add(i)
      }
    }
    pendingIdx.clear()
    for (const i of visibleIdx) {
      if (allowed.size === 0 || allowed.has(i)) pendingIdx.add(i)
    }
    rafScheduled = false; scheduleProcess()
    hiResTimer = null
  }, ms)
}

function observe(el: Element | null, idx: number) {
  if (!el) return
  refs.set(el, idx)
  io?.observe(el)
}

function computeCenterIndex(): number {
  let center = -1
  const viewportCenter = window.innerHeight / 2
  let bestDelta = Number.POSITIVE_INFINITY
  for (const [el, idx] of refs.entries()) {
    if (!visibleIdx.has(idx)) continue
    const r = (el as HTMLElement).getBoundingClientRect()
    const elCenter = r.top + r.height / 2
    const d = Math.abs(elCenter - viewportCenter)
    if (d < bestDelta) { bestDelta = d; center = idx }
  }
  return center
}

function scheduleProcess() {
  if (rafScheduled) return
  rafScheduled = true
  requestAnimationFrame(() => {
    const list = Array.from(pendingIdx)
    pendingIdx.clear()
    rafScheduled = false
    // 計算中心頁索引（從目前可見頁中找與視窗中心最近者）
    let center = -1
    const viewportCenter = window.innerHeight / 2
    let bestDelta = Number.POSITIVE_INFINITY
    for (const [el, idx] of refs.entries()) {
      if (!visibleIdx.has(idx)) continue
      const r = (el as HTMLElement).getBoundingClientRect()
      const elCenter = r.top + r.height / 2
      const d = Math.abs(elCenter - viewportCenter)
      if (d < bestDelta) { bestDelta = d; center = idx }
    }
    if (center >= 0) centerIndex.value = center

    // 僅渲染中心頁附近的少量頁，避免小縮放時一次大量請求
    const rangeHigh = settings.s.highRadius
    const allowed = new Set<number>()
    if (center >= 0) {
      for (let i = Math.max(0, center - rangeHigh); i <= Math.min(totalPages.value - 1, center + rangeHigh); i++) {
        allowed.add(i)
      }
    }
    const work = list.filter(idx => allowed.size === 0 ? true : allowed.has(idx))
    for (const idx of work) {
      const el = [...refs.entries()].find(([, i]) => i === idx)?.[0] as HTMLElement | undefined
      const cW = Math.max(200, el?.clientWidth || 800)
      if (idx === centerIndex.value) containerW.value = cW
      if (viewMode.value === 'actual') {
        media.renderPdfPage(idx, undefined, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100), dpiForActual())
      } else {
        const dpr = dprForMode()
        const baseW = settings.s.targetWidthPolicy === 'container' ? cW : settings.s.baseWidth
        const hiW = Math.floor(baseW * dpr)
        media.renderPdfPage(idx, hiW, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100))
      }
    }
  })
}

onMounted(() => {
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const idx = refs.get(e.target)
      if (idx == null) continue
      if (e.isIntersecting) {
        pendingIdx.add(idx)
        visibleIdx.add(idx)
      } else {
        // 離開視窗，取消排隊的任務
        media.cancelQueued(idx)
        visibleIdx.delete(idx)
      }
    }
    scheduleProcess()
  }, { root: null, rootMargin: settings.prefetchRootMargin, threshold: 0.01 })
  // 既有元素補 observe
  document.querySelectorAll('[data-pdf-page]').forEach((el, i) => {
    refs.set(el as Element, i)
    io?.observe(el as Element)
  })
})

onBeforeUnmount(() => {
  io?.disconnect()
  refs.clear()
})

// 當檢視模式變更時，延遲請求高清重渲染，避免連續縮放卡頓
watch(viewMode, () => { scheduleHiResRerender() })

// 動態計算「最佳符合」對應的實際大小百分比（以 96dpi 為 100% 基準）
async function updateFitPercent() {
  if (viewMode.value !== 'fit') return
  const d = media.descriptor
  if (!d) return
  // 需要中心頁與容器寬度
  const cW = containerW.value
  if (!cW) return
  // 圖片：以原始像素寬為 100% 基準
  if (d.type === 'image') {
    try {
      const imgEl = document.querySelector('[data-image-view] img') as HTMLImageElement | null
      if (imgEl && imgEl.naturalWidth > 0) {
        displayFitPercent.value = Math.max(5, Math.min(400, Math.round((cW / imgEl.naturalWidth) * 100)))
      }
    } catch {}
    return
  }
  // PDF：查詢頁面點數寬並換算 96dpi 的 CSS 寬
  if (d.type === 'pdf') {
    const idx = centerIndex.value
    const cachedBase = media.baseCssWidthAt100(idx)
    if (cachedBase && cachedBase > 0) {
      displayFitPercent.value = Math.max(5, Math.min(400, Math.round((cW / cachedBase) * 100)))
      return
    }
    // 若未快取，嘗試抓取一次並更新
    const sz = await media.getPageSizePt(idx)
    if (sz) {
      const base = sz.widthPt * (96 / 72)
      if (base > 0) {
        displayFitPercent.value = Math.max(5, Math.min(400, Math.round((cW / base) * 100)))
      }
    }
  }
}

watch([viewMode, centerIndex, containerW], () => { updateFitPercent() })
onMounted(() => { updateFitPercent() })

// 也監看 zoom 用於調整估計高度與卡片寬度（高清重渲染已透過 debounce 控制）
watch(zoom, () => { /* no-op: 僅觸發依賴更新 */ })

function pageCardStyle(idx: number) {
  const baseStyle: any = { contentVisibility: 'auto', containIntrinsicSize: '800px 1131px' }
  if (viewMode.value === 'fit') return baseStyle
  const d = media.descriptor
  if (!d) return baseStyle
  if (d.type === 'pdf') {
    const base = media.baseCssWidthAt100(idx)
    if (base) return { ...baseStyle, width: `${Math.max(50, Math.round(base * (zoom.value / 100)))}px` }
    return baseStyle
  }
  if (d.type === 'image') {
    if (imageNaturalWidth.value) return { ...baseStyle, width: `${Math.max(50, Math.round(imageNaturalWidth.value * (zoom.value / 100)))}px` }
    return baseStyle
  }
  return baseStyle
}

const imageEl = ref<HTMLImageElement | null>(null)
const imageNaturalWidth = ref<number | null>(null)
function onImageLoad(e: Event) {
  const el = e.target as HTMLImageElement
  imageNaturalWidth.value = el?.naturalWidth || null
  updateFitPercent()
}
</script>

<template>
  <div class="p-4 space-y-3">
    <div v-if="settings.s.devPerfOverlay" class="fixed bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
      inflight: {{ media.inflightCount }} · queued: {{ media.queue.length }}
    </div>
    <div v-if="media.loading">讀取中…</div>
    <div v-else-if="media.error" class="text-red-600">{{ media.error }}</div>

    <div v-else>
      <!-- 工具列：固定於視窗頂部，不隨滾動消失 -->
      <div class="fixed top-0 left-0 right-0 z-30 bg-white/90 backdrop-blur border-b">
        <div class="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">檢視</span>
          <button @click="setFitMode" class="px-3 py-1 text-sm rounded border" :class="viewMode==='fit' ? 'bg-[hsl(var(--accent))]' : 'bg-white'">最佳符合</button>
          <button @click="resetZoom" class="px-3 py-1 text-sm rounded border" :class="viewMode==='actual' ? 'bg-[hsl(var(--accent))]' : 'bg-white'">實際大小</button>
          <div class="ml-4 flex items-center gap-2">
            <button @click="zoomOut" class="px-2 py-1 text-sm rounded border bg-white">-</button>
            <div class="min-w-[56px] text-center text-sm">{{ displayZoom }}%</div>
            <button @click="zoomIn" class="px-2 py-1 text-sm rounded border bg-white">+</button>
          </div>
        </div>
      </div>

      <div v-if="media.imageUrl" class="w-full min-h-full bg-neutral-200 pt-20 pb-10" data-image-view>
        <div class="w-full flex justify-center">
          <div :class="['mx-auto px-6', viewMode==='fit' ? 'max-w-3xl w-full' : 'max-w-none w-auto']">
            <div class="bg-white rounded-md shadow border border-neutral-200 overflow-auto" :style="pageCardStyle(0)">
              <img
                :src="media.imageUrl"
                alt="image"
                :class="viewMode==='fit' ? 'w-full block' : 'block'"
                ref="imageEl"
                @load="onImageLoad"
                @error="media.fallbackLoadImageBlob()"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="totalPages" class="w-full min-h-full bg-neutral-200 pt-20 pb-10">
        <div :style="{ height: topSpacerHeight + 'px' }"></div>
        <div
          v-for="idx in renderIndices"
          :key="idx"
          class="w-full mb-10 flex justify-center"
          :style="viewMode==='actual' ? { marginBottom: Math.round(40 * (zoom/100)) + 'px' } : undefined"
          :data-pdf-page="idx"
          :ref="el => observe(el as Element, idx)"
        >
          <div :class="['mx-auto px-6', viewMode==='fit' ? 'max-w-3xl w-full' : 'max-w-none w-auto']">
            <div
              :class="['bg-white rounded-md shadow border border-neutral-200', viewMode==='fit' ? 'overflow-hidden' : 'overflow-visible']"
              :style="pageCardStyle(idx)"
            >
              <img v-if="media.pdfPages[idx]?.contentUrl" :src="media.pdfPages[idx]!.contentUrl" :alt="`page-` + idx" :class="viewMode==='fit' ? 'w-full block' : 'block'" decoding="async" loading="lazy" />
              <div v-else class="w-full aspect-[1/1.414] bg-gray-100 animate-pulse"></div>
            </div>
            <div class="mt-3 text-xs text-[hsl(var(--muted-foreground))] text-center">第 {{ idx + 1 }} 頁</div>
          </div>
        </div>
        <div :style="{ height: bottomSpacerHeight + 'px' }"></div>
      </div>
    </div>
  </div>
  
</template>
