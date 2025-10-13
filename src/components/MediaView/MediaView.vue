<script setup lang="ts">
import { computed, ref, unref, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'
import MediaToolbar from './parts/MediaToolbar.vue'
import PdfViewport from './parts/PdfViewport.vue'
import ImageViewport from './parts/ImageViewport.vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import missingFile from '@/assets/placeholders/missing-file.jpg'
import { openInFileManager } from '@/modules/media/openInFileManager'
// save handled inside media store via saveCurrentIfNeeded

const media = useMediaStore()
const settings = useSettingsStore()
const filelist = useFileListStore()

const saving = ref(false)

type MaybeRef<T> = T | Ref<T>

type ViewportExpose = {
  viewMode: MaybeRef<'fit' | 'actual'>
  displayZoom: MaybeRef<number>
  currentPage: MaybeRef<number>
  totalPages: MaybeRef<number>
  canZoomIn: MaybeRef<boolean>
  canZoomOut: MaybeRef<boolean>
  setFitMode: () => void
  resetZoom: () => void
  zoomIn: () => void
  zoomOut: () => void
}

const pdfViewportRef = ref<InstanceType<typeof PdfViewport> | null>(null)
const imageViewportRef = ref<InstanceType<typeof ImageViewport> | null>(null)

const isPdf = computed(() => media.descriptor?.type === 'pdf')
const isImage = computed(() => media.descriptor?.type === 'image' && !!media.imageUrl)

const pdfControls = computed<ViewportExpose | null>(() =>
  pdfViewportRef.value ? (pdfViewportRef.value as unknown as ViewportExpose) : null,
)
const imageControls = computed<ViewportExpose | null>(() =>
  imageViewportRef.value ? (imageViewportRef.value as unknown as ViewportExpose) : null,
)

const activeControls = computed<ViewportExpose | null>(() => {
  if (isPdf.value) return pdfControls.value
  if (isImage.value) return imageControls.value
  return null
})

const viewMode = ref<'fit' | 'actual'>('fit')
const displayZoom = ref(100)
const currentPage = ref(0)
const totalPages = ref(0)
const canZoomIn = ref(true)
const canZoomOut = ref(true)

// 當 filelist 已選擇且後端回報檔案不存在時，顯示預設佔位圖
const isFileMissing = computed(() => {
  if (!media.selected) return false
  const msg = media.error || ''
  return msg.includes('檔案不存在') || /not\s*found/i.test(msg)
})

const canReveal = computed(() => !!media.selected?.path && !isFileMissing.value)

watchEffect(() => {
  const controls = activeControls.value
  if (!controls) {
    viewMode.value = 'fit'
    displayZoom.value = 100
    currentPage.value = 0
    totalPages.value = 0
    canZoomIn.value = true
    canZoomOut.value = true
    return
  }
  viewMode.value = unref(controls.viewMode)
  displayZoom.value = unref(controls.displayZoom)
  currentPage.value = unref(controls.currentPage)
  totalPages.value = unref(controls.totalPages)
  canZoomIn.value = unref(controls.canZoomIn)
  canZoomOut.value = unref(controls.canZoomOut)
})

function handleSetFitMode() {
  activeControls.value?.setFitMode()
}
function handleResetZoom() {
  activeControls.value?.resetZoom()
}
function handleZoomIn() {
  activeControls.value?.zoomIn()
}
function handleZoomOut() {
  activeControls.value?.zoomOut()
}

function isEditableTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (t as any).isContentEditable === true
}

async function onKeydown(e: KeyboardEvent) {
  const code = (e.code || '').toLowerCase()
  const k = e.key
  // ESC：關閉目前檔案（回到初始狀態）。若有開啟的快顯選單則優先由內部處理。
  if (k === 'Escape') {
    if (isEditableTarget(e.target)) return
    // 若有浮動選單存在，讓其處理關閉，不進行檔案關閉
    if (document.querySelector('[data-context-menu], [data-export-submenu]')) return
    try { await media.closeDoc() } catch {}
    media.clear()
    return
  }

  // 其餘快捷鍵需搭配 Cmd/Ctrl
  if (!e.metaKey && !e.ctrlKey) return
  if (isEditableTarget(e.target)) return
  if (k === '+' || k === '=' || code === 'equal') {
    e.preventDefault()
    handleZoomIn()
    return
  }
  if (k === '-' || k === '_' || code === 'minus') {
    e.preventDefault()
    handleZoomOut()
    return
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, { passive: false })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown as any)
})

async function onSaveNow() {
  const d = media.descriptor
  if (!d || d.type !== 'pdf') return
  try {
    saving.value = true
    await media.saveCurrentIfNeeded()
    const path = media.descriptor?.path
    if (path) {
      try { filelist.setLastPage(path, Math.max(1, currentPage.value)) } catch {}
      // 若為另存新檔，保持選取同步到新路徑
      await media.selectPath(path)
    }
  } catch (e: any) {
    if (String(e?.message || e) !== 'SAVE_CANCELLED') {
      alert(e?.message || String(e))
    }
  } finally {
    saving.value = false
  }
}

async function onReveal() {
  const p = media.selected?.path
  if (!p) return
  try { await openInFileManager(p) } catch (err) {
    console.error('openInFileManager failed', err)
    alert('無法在檔案管理器顯示該檔案')
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="settings.s.devPerfOverlay"
      class="fixed bottom-2 right-2 z-50 pointer-events-none bg-black/75 text-white text-xs px-2 py-1 rounded shadow">
      <span v-if="isPdf">p {{ currentPage }} / {{ totalPages }} · </span>
      inflight: {{ media.inflightCount }} · queued: {{ media.queue.length }}
    </div>

    <MediaToolbar :saving="saving" :can-save="media.dirty && isPdf" :can-reveal="canReveal" :current-page="currentPage"
      :total-pages="totalPages" :view-mode="viewMode" :display-zoom="displayZoom" :is-pdf="isPdf"
      :can-zoom-in="canZoomIn" :can-zoom-out="canZoomOut" @save="onSaveNow" @reveal="onReveal" @set-fit-mode="handleSetFitMode"
      @reset-zoom="handleResetZoom" @zoom-in="handleZoomIn" @zoom-out="handleZoomOut" />

    <div class="flex-1 flex min-h-0">
      <div v-if="media.loading" class="p-4">讀取中…</div>
      <div v-else-if="isFileMissing" class="flex-1 flex items-center justify-center">
        <img :src="missingFile" alt="File not found" class="max-w-[60%] max-h-[60%] opacity-80 select-none" />
      </div>
      <div v-else-if="media.error" class="text-red-600 p-4">{{ media.error }}</div>
      <ImageViewport v-else-if="isImage" ref="imageViewportRef" />
      <PdfViewport v-else-if="isPdf" ref="pdfViewportRef" />
      <div v-else class="h-full w-full flex items-center justify-center">
        <div class="text-center text-[hsl(var(--muted-foreground))]">
          <p class="text-sm">請在左側選擇 PDF 或圖片檔案以開始檢視</p>
        </div>
      </div>
    </div>
  </div>
</template>
