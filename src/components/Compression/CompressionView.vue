<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useCompressionStore } from '@/modules/compress/store'
import CompressionToolbar from './parts/CompressionToolbar.vue'
import PdfCompressPane from './parts/PdfCompressPane.vue'
import ImageCompressPane from './parts/ImageCompressPane.vue'
import { useMediaStore } from '@/modules/media/store'
import { formatFileSize } from '@/modules/media/fileSize'
import { openInFileManager } from '@/modules/media/openInFileManager'
import { FolderOpenIcon, ChevronDoubleRightIcon } from '@heroicons/vue/24/outline'
import { useUiStore } from '@/modules/ui/store'
import missingFile from '@/assets/placeholders/missing-file.jpg'

const compression = useCompressionStore()
const media = useMediaStore()
const ui = useUiStore()

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
const descriptorSize = computed(() => media.descriptor?.size ?? null)

// 當 filelist 有選擇但檔案不存在時，顯示佔位圖
const isFileMissing = computed(() => {
  if (!media.selected) return false
  const msg = media.error || ''
  return msg.includes('檔案不存在') || /not\s*found/i.test(msg)
})

// 檔案大小
const fileSize = ref<number | null>(null)
const fileSizeText = computed(() =>
  fileSize.value !== null ? formatFileSize(fileSize.value) : '...'
)

// 當檔案變更時更新大小（以後端 analyze_media 回傳為準，避免前端 fs 權限問題）
watch([filePath, descriptorSize], ([path, size]) => {
  if (!path) {
    fileSize.value = null
    return
  }
  fileSize.value = (typeof size === 'number' && Number.isFinite(size)) ? size : null
}, { immediate: true })

function onStart() { compression.start() }
function onCancel() { compression.cancel() }
function onExpandSidebar() { ui.setSidebarCollapsed(false) }

async function onReveal() {
  const p = filePath.value
  if (!p) return
  try { await openInFileManager(p) } catch (err) {
    console.error('openInFileManager failed', err)
    alert('無法在檔案管理器顯示該檔案')
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- 僅在有有效檔案時顯示標題列 -->
    <header v-if="hasValidFile"
      class="px-3 pt-3 pb-2 border-b border-[hsl(var(--border))] flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
      <div class="flex items-center gap-2">
        <!-- 展開側欄按鈕，放在模式顯示的左邊 -->
        <button v-if="ui.sidebarCollapsed"
          class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[hsl(var(--selection))] transition"
          title="展開左側欄" aria-label="展開左側欄" @click="onExpandSidebar">
          <ChevronDoubleRightIcon class="w-5 h-5" />

        </button>
        <button
          class="ml-2 inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[hsl(var(--selection))] transition"
          :disabled="!hasValidFile" :title="hasValidFile ? '在檔案管理器顯示' : ''" aria-label="在檔案管理器顯示" @click="onReveal">
          <FolderOpenIcon class="w-5 h-5" />
        </button>
        <div class="flex items-center gap-2">
          <span class="font-medium">檔案大小：</span>
          <span class="font-mono">{{ fileSizeText }}</span>
        </div>
      </div>
      <div
        class="sm:ml-auto flex flex-row items-center gap-3 text-xs text-[hsl(var(--muted-foreground))] w-full sm:w-auto">

        <div class="text-sm">
          <span class="mr-2">模式：</span>
          <span class="px-2 py-0.5 rounded bg-[hsl(var(--selection))]">
            {{ isPdf ? 'PDF 壓縮' : '圖片壓縮' }}
          </span>
        </div>
      </div>
    </header>

    <!-- 工具列：永遠顯示，展開側邊欄按鈕在最左邊 -->
    <CompressionToolbar class="border-b border-[hsl(var(--border))]" :running="compression.running"
      :selected-name="fileName" :hide-actions="isFileMissing" @start="onStart" @cancel="onCancel" />

    <!-- 內容區：根據檔案類型顯示對應面板 -->
    <div class="flex-1 min-h-0 overflow-auto p-4">
      <PdfCompressPane v-if="isPdf" />
      <ImageCompressPane v-else-if="isImage" />
      <div v-else-if="isFileMissing" class="h-full flex items-center justify-center">
        <img :src="missingFile" alt="File not found" class="max-w-[60%] max-h-[60%] opacity-80 select-none" />
      </div>
      <div v-else class="h-full flex items-center justify-center">
        <div class="text-center text-[hsl(var(--muted-foreground))]">
          <p class="text-sm">請在左側選擇 PDF 或圖片檔案以開始壓縮</p>
        </div>
      </div>
    </div>
  </div>
</template>
