<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import FileListItem from './FileListItem.vue'
import type { FileItem } from './types'

const { t } = useI18n()

const props = defineProps<{
  items: FileItem[]
  selectedId?: string | null
  removable?: boolean
  draggable?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedId', id: string | null): void
  (e: 'item-click', item: FileItem): void
  (e: 'remove', item: FileItem): void
  (e: 'reorder', items: FileItem[]): void
}>()

const dragModel = computed({
  get: () => props.items,
  set: (val: FileItem[]) => {
    const arr = props.items
    arr.splice(0, arr.length, ...val)
  },
})

const isDragging = ref(false)

function onSelect(id: string) {
  emit('update:selectedId', id)
  const item = props.items.find(i => i.id === id)
  if (item) emit('item-click', item)
}

function onRemove(item: FileItem) {
  emit('remove', item)
}

// Hide fallback clone globally (once)
let styleInjected = false
function ensureHideFallback() {
  if (styleInjected) return
  styleInjected = true
  const s = document.createElement('style')
  s.textContent = `.sortable-fallback { opacity: 0 !important; pointer-events: none !important; }`
  document.head.appendChild(s)
}

function onDragStart() {
  isDragging.value = true
  ensureHideFallback()
}

function onDragEnd() {
  isDragging.value = false
  emit('reorder', props.items)
}
</script>

<template>
  <VueDraggable
    v-if="items && items.length > 0"
    v-model="dragModel"
    tag="nav"
    :disabled="!draggable"
    :animation="150"
    :force-fallback="true"
    :fallback-tolerance="4"
    ghost-class="filelist-drag-ghost"
    :class="[
      'w-full flex flex-col gap-[4px] pb-4',
      draggable ? 'drag-enabled' : '',
      isDragging ? 'is-dragging' : '',
    ]"
    @start="onDragStart"
    @end="onDragEnd"
  >
    <FileListItem
      v-for="item in items"
      :key="item.id"
      :item="item"
      :selected="item.id === props.selectedId"
      :removable="props.removable === true"
      @select="onSelect"
      @remove="onRemove"
    />
  </VueDraggable>
  <div v-if="!items || items.length === 0" class="h-full flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))] gap-1">
    <span class="text-[14px] font-medium">{{ t('fileList.noFiles') }}</span>
    <span class="text-[11px] opacity-70">{{ t('fileList.dropHint') }}</span>
  </div>
</template>

<style scoped>
/* Ghost placeholder */
:deep(.filelist-drag-ghost) {
  opacity: 0.3;
}
/* Disable all hover/interaction effects during drag */
:deep(.is-dragging > div) {
  pointer-events: none;
}
/* Grab cursor when drag is enabled */
:deep(.drag-enabled > div) {
  cursor: grab;
}
:deep(.drag-enabled > div:active) {
  cursor: grabbing;
}
</style>
