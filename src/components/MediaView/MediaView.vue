<script setup lang="ts">
import { computed, ref, unref, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { Ref } from 'vue'
import MediaToolbar from './parts/MediaToolbar.vue'
import PdfViewport from './parts/PdfViewport.vue'
import ImageViewport from './parts/ImageViewport.vue'
// import AnnotationToolbar from './parts/AnnotationToolbar.vue'
import { useMediaStore } from '@/modules/media/store'
// import { useAnnotationStore } from '@/modules/annotation/store'
// import { embedAllAnnotations } from '@/modules/annotation/service'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import missingFile from '@/assets/placeholders/missing-file.jpg'
import { openInFileManager } from '@/modules/media/openInFileManager'
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog'
// save handled inside media store via saveCurrentIfNeeded

const media = useMediaStore()
const settings = useSettingsStore()
const filelist = useFileListStore()
// const annotationStore = useAnnotationStore()

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
  searchVisible?: MaybeRef<boolean>
}

type PdfViewportExposeExtended = ViewportExpose & {
  gotoPage: (page: number) => Promise<void>
  toggleSearch: () => void
  openSearch: () => void
  closeSearch: () => void
  searchVisible: Ref<boolean>
}
const pdfViewportRef = ref<PdfViewportExposeExtended | null>(null)
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

const searchActive = ref(false)

// 使用 computed 直接從子組件讀取狀態，確保響應式追蹤正確工作
const viewMode = computed(() => {
  const controls = activeControls.value
  if (!controls) return 'fit' as const
  return unref(controls.viewMode)
})

const displayZoom = computed(() => {
  const controls = activeControls.value
  if (!controls) return 100
  return unref(controls.displayZoom)
})

const currentPage = computed(() => {
  const controls = activeControls.value
  if (!controls) return 0
  return unref(controls.currentPage)
})

const totalPages = computed(() => {
  const controls = activeControls.value
  if (!controls) return 0
  return unref(controls.totalPages)
})

const canZoomIn = computed(() => {
  const controls = activeControls.value
  if (!controls) return true
  return unref(controls.canZoomIn)
})

const canZoomOut = computed(() => {
  const controls = activeControls.value
  if (!controls) return true
  return unref(controls.canZoomOut)
})

// 當 filelist 已選擇且後端回報檔案不存在時，顯示預設佔位圖
const isFileMissing = computed(() => {
  if (!media.selected) return false
  const msg = media.error || ''
  return msg.includes('檔案不存在') || /not\s*found/i.test(msg)
})

const canReveal = computed(() => !!media.selected?.path && !isFileMissing.value)

// 注意：狀態已改用 computed，所以不再需要 watchEffect 同步

watchEffect(() => {
  const vp = pdfViewportRef.value
  searchActive.value = !!(vp && unref(vp.searchVisible))
})

// Reset annotation store when switching files - temporarily disabled
// watch(() => media.descriptor?.path, () => {
//   annotationStore.reset()
// })

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

async function handleJumpToPage(page: number) {
  if (!pdfViewportRef.value) return
  try {
    await pdfViewportRef.value.gotoPage(page)
  } catch (_) {
    // noop
  }
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

async function onDiscardNow() {
  const p = media.selected?.path
  if (!p) return
  try {
    await media.loadDescriptor(p)
  } catch (e: any) {
    alert(e?.message || String(e))
  }
}

// 當從媒體檢視切換到「壓縮」頁面且目前文件有未儲存變更時，提示是否放棄
onBeforeRouteLeave(async (to) => {
  if (to.name === 'compress' && media.dirty) {
    const ok = await confirmDialog('此文件有未儲存變更，是否放棄並前往壓縮？', {
      title: '放棄變更',
      okLabel: '捨棄',
      cancelLabel: '取消',
    })
    if (!ok) return false
    // 為了真正丟棄記憶體中的未儲存修改，重新自磁碟載入目前檔案
    const p = media.selected?.path
    if (p) {
      try { await media.loadDescriptor(p) } catch (_) {}
    }
  }
  return true
})

async function onSaveNow() {
  const d = media.descriptor
  const docId = media.docId
  if (!d || d.type !== 'pdf' || docId == null) return
  try {
    saving.value = true

    // Embed annotations before saving - temporarily disabled
    // const annotations = annotationStore.getAllAnnotations()
    // if (annotations.length > 0) {
    //   await embedAllAnnotations(docId, annotations)
    //   // Clear annotations after embedding (they are now part of the PDF)
    //   annotationStore.reset()
    // }

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

function handleToggleSearch() {
  const viewport = pdfViewportRef.value
  if (!viewport) return
  viewport.toggleSearch()
}

// Menu event handlers
function onMenuZoomIn() {
  handleZoomIn()
}

function onMenuZoomOut() {
  handleZoomOut()
}

function onMenuFitMode() {
  handleSetFitMode()
}

function onMenuActualSize() {
  handleResetZoom()
}

function onMenuFind() {
  handleToggleSearch()
}

onMounted(() => {
  window.addEventListener('menu:zoom-in', onMenuZoomIn)
  window.addEventListener('menu:zoom-out', onMenuZoomOut)
  window.addEventListener('menu:fit-mode', onMenuFitMode)
  window.addEventListener('menu:actual-size', onMenuActualSize)
  window.addEventListener('menu:find', onMenuFind)
})

onBeforeUnmount(() => {
  window.removeEventListener('menu:zoom-in', onMenuZoomIn)
  window.removeEventListener('menu:zoom-out', onMenuZoomOut)
  window.removeEventListener('menu:fit-mode', onMenuFitMode)
  window.removeEventListener('menu:actual-size', onMenuActualSize)
  window.removeEventListener('menu:find', onMenuFind)
})
</script>

<template>
  <div class="h-full flex flex-col relative">
    <div v-if="settings.s.devPerfOverlay"
      class="fixed bottom-2 right-2 z-50 pointer-events-none bg-black/75 text-white text-xs px-2 py-1 rounded shadow">
      <span v-if="isPdf">p {{ currentPage }} / {{ totalPages }} · </span>
      inflight: {{ media.inflightCount }} · queued: {{ media.queue.length }}
    </div>

    <MediaToolbar
      :saving="saving"
      :can-save="media.dirty && isPdf"
      :can-reveal="canReveal"
      :current-page="currentPage"
      :total-pages="totalPages"
      :view-mode="viewMode"
      :display-zoom="displayZoom"
      :is-pdf="isPdf"
      :can-zoom-in="canZoomIn"
      :can-zoom-out="canZoomOut"
      :search-active="searchActive"
      @save="onSaveNow"
      @discard="onDiscardNow"
      @reveal="onReveal"
      @toggle-search="handleToggleSearch"
      @set-fit-mode="handleSetFitMode"
      @reset-zoom="handleResetZoom"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @jump-to-page="handleJumpToPage"
    />

    <!-- Annotation Toolbar (floating) - temporarily disabled -->
    <!-- <div
      v-if="isPdf"
      class="absolute top-14 left-1/2 -translate-x-1/2 z-30"
    >
      <AnnotationToolbar />
    </div> -->

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
