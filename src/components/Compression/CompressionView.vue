<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, ref, watch } from 'vue'
import { useCompressionStore } from '@/modules/compress/store'
import CompressionToolbar from './parts/CompressionToolbar.vue'
import PdfCompressPane from './parts/PdfCompressPane.vue'
import ImageCompressPane from './parts/ImageCompressPane.vue'
import { useMediaStore } from '@/modules/media/store'
import { formatFileSize } from '@/modules/media/fileSize'
import { openInFileManager } from '@/modules/media/openInFileManager'
import missingFile from '@/assets/placeholders/missing-file.jpg'

const compression = useCompressionStore()
const media = useMediaStore()

onMounted(() => {
  compression.ensureTabForSelection()
})

function isEditableTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (t as any).isContentEditable === true
}

async function onKeydown(e: KeyboardEvent) {
  const k = e.key
  if (k !== 'Escape') return
  if (isEditableTarget(e.target)) return
  // 若有媒體視圖的快顯選單存在時，由其自行處理（避免誤關閉）
  if (document.querySelector('[data-context-menu], [data-export-submenu]')) return
  try { await media.closeDoc() } catch {}
  media.clear()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, { passive: false })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown as any)
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
const canReveal = computed(() => !!filePath.value && !isFileMissing.value)
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

    <!-- 工具列：永遠顯示，置頂吸附與半透明背景，與檢視模式一致 -->
    <CompressionToolbar
      :running="compression.running"
      :selected-name="fileName"
      :file-size-text="hasValidFile ? fileSizeText : undefined"
      :mode-label="isPdf ? 'PDF 壓縮' : (isImage ? '圖片壓縮' : '')"
      :hide-actions="isFileMissing"
      :can-reveal="canReveal"
      @reveal="onReveal"
      @start="onStart" @cancel="onCancel"
    />

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
