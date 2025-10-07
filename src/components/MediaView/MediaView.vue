<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
const media = useMediaStore()
const settings = useSettingsStore()

const totalPages = computed(() => media.descriptor?.pages ?? 0)

let io: IntersectionObserver | null = null
const refs = new Map<Element, number>()
let rafScheduled = false
const pendingIdx = new Set<number>()
const visibleIdx = new Set<number>()

function observe(el: Element | null, idx: number) {
  if (!el) return
  refs.set(el, idx)
  io?.observe(el)
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
    if (!rafScheduled) {
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

        for (const idx of list) {
          const el = [...refs.entries()].find(([, i]) => i === idx)?.[0] as HTMLElement | undefined
          const containerW = Math.max(200, el?.clientWidth || 800)
          const dpr = Math.min((window.devicePixelRatio || 1), settings.s.dprCap)
          const baseW = settings.s.targetWidthPolicy === 'container' ? containerW : settings.s.baseWidth
          const hiW = Math.floor(baseW * dpr)
          const loW = Math.floor(baseW * Math.max(0.25, settings.s.lowQualityScale) * dpr)
          if (settings.s.lowQualityFirst) {
            media.renderPdfPage(idx, loW, settings.s.lowQualityFormat, settings.s.lowQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100))
            setTimeout(() => media.renderPdfPage(idx, hiW, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100)), settings.s.highQualityDelayMs)
          } else {
            media.renderPdfPage(idx, hiW, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100))
          }
        }

        // 視窗式暖身渲染：以中心頁為基準，向上下預渲染
        if (center >= 0) {
          const rangeLow = settings.s.lowRadius
          const rangeHigh = settings.s.highRadius
          const indicesLow: number[] = []
          for (let i = Math.max(0, center - rangeLow); i <= Math.min(totalPages.value - 1, center + rangeLow); i++) {
            indicesLow.push(i)
          }
          const indicesHigh: number[] = []
          for (let i = Math.max(0, center - rangeHigh); i <= Math.min(totalPages.value - 1, center + rangeHigh); i++) {
            indicesHigh.push(i)
          }
          // 計算一次寬度
          const anyEl = [...refs.keys()][0] as HTMLElement | undefined
          const containerW = Math.max(200, anyEl?.clientWidth || 800)
          const dpr = Math.min((window.devicePixelRatio || 1), settings.s.dprCap)
          const baseW = settings.s.targetWidthPolicy === 'container' ? containerW : settings.s.baseWidth
          const hiW = Math.floor(baseW * dpr)
          const loW = Math.floor(baseW * Math.max(0.25, settings.s.lowQualityScale) * dpr)

          // 先低清預抓 L
          for (const i of indicesLow) {
            media.renderPdfPage(i, loW, settings.s.lowQualityFormat, settings.s.lowQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100))
          }
          // 停滯延遲後升高清 H（不重複排太多，store 有去重）
          setTimeout(() => {
            for (const i of indicesHigh) {
              media.renderPdfPage(i, hiW, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100))
            }
          }, Math.max(100, settings.s.highQualityDelayMs))
        }
      })
    }
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
</script>

<template>
  <div class="p-4 space-y-3">
    <div v-if="settings.s.devPerfOverlay" class="fixed bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
      inflight: {{ media.inflightCount }} · queued: {{ media.queue.length }}
    </div>
    <div v-if="media.loading">讀取中…</div>
    <div v-else-if="media.error" class="text-red-600">{{ media.error }}</div>

    <div v-else>
      <div v-if="media.descriptor">
        <div class="text-sm text-gray-600">類型：{{ media.descriptor.type }}，名稱：{{ media.descriptor.name }}，大小：{{ media.descriptor.size ?? '-' }}</div>
      </div>

      <div v-if="media.imageUrl">
        <img :src="media.imageUrl" alt="image" class="max-w-full" @error="media.fallbackLoadImageBlob()" />
      </div>

      <div v-else-if="totalPages">
        <div class="flex flex-col gap-4">
          <div
            v-for="idx in totalPages"
            :key="idx-1"
            class="w-full"
            :data-pdf-page="idx-1"
            :ref="el => observe(el as Element, idx-1)"
            style="content-visibility:auto; contain-intrinsic-size: 800px 1131px;"
          >
            <img v-if="media.pdfPages[idx-1]?.contentUrl" :src="media.pdfPages[idx-1]!.contentUrl" :alt="`page-` + (idx-1)" class="max-w-full" decoding="async" loading="lazy" />
            <div v-else class="w-full aspect-[1/1.414] bg-gray-100 animate-pulse rounded"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
</template>
