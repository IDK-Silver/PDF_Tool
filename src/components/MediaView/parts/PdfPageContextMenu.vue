<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useExportSettings } from '@/modules/export/settings'

const { t } = useI18n()
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
  (props.menu.aboveHalf !== props.shiftDown)
    ? t('contextMenu.positionBefore')
    : t('contextMenu.positionAfter')
)

const imageFormatLabel = computed(() =>
  exportSettings.s.imageFormat === 'jpeg'
    ? t('contextMenu.jpegImage')
    : t('contextMenu.pngImage')
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
        {{ t('contextMenu.deletePage') }}
      </button>
      <div class="border-t border-border my-1"></div>
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="emit('insert-blank', menu.pageIndex)">
        {{ t('contextMenu.insertBlankPage', { position: insertPositionLabel }) }}
      </button>
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="emit('insert-file', menu.pageIndex)">
        {{ t('contextMenu.insertFile', { position: insertPositionLabel }) }}
      </button>
      <button class="block w-full text-left px-3 py-2 hover:bg-hover whitespace-nowrap overflow-hidden text-ellipsis" @click="emit('rotate', menu.pageIndex)">
        {{ t('contextMenu.rotate', { angle: shiftDown ? '-90°' : '+90°' }) }}
      </button>
      <div class="border-t border-border my-1"></div>
      <button
        class="w-full text-left px-3 py-2 hover:bg-hover flex items-center justify-between gap-4 whitespace-nowrap overflow-hidden"
        @pointerenter="openExportMenu"
        @pointerleave="() => scheduleExportClose(180)"
      >
        <span class="overflow-hidden text-ellipsis">{{ t('contextMenu.export') }}</span>
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
        {{ t('contextMenu.singlePagePdf') }}
      </button>
    </div>
  </teleport>
</template>
