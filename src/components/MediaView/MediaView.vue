<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
const media = useMediaStore()
const settings = useSettingsStore()

const totalPages = computed(() => media.descriptor?.pages ?? 0)

let io: IntersectionObserver | null = null
const refs = new Map<Element, number>()

function observe(el: Element | null, idx: number) {
  if (!el) return
  refs.set(el, idx)
  io?.observe(el)
}

onMounted(() => {
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const idx = refs.get(e.target)
        if (idx != null) {
          const el = e.target as HTMLElement
          const containerW = Math.max(200, el.clientWidth)
          const dpr = Math.min((window.devicePixelRatio || 1), settings.s.dprCap)
          const baseW = settings.s.targetWidthPolicy === 'container' ? containerW : settings.s.baseWidth
          const hiW = Math.floor(baseW * dpr)
          const loW = Math.floor(baseW * settings.s.lowQualityScale * dpr)
          if (settings.s.lowQualityFirst) {
            media.renderPdfPage(idx, loW, settings.s.lowQualityFormat, settings.s.lowQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100))
            setTimeout(() => media.renderPdfPage(idx, hiW, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100)), settings.s.highQualityDelayMs)
          } else {
            media.renderPdfPage(idx, hiW, settings.s.highQualityFormat, settings.s.highQualityFormat === 'jpeg' ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100))
          }
        }
      }
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
          >
            <img v-if="media.pdfPages[idx-1]?.contentUrl" :src="media.pdfPages[idx-1]!.contentUrl" :alt="`page-` + (idx-1)" class="max-w-full" />
            <div v-else class="w-full aspect-[1/1.414] bg-gray-100 animate-pulse rounded"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
</template>
