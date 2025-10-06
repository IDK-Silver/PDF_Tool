<script setup lang="ts">
import { ref } from 'vue'
import { analyzeMedia, pdfInfo, pdfRenderPage, toContentUrl } from '@/modules/media/service'
import type { MediaDescriptor, PageRender } from '@/modules/media/types'

const inputPath = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const descriptor = ref<MediaDescriptor | null>(null)
const imageUrl = ref<string | null>(null)
const pdfFirstPage = ref<PageRender | null>(null)

async function load() {
  loading.value = true
  error.value = null
  imageUrl.value = null
  pdfFirstPage.value = null
  descriptor.value = null
  try {
    const d = await analyzeMedia(inputPath.value)
    descriptor.value = d
    if (d.type === 'image') {
      imageUrl.value = toContentUrl(d.path)
    } else if (d.type === 'pdf') {
      await pdfInfo(d.path) // ensure lazy init & check
      const page0 = await pdfRenderPage({ path: d.path, pageIndex: 0, scale: 1.0, format: 'png' })
      pdfFirstPage.value = page0
    }
  } catch (e: any) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="p-4 space-y-3">
    <div class="flex gap-2 items-center">
      <input v-model="inputPath" class="flex-1 border rounded px-2 py-1" placeholder="輸入檔案完整路徑 (PDF 或圖片)" />
      <button class="border rounded px-3 py-1" @click="load" :disabled="!inputPath || loading">載入</button>
    </div>

    <div v-if="loading">讀取中…</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>

    <div v-else>
      <div v-if="descriptor">
        <div class="text-sm text-gray-600">類型：{{ descriptor.type }}，名稱：{{ descriptor.name }}，大小：{{ descriptor.size ?? '-' }}</div>
      </div>

      <div v-if="imageUrl">
        <img :src="imageUrl" alt="image" class="max-w-full" />
      </div>

      <div v-else-if="pdfFirstPage?.contentUrl">
        <img :src="pdfFirstPage.contentUrl" alt="page-0" class="max-w-full" />
      </div>
    </div>
  </div>
  
</template>
