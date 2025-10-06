<script setup lang="ts">
import { useMediaStore } from '@/modules/media/store'
const media = useMediaStore()
</script>

<template>
  <div class="p-4 space-y-3">
    <div v-if="media.loading">讀取中…</div>
    <div v-else-if="media.error" class="text-red-600">{{ media.error }}</div>

    <div v-else>
      <div v-if="media.descriptor">
        <div class="text-sm text-gray-600">類型：{{ media.descriptor.type }}，名稱：{{ media.descriptor.name }}，大小：{{ media.descriptor.size ?? '-' }}</div>
      </div>

      <div v-if="media.imageUrl">
        <img :src="media.imageUrl" alt="image" class="max-w-full" @error="media.fallbackLoadImageBlob()" />
      </div>

      <div v-else-if="media.pdfPages && media.pdfPages.length">
        <div class="flex flex-col gap-4">
          <template v-for="(page, idx) in media.pdfPages" :key="idx">
            <img v-if="page && page.contentUrl" :src="page.contentUrl" :alt="`page-` + idx" class="max-w-full" />
          </template>
        </div>
      </div>
    </div>
  </div>
  
</template>
