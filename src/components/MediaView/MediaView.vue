<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
const media = useMediaStore()
const settings = useSettingsStore()

const totalPages = computed(() => media.descriptor?.pages ?? 0)
const isPdf = computed(() => media.descriptor?.type === 'pdf')
// 檢視模式與縮放
const viewMode = ref<'fit' | 'actual'>('fit')
// A.4: transform-based live zoom
const zoomTarget = ref(100) // 使用者即時目標倍率（顯示用）
const zoomApplied = ref(100) // 實際套用於布局寬度的倍率（debounce 套用）
// 顯示用百分比：fit 以容器寬相對 96dpi 的等效百分比顯示
const displayFitPercent = ref<number | null>(null)
const displayZoom = computed(() => viewMode.value === 'fit' ? (displayFitPercent.value ?? 100) : zoomTarget.value)
function dprForMode() {
  return viewMode.value === 'fit' ? Math.min((window.devicePixelRatio || 1), settings.s.dprCap) : 1
}
function dpiForActual() {
  const dpi = Math.max(24, Math.round(96 * (zoomApplied.value / 100)))
  const cap = Math.max(48, settings.s.actualDpiCap || dpi)
  return Math.min(dpi, cap)
}
function fitPercentBaseline(): number {
  // 使用已計算的顯示百分比為基準，不可用時回退 100
  const p = Math.round(displayFitPercent.value ?? 100)
  return Math.max(10, Math.min(400, p))
}
function scheduleZoomApply() {
  if (zoomDebounceTimer) { clearTimeout(zoomDebounceTimer); zoomDebounceTimer = null }
  const ms = Math.max(120, Math.min(300, settings.s.highQualityDelayMs || 180))
  zoomDebounceTimer = window.setTimeout(() => {
    zoomDebounceTimer = null
    if (viewMode.value === 'actual') {
      // 停止互動後才套用實際寬度並觸發高清重繪
      zoomApplied.value = zoomTarget.value
      pendingIdx.clear();
      for (let i = visibleStart.value; i <= visibleEnd.value; i++) pendingIdx.add(i)
      scheduleHiResRerender(0)
    }
  }, ms)
}
function zoomIn() {
  if (viewMode.value !== 'actual') {
    // 由 fit 切換到 actual 時，以當前 fit 百分比作為起始縮放
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()
    zoomApplied.value = zoomTarget.value
  }
  zoomTarget.value = Math.min(400, zoomTarget.value + 10)
  scheduleZoomApply()
}
function zoomOut() {
  if (viewMode.value !== 'actual') {
    viewMode.value = 'actual'
    zoomTarget.value = fitPercentBaseline()
    zoomApplied.value = zoomTarget.value
  }
  zoomTarget.value = Math.max(10, zoomTarget.value - 10)
  scheduleZoomApply()
}
function resetZoom() {
  viewMode.value = 'actual'
  zoomTarget.value = 100
  zoomApplied.value = 100
  pendingIdx.clear();[...visibleIdx].forEach(i => pendingIdx.add(i)); rafScheduled = false; scheduleHiResRerender(0)
}
function setFitMode() {
  if (viewMode.value !== 'fit') {
    viewMode.value = 'fit'
    pendingIdx.clear();[...visibleIdx].forEach(i => pendingIdx.add(i)); rafScheduled = false; scheduleHiResRerender(0)
  }
}
const centerIndex = ref(0)
// 減少一次掛載的頁面數量（固定小範圍 overscan，與 highRadius 解耦）
const RENDER_OVERSCAN = 3
const HIREZ_OVERSCAN = 2
const renderRadius = computed(() => RENDER_OVERSCAN)
const currentPage = computed(() => {
  const tp = totalPages.value
  if (!tp || tp <= 0) return 0
  return Math.min(tp, Math.max(1, centerIndex.value + 1))
})

// 可編輯的頁碼輸入（僅在有 totalPages 時顯示）
const pageInput = ref<string>('1')
const pageEditing = ref(false)
watch(currentPage, (p) => {
  if (!pageEditing.value) pageInput.value = String(p || 1)
})
onMounted(() => { pageInput.value = String(currentPage.value || 1) })

async function gotoPage(page: number) {
  const tp = totalPages.value || 0
  if (tp <= 0) return
  const idx = Math.min(tp - 1, Math.max(0, Math.floor(page) - 1))
  centerIndex.value = idx
  await nextTick()
  const root = scrollRootEl.value
  const el = root?.querySelector(`[data-pdf-page="${idx}"]`) as HTMLElement | null
  if (el) {
    el.scrollIntoView({ block: 'center' })
    pendingIdx.add(idx); scheduleProcess()
  } else {
    // 回退：以估計高度捲動到大致位置
    const approximateTop = Math.max(0, Math.round(idx * estimateHeight.value))
    root?.scrollTo({ top: approximateTop })
    pendingIdx.add(idx); scheduleProcess()
  }
}

async function commitPageInput() {
  pageEditing.value = false
  const tp = totalPages.value || 0
  if (tp <= 0) return
  const raw = (pageInput.value || '').replace(/[^0-9]/g, '')
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) { pageInput.value = String(currentPage.value || 1); return }
  const clamped = Math.max(1, Math.min(tp, n))
  pageInput.value = String(clamped)
  if (clamped !== currentPage.value) await gotoPage(clamped)
}
function currentCenterCssWidth(): number {
  const d = media.descriptor
  if (!d) return containerW.value || 800
  if (viewMode.value === 'fit') return containerW.value || 800
  if (d.type === 'pdf') {
    const base = media.baseCssWidthAt100(centerIndex.value)
    if (base) return Math.max(50, base * (zoomApplied.value / 100))
    return containerW.value || 800
  }
  if (d.type === 'image') {
    return Math.max(50, imageNaturalWidth.value ? imageNaturalWidth.value * (zoomApplied.value / 100) : (containerW.value || 800))
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
let resizeObs: ResizeObserver | null = null
const scrollRootEl = ref<HTMLElement | null>(null)
const refs = new Map<Element, number>()
let rafScheduled = false
const pendingIdx = new Set<number>()
const visibleIdx = new Set<number>()
const containerW = ref(0)
let hiResTimer: number | null = null
let zoomDebounceTimer: number | null = null
let preloadStartTimer: number | null = null
let idleHandle: number | null = null
let preloadQueue: number[] = []
let preloadingPaused = false

// 以 scrollTop 估算可見區域（O(1)）；避免逐一量測 DOM
const visibleStart = ref(0)
const visibleEnd = ref(0)
let scrollRaf = 0 as number | 0
function updateVisibleByScroll() {
  const root = scrollRootEl.value
  const tp = totalPages.value || 0
  if (!root || tp <= 0) return
  const est = Math.max(1, estimateHeight.value)
  const top = root.scrollTop
  const mid = top + root.clientHeight / 2
  const last = tp - 1
  const ci = Math.max(0, Math.min(last, Math.floor(mid / est)))
  centerIndex.value = ci
  media.setPriorityIndex(ci)
  // 可見區域 + 小範圍 overscan
  const start = Math.max(0, Math.floor(top / est) - HIREZ_OVERSCAN)
  const end = Math.min(last, Math.floor((top + root.clientHeight) / est) + HIREZ_OVERSCAN)
  visibleStart.value = start
  visibleEnd.value = end
  // 強制限制隊列在可見區間附近
  media.enforceVisibleRange(start, end)
}
function onScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0 as any
    updateVisibleByScroll()
    scheduleHiResRerender()
  })
}

function scheduleHiResRerender(delay?: number) {
  if (hiResTimer) { clearTimeout(hiResTimer); hiResTimer = null }
  const ms = typeof delay === 'number' ? delay : (settings.s.highQualityDelayMs || 120)
  hiResTimer = window.setTimeout(() => {
    // 僅針對「可見 + 小範圍 overscan」發出高清重繪請求
    const tp = totalPages.value || 0
    if (tp <= 0) { hiResTimer = null; return }
    const start = Math.max(0, visibleStart.value)
    const end = Math.min(tp - 1, visibleEnd.value)
    const hiStart = Math.max(0, start)
    const hiEnd = Math.min(tp - 1, end)
    pendingIdx.clear()
    for (let i = hiStart; i <= hiEnd; i++) pendingIdx.add(i)
    rafScheduled = false
    scheduleProcess()
    hiResTimer = null
  }, ms)
}

function cancelIdle() {
  if (idleHandle != null) {
    const ric = (window as any).cancelIdleCallback as ((id: number) => void) | undefined
    if (ric) ric(idleHandle)
    else clearTimeout(idleHandle)
    idleHandle = null
  }
}

function buildPreloadQueue() {
  preloadQueue = []
  const tp = totalPages.value || 0
  if (tp <= 0) return
  if (settings.s.preloadAllPages) {
    for (let i = 0; i < tp; i++) preloadQueue.push(i)
  } else {
    const r = Math.max(0, settings.s.preloadRange)
    // 以中心為基準交錯擴散：c, c+1, c-1, c+2, c-2, ...
    const c = Math.min(tp - 1, Math.max(0, centerIndex.value))
    preloadQueue.push(c)
    for (let k = 1; k <= r; k++) {
      const a = c + k
      const b = c - k
      if (a < tp) preloadQueue.push(a)
      if (b >= 0) preloadQueue.push(b)
    }
    // 去重後保序
    const seen = new Set<number>()
    preloadQueue = preloadQueue.filter(i => (seen.has(i) ? false : (seen.add(i), true)))
  }
}

function schedulePreloadStart() {
  if (!totalPages.value || media.loading) return
  if (preloadStartTimer) { clearTimeout(preloadStartTimer); preloadStartTimer = null }
  preloadStartTimer = window.setTimeout(() => {
    buildPreloadQueue()
    scheduleIdle()
  }, Math.max(0, settings.s.preloadStartDelayMs || 0))
}

function scheduleIdle() {
  cancelIdle()
  if (preloadingPaused) return
  const ric = (window as any).requestIdleCallback as ((cb: any, opts?: { timeout: number }) => number) | undefined
  const cb = (deadline: any) => processPreloadBatch(deadline)
  if (ric) {
    const timeout = Math.max(1000, settings.s.preloadIdleMs || 0)
    idleHandle = ric(cb, { timeout })
  } else {
    idleHandle = window.setTimeout(() => cb({ timeRemaining: () => 12, didTimeout: true }), 16)
  }
}

function processPreloadBatch(deadline: { timeRemaining?: () => number, didTimeout?: boolean }) {
  if (!preloadQueue.length || preloadingPaused) return
  const fmt = settings.s.highQualityFormat
  const q = (fmt === 'jpeg') ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100)
  const batch = Math.max(1, settings.s.preloadBatchSize || 2)
  const baseW = settings.s.targetWidthPolicy === 'container'
    ? (containerW.value || settings.s.baseWidth || 1200)
    : settings.s.baseWidth
  const preloadDpr = Math.min(dprForMode(), Math.max(0.5, settings.s.preloadDprCap || 1.0))
  const fitHiW = Math.min(
    Math.max(200, Math.floor(baseW * preloadDpr)),
    Math.max(320, settings.s.maxTargetWidth || 2147483647)
  )
  let n = 0
  const canContinue = () => (deadline?.timeRemaining ? deadline.timeRemaining() > 8 : true) && n < batch
  while (preloadQueue.length && canContinue() && !preloadingPaused) {
    const i = preloadQueue.shift()!
    if (viewMode.value === 'actual') {
      media.renderPdfPage(i, undefined, fmt, q, dpiForActual())
    } else {
      media.renderPdfPage(i, fitHiW, fmt, q)
    }
    n++
  }
  if (preloadQueue.length && !preloadingPaused) scheduleIdle()
}

function observe(el: Element | null, idx: number) {
  if (!el) return
  refs.set(el, idx)
  io?.observe(el)
}

function scheduleProcess() {
  if (rafScheduled) return
  rafScheduled = true
  requestAnimationFrame(() => {
    const list = Array.from(pendingIdx)
    pendingIdx.clear()
    rafScheduled = false
    // 依據可見區間 + highRadius 計算實際要處理的集合
    const tp = totalPages.value || 0
    if (tp <= 0) return
    const center = centerIndex.value
    const rangeHigh = settings.s.highRadius
    const start = Math.max(0, Math.min(visibleStart.value, center - rangeHigh))
    const end = Math.min(tp - 1, Math.max(visibleEnd.value, center + rangeHigh))
    media.enforceVisibleRange(start, end)
    const allowed = new Set<number>()
    for (let i = start; i <= end; i++) allowed.add(i)
    const work = list.filter(idx => allowed.has(idx))
    for (const idx of work) {
      // 只量測一次中心頁的寬度，避免大量 reflow
      if (idx === center) {
        const root = scrollRootEl.value
        const el = root?.querySelector(`[data-pdf-page="${center}"]`) as HTMLElement | null
        const cW = Math.max(200, el?.clientWidth || 800)
        containerW.value = cW
      }
      const cW = containerW.value || 800
      if (viewMode.value === 'actual') {
        media.renderPdfPage(idx, undefined, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100), dpiForActual())
      } else {
        const dpr = dprForMode()
        const baseW = settings.s.targetWidthPolicy === 'container' ? cW : settings.s.baseWidth
        const hiW = Math.min(
          Math.floor(baseW * dpr),
          Math.max(320, settings.s.maxTargetWidth || 2147483647)
        )
        media.renderPdfPage(idx, hiW, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100))
      }
    }
  })
}

onMounted(() => {
  // 監聽滾動，採用 scrollTop + 估算高度的 O(1) 計算
  scrollRootEl.value?.addEventListener('scroll', onScroll, { passive: true })
  // 初始化可見區域與中心
  updateVisibleByScroll()
  // 容器寬度監控（避免在 scroll handler 中頻繁量測）
  if (scrollRootEl.value && 'ResizeObserver' in window) {
    resizeObs = new ResizeObserver(() => {
      const w = scrollRootEl.value?.clientWidth || 0
      if (w > 0) containerW.value = w
      scheduleUpdateFitPercent()
      scheduleHiResRerender()
    })
    resizeObs.observe(scrollRootEl.value)
  }
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const idx = refs.get(e.target)
      if (idx == null) continue
      if (e.isIntersecting) {
        pendingIdx.add(idx)
        visibleIdx.add(idx)
      } else {
        // 離開視窗，取消排隊並盡量取消 inflight（提升 gen + 通知後端）
        media.cancelQueued(idx)
        try { media.cancelInflight(idx) } catch {}
        visibleIdx.delete(idx)
      }
    }
    scheduleProcess()
  }, { root: scrollRootEl.value, rootMargin: settings.prefetchRootMargin, threshold: 0.01 })
  // 既有元素補 observe（限本容器）
  scrollRootEl.value?.querySelectorAll('[data-pdf-page]').forEach((el) => {
    const idx = Number((el as HTMLElement).dataset.pdfPage)
    if (Number.isFinite(idx)) {
      refs.set(el as Element, idx)
      io?.observe(el as Element)
    }
  })
  // 預載互動暫停/恢復
  const root = scrollRootEl.value
  const pausePreload = () => {
    if (!settings.s.pausePreloadOnInteraction) return
    preloadingPaused = true
    cancelIdle()
    // 不清空佇列，僅暫停；避免來回浪費
    // 立即優先處理當前可見頁，避免可見區域長時間灰階
    pendingIdx.clear();
    for (const i of visibleIdx) pendingIdx.add(i)
    scheduleProcess()
  }
  const resumePreload = () => {
    if (!settings.s.pausePreloadOnInteraction) return
    preloadingPaused = false
    schedulePreloadStart()
  }
  root?.addEventListener('wheel', pausePreload, { passive: true })
  root?.addEventListener('pointerdown', pausePreload, { passive: true })
  root?.addEventListener('scroll', pausePreload, { passive: true })
  root?.addEventListener('pointerup', resumePreload, { passive: true })
  // 初始排程背景預加載（延遲）
  schedulePreloadStart()
})

onBeforeUnmount(() => {
  io?.disconnect()
  refs.clear()
  cancelIdle()
  scrollRootEl.value?.removeEventListener('scroll', onScroll)
  try { resizeObs?.disconnect() } catch {}
})

// 當檢視模式變更時，延遲請求高清重渲染，避免連續縮放卡頓
watch(viewMode, () => { scheduleHiResRerender() })
watch([viewMode, centerIndex, containerW, () => settings.s.preloadAllPages, () => settings.s.preloadRange, () => settings.s.preloadIdleMs, () => settings.s.preloadBatchSize, () => settings.s.preloadStartDelayMs], () => {
  schedulePreloadStart()
})

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
    } catch { }
    return
  }
  // PDF：查詢頁面點數寬並換算 96dpi 的 CSS 寬
  if (d.type === 'pdf') {
    const idx = centerIndex.value
    const cachedBase = media.baseCssWidthAt100(idx)
    // 以可用的實際輸出上限校正：有效 CSS 寬 = min(containerW, maxTargetWidth / dprUsed)
    const dprUsed = Math.min((window.devicePixelRatio || 1), settings.s.dprCap)
    const maxCssByCap = Math.max(1, Math.floor((settings.s.maxTargetWidth || Number.MAX_SAFE_INTEGER) / Math.max(0.5, dprUsed)))
    const effectiveCssW = Math.min(cW, maxCssByCap)
    if (cachedBase && cachedBase > 0) {
      displayFitPercent.value = Math.max(5, Math.min(400, Math.round((effectiveCssW / cachedBase) * 100)))
      return
    }
    // 若未快取，嘗試抓取一次並更新
    const sz = await media.getPageSizePt(idx)
    if (sz) {
      const base = sz.widthPt * (96 / 72)
      if (base > 0) {
        displayFitPercent.value = Math.max(5, Math.min(400, Math.round((effectiveCssW / base) * 100)))
      }
    }
  }
}

// Debounce fit 百分比更新，避免量測風暴
let fitTimer: number | null = null
function scheduleUpdateFitPercent() {
  if (fitTimer) { clearTimeout(fitTimer); fitTimer = null }
  fitTimer = window.setTimeout(() => { fitTimer = null; updateFitPercent() }, 150)
}
watch([viewMode, centerIndex, containerW, () => settings.s.maxTargetWidth, () => settings.s.dprCap], () => { scheduleUpdateFitPercent() })
onMounted(() => { scheduleUpdateFitPercent() })

// 監看 zoomApplied 以影響估高與寬度布局（debounce 後才更新）
watch(zoomApplied, () => { /* no-op: 讓依賴更新 */ })

function pageCardStyle(idx: number) {
  const baseStyle: any = { contentVisibility: 'auto', containIntrinsicSize: '800px 1131px' }
  if (viewMode.value === 'fit') return baseStyle
  const d = media.descriptor
  if (!d) return baseStyle
  if (d.type === 'pdf') {
    const base = media.baseCssWidthAt100(idx)
    if (base) return { ...baseStyle, width: `${Math.max(50, Math.round(base * (zoomApplied.value / 100)))}px` }
    return baseStyle
  }
  if (d.type === 'image') {
    if (imageNaturalWidth.value) return { ...baseStyle, width: `${Math.max(50, Math.round(imageNaturalWidth.value * (zoomApplied.value / 100)))}px` }
    return baseStyle
  }
  return baseStyle
}

const liveScale = computed(() => viewMode.value === 'actual' ? Math.max(0.1, zoomTarget.value / Math.max(1, zoomApplied.value)) : 1)
function imgTransformStyle() {
  if (viewMode.value !== 'actual') return undefined
  const s = liveScale.value
  if (!Number.isFinite(s) || s === 1) return undefined
  return { transform: `scale(${s})`, transformOrigin: 'top left' }
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
  <div class="h-full flex flex-col">
    <div v-if="settings.s.devPerfOverlay"
      class="fixed bottom-2 right-2 z-50 pointer-events-none bg-black/75 text-white text-xs px-2 py-1 rounded shadow">
      <span v-if="isPdf">p {{ currentPage }} / {{ totalPages }} · </span>
      inflight: {{ media.inflightCount }} · queued: {{ media.queue.length }}
    </div>

    <!-- 工具列：黏在 MediaView 頂部（不覆蓋左側欄），永遠貼齊頂端 -->
    <div class="sticky top-0 z-20 bg-background/90 backdrop-blur border-b shrink-0">
      <div class="px-4 py-2 flex items-center justify-between gap-3 min-w-0">
        <div class="text-sm text-[hsl(var(--muted-foreground))]">檢視</div>
        <div class="flex items-center gap-4 pr-4 flex-wrap justify-end min-w-0">
          <!-- 頁碼顯示：永遠在按鈕群左側，未載入時顯示 0/0，不被遮擋 -->
          <div class="flex items-center text-sm tabular-nums text-[hsl(var(--muted-foreground))] whitespace-nowrap">
            <template v-if="isPdf && totalPages > 0">
              <input type="text" inputmode="numeric" pattern="[0-9]*"
                class="w-16 px-2 py-1 text-sm text-center rounded border bg-white text-[hsl(var(--foreground))]"
                v-model="pageInput" @focus="pageEditing = true" @blur="commitPageInput"
                @keydown.enter.prevent="commitPageInput" aria-label="頁碼" />
              <span class="mx-1">/</span>
              <span>{{ totalPages }}</span>
            </template>
            <template v-else>
              <span>0</span>
              <span class="mx-1">/</span>
              <span>0</span>
            </template>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button @click="setFitMode"
              class="text-sm rounded border whitespace-nowrap w-16 h-8 flex items-center justify-center"
              :class="viewMode === 'fit' ? 'bg-[hsl(var(--accent))]' : 'bg-white'">最佳符合</button>

            <button @click="resetZoom"
              class="text-sm rounded border whitespace-nowrap w-16 h-8 flex items-center justify-center"
              :class="viewMode === 'actual' ? 'bg-[hsl(var(--accent))]' : 'bg-white'">實際大小</button>
          </div>
          <div class="flex items-center gap-2">
            <button @click="zoomOut" class="px-2 py-1 text-sm rounded border bg-white">-</button>
            <div class="min-w-[56px] text-center text-sm">{{ displayZoom }}%</div>
            <button @click="zoomIn" class="px-2 py-1 text-sm rounded border bg-white">+</button>
          </div>
        </div>
      </div>
    </div>

    <div ref="scrollRootEl"
      class="flex-1 overflow-y-scroll overflow-x-hidden scrollbar-visible overscroll-y-contain"
      style="scrollbar-gutter: stable;">
      <div class="p-4 space-y-3">
        <div v-if="media.loading">讀取中…</div>
        <div v-else-if="media.error" class="text-red-600">{{ media.error }}</div>
        <div v-else>
          <div v-if="media.imageUrl" class="w-full min-h-full bg-neutral-200 pt-4 pb-10" data-image-view>
            <div class="w-full flex justify-center">
              <div :class="['mx-auto px-6', viewMode === 'fit' ? 'max-w-none w-full' : 'max-w-none w-auto']">
                <div class="bg-white rounded-md shadow border border-neutral-200 overflow-auto" :style="pageCardStyle(0)">
                  <img :src="media.imageUrl" alt="image" :class="viewMode === 'fit' ? 'w-full block' : 'block'"
                    :style="imgTransformStyle()" ref="imageEl" @load="onImageLoad" @error="media.fallbackLoadImageBlob()"
                    draggable="false" />
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="totalPages" class="w-full min-h-full bg-neutral-200 pt-4 pb-10">
            <div :style="{ height: topSpacerHeight + 'px' }"></div>
            <div v-for="idx in renderIndices" :key="idx" class="w-full mb-10 flex justify-center"
              :style="viewMode === 'actual' ? { marginBottom: Math.round(40 * (zoomApplied / 100)) + 'px' } : undefined"
              :data-pdf-page="idx" :ref="el => observe(el as Element, idx)">
              <div :class="['mx-auto px-6', viewMode === 'fit' ? 'max-w-none w-full' : 'max-w-none w-auto']">
                <div
                  :class="['bg-white rounded-md shadow border border-neutral-200', viewMode === 'fit' ? 'overflow-hidden' : 'overflow-visible']"
                  :style="pageCardStyle(idx)">
                  <img v-if="media.pdfPages[idx]?.contentUrl" :src="media.pdfPages[idx]!.contentUrl" :alt="`page-` + idx"
                    :class="viewMode === 'fit' ? 'w-full block' : 'block'" :style="imgTransformStyle()" decoding="async"
                    loading="lazy" draggable="false" />
                  <div v-else class="w-full aspect-[1/1.414] bg-gray-100 animate-pulse"></div>
                </div>
                <div class="mt-3 text-xs text-[hsl(var(--muted-foreground))] text-center">第 {{ idx + 1 }} 頁</div>
              </div>
            </div>
            <div :style="{ height: bottomSpacerHeight + 'px' }"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
