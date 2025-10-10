<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useCompressionStore } from '@/modules/compress/store'
import CompressionToolbar from './parts/CompressionToolbar.vue'
import PdfCompressPane from './parts/PdfCompressPane.vue'
import ImageCompressPane from './parts/ImageCompressPane.vue'
import { useMediaStore } from '@/modules/media/store'
import { getFileSize, formatFileSize } from '@/modules/media/fileSize'

const compression = useCompressionStore()
const media = useMediaStore()

onMounted(() => {
  compression.ensureTabForSelection()
})

// 單一來源真理：從 media.descriptor 取得類型
const fileType = computed(() => media.descriptor?.type)
const isPdf = computed(() => fileType.value === 'pdf')
const isImage = computed(() => fileType.value === 'image')
const hasValidFile = computed(() => isPdf.value || isImage.value)
const fileName = computed(() => media.selected?.name ?? '')
const filePath = computed(() => media.selected?.path ?? '')

// 檔案大小
const fileSize = ref<number | null>(null)
const fileSizeText = computed(() => 
  fileSize.value !== null ? formatFileSize(fileSize.value) : '...'
)

// 當檔案變更時重新讀取大小
watch(filePath, async (path) => {
  if (!path) {
    fileSize.value = null
    return
  }
  fileSize.value = await getFileSize(path)
}, { immediate: true })

function onStart() { compression.start() }
function onCancel() { compression.cancel() }
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 僅在有有效檔案時顯示標題列 -->
    <header 
      v-if="hasValidFile"
      class="px-3 pt-3 pb-2 border-b border-[hsl(var(--border))] flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4"
    >
      <div class="text-sm">
        <span class="mr-2">模式：</span>
        <span class="px-2 py-0.5 rounded bg-[hsl(var(--selection))]">
          {{ isPdf ? 'PDF 壓縮' : '圖片壓縮' }}
        </span>
      </div>
      <div class="sm:ml-auto flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs text-[hsl(var(--muted-foreground))] w-full sm:w-auto">
        <div class="flex items-center gap-2">
          <span class="font-medium">檔案大小：</span>
          <span class="font-mono">{{ fileSizeText }}</span>
        </div>
        <div class="truncate max-w-full sm:max-w-xs sm:text-right">
          {{ fileName }}
        </div>
      </div>
    </header>

    <!-- 僅在有有效檔案時顯示工具列 -->
    <CompressionToolbar
      v-if="hasValidFile"
      class="border-b border-[hsl(var(--border))]"
      :running="compression.running"
      :selected-name="fileName"
      @start="onStart"
      @cancel="onCancel"
    />

    <!-- 內容區：根據檔案類型顯示對應面板 -->
    <div class="flex-1 min-h-0 overflow-auto p-4">
      <PdfCompressPane v-if="isPdf" />
      <ImageCompressPane v-else-if="isImage" />
      <div v-else class="h-full flex items-center justify-center">
        <div class="text-center text-[hsl(var(--muted-foreground))]">
          <p class="text-sm">請在左側選擇 PDF 或圖片檔案以開始壓縮</p>
        </div>
      </div>
    </div>
  </div>
</template>
