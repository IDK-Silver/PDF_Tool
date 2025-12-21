<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useExportSettings } from '@/modules/export/settings'

const exportSettings = useExportSettings()

const props = defineProps<{
  menu: {
    open: boolean
    x: number
    y: number
    pageIndex: number
    aboveHalf: boolean
  }
  shiftDown: boolean
}>()

const emit = defineEmits<{
  (e: 'delete', pageIndex: number): void
  (e: 'insert-blank', pageIndex: number): void
  (e: 'insert-file', pageIndex: number): void
  (e: 'rotate', pageIndex: number): void
  (e: 'export-image', pageIndex: number): void
  (e: 'export-pdf', pageIndex: number): void
}>()

const exportMenu = ref<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 })
let exportCloseTimer: number | null = null

const insertPositionLabel = computed(() =>
  (props.menu.aboveHalf !== props.shiftDown) ? '之前' : '之後'
)

const imageFormatLabel = computed(() =>
  exportSettings.s.imageFormat === 'jpeg' ? 'JPEG 圖片' : 'PNG 圖片'
)

function scheduleExportClose(delay = 150) {
  if (exportCloseTimer) clearTimeout(exportCloseTimer)
  exportCloseTimer = window.setTimeout(() => {
    exportMenu.value.open = false
  }, delay)
}

function cancelExportClose() {
  if (exportCloseTimer) {
    clearTimeout(exportCloseTimer)
    exportCloseTimer = null
  }
}

function openExportMenu(ev: PointerEvent) {
  cancelExportClose()
  const target = ev.currentTarget as HTMLElement | null
  if (!target) return
  const rect = target.getBoundingClientRect()
  exportMenu.value.x = Math.round(rect.right + 2)
  exportMenu.value.y = Math.round(rect.top)
  exportMenu.value.open = true
}

function closeExportMenu() {
  exportMenu.value.open = false
  cancelExportClose()
}

function handleExportImage() {
  closeExportMenu()
  emit('export-image', props.menu.pageIndex)
}

function handleExportPdf() {
  closeExportMenu()
  emit('export-pdf', props.menu.pageIndex)
}

watch(
  () => props.menu.open,
  (open) => {
    if (!open) closeExportMenu()
  }
)

onBeforeUnmount(() => {
  if (exportCloseTimer) clearTimeout(exportCloseTimer)
})
</script>

<template>
  <teleport to="body">
    <div
      v-if="menu.open"
      data-context-menu
      class="fixed z-[2000] bg-card border border-border rounded shadow text-sm w-max max-w-[calc(100vw-24px)]"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    >
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="emit('delete', menu.pageIndex)">
        刪除此頁
      </button>
      <div class="border-t border-border my-1"></div>
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="emit('insert-blank', menu.pageIndex)">
        插入空白頁（{{ insertPositionLabel }}）
      </button>
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="emit('insert-file', menu.pageIndex)">
        插入檔案（{{ insertPositionLabel }}）
      </button>
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="emit('rotate', menu.pageIndex)">
        旋轉 {{ shiftDown ? '-90°' : '+90°' }}
      </button>
      <div class="border-t border-border my-1"></div>
      <button
        class="w-full text-left px-3 py-2 hover:bg-hover flex items-center justify-between gap-4 whitespace-nowrap overflow-hidden"
        @pointerenter="openExportMenu"
        @pointerleave="() => scheduleExportClose(180)"
      >
        <span class="overflow-hidden text-ellipsis">匯出</span>
        <span class="opacity-60 flex-shrink-0">▸</span>
      </button>
    </div>
  </teleport>
  <teleport to="body">
    <div
      v-if="exportMenu.open"
      data-export-submenu
      class="fixed z-[2010] bg-card border border-border rounded shadow text-sm w-max max-w-[calc(100vw-24px)]"
      :style="{ left: exportMenu.x + 'px', top: exportMenu.y + 'px' }"
      @pointerenter="cancelExportClose"
      @pointerleave="() => scheduleExportClose(120)"
    >
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="handleExportImage">
        {{ imageFormatLabel }}
      </button>
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="handleExportPdf">
        單頁 PDF
      </button>
    </div>
  </teleport>
</template>
