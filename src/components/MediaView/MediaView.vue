<script setup lang="ts">
import { computed, ref, unref, watchEffect } from 'vue'
import type { Ref } from 'vue'
import MediaToolbar from './parts/MediaToolbar.vue'
import PdfViewport from './parts/PdfViewport.vue'
import ImageViewport from './parts/ImageViewport.vue'
import { useMediaStore } from '@/modules/media/store'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { pdfSave } from '@/modules/media/service'

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

watchEffect(() => {
  const controls = activeControls.value
  if (!controls) {
    viewMode.value = 'fit'
    displayZoom.value = 100
    currentPage.value = 0
    totalPages.value = 0
    return
  }
  viewMode.value = unref(controls.viewMode)
  displayZoom.value = unref(controls.displayZoom)
  currentPage.value = unref(controls.currentPage)
  totalPages.value = unref(controls.totalPages)
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

async function onSaveNow() {
  const id = media.docId
  const d = media.descriptor
  if (id == null || !d || d.type !== 'pdf') return
  try {
    saving.value = true
    let res: { path: string; pages: number }
    if (settings.s.deleteBehavior === 'saveAsNew') {
      const base = (d.name?.replace(/\.pdf$/i, '') || 'output') + ' (edited).pdf'
      const picked = await saveDialog({ defaultPath: base, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!picked) return
      res = await pdfSave({ docId: id, destPath: picked, overwrite: true })
      try {
        filelist.add(res.path)
        filelist.setLastPage(res.path, Math.max(1, currentPage.value))
        await media.selectPath(res.path)
      } catch {
        /* noop */
      }
    } else {
      res = await pdfSave({ docId: id, overwrite: true })
    }
    media.clearDirty()
    media.descriptor = { ...media.descriptor, path: res.path, pages: res.pages } as any
  } catch (e: any) {
    alert(e?.message || String(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div
      v-if="settings.s.devPerfOverlay"
      class="fixed bottom-2 right-2 z-50 pointer-events-none bg-black/75 text-white text-xs px-2 py-1 rounded shadow"
    >
      <span v-if="isPdf">p {{ currentPage }} / {{ totalPages }} · </span>
      inflight: {{ media.inflightCount }} · queued: {{ media.queue.length }}
    </div>

    <MediaToolbar
      :saving="saving"
      :can-save="media.dirty && isPdf"
      :current-page="currentPage"
      :total-pages="totalPages"
      :view-mode="viewMode"
      :display-zoom="displayZoom"
      :is-pdf="isPdf"
      @save="onSaveNow"
      @set-fit-mode="handleSetFitMode"
      @reset-zoom="handleResetZoom"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
    />

    <div class="flex-1 flex min-h-0">
      <div v-if="media.loading" class="p-4">讀取中…</div>
      <div v-else-if="media.error" class="text-red-600 p-4">{{ media.error }}</div>
      <ImageViewport v-else-if="isImage" ref="imageViewportRef" />
      <PdfViewport v-else-if="isPdf" ref="pdfViewportRef" />
      <div v-else class="p-4 text-sm text-[hsl(var(--muted-foreground))]">尚未選擇檔案</div>
    </div>
  </div>
</template>
