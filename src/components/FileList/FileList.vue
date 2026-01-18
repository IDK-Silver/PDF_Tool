<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FileListItem from './FileListItem.vue'
import type { FileItem } from './types'

const { t } = useI18n()

const props = defineProps<{
  items: FileItem[]
  selectedId?: string | null
  removable?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedId', id: string | null): void
  (e: 'item-click', item: FileItem): void
  (e: 'remove', item: FileItem): void
}>()

function onSelect(id: string) {
  emit('update:selectedId', id)
  const item = props.items.find(i => i.id === id)
  if (item) emit('item-click', item)
}

function onRemove(item: FileItem) {
  emit('remove', item)
}
</script>

<template>

  <nav class="w-full flex flex-col gap-[4px] pb-4">
    <FileListItem v-for="item in items" :key="item.id" :item="item" :selected="item.id === props.selectedId" :removable="props.removable === true"
      @select="onSelect" @remove="onRemove" />
  </nav>
  <div v-if="!items || items.length === 0" class="h-full flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))] gap-1">
    <span class="text-[14px] font-medium">{{ t('fileList.noFiles') }}</span>
    <span class="text-[11px] opacity-70">{{ t('fileList.dropHint') }}</span>
  </div>
</template>
