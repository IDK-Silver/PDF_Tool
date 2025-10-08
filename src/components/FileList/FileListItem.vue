<script setup lang="ts">
import type { FileItem } from './types'
import { XMarkIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  item: FileItem
  selected?: boolean
  removable?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'remove', item: FileItem): void
}>()

function onSelect() {
  emit('select', props.item.id)
}
function onRemove(e: MouseEvent) {
  e.stopPropagation()
  emit('remove', props.item)
}
</script>

<template>
  <div
    class="group w-full h-[32px] text-left p-0 m-0 bg-transparent rounded-none flex items-center hover:bg-[hsl(var(--muted))]"
    :class="[ selected ? '!bg-[hsl(var(--selection))]' : '' ]"
  >
    <button
      type="button"
      class="flex-1 min-w-0 h-full text-left px-[8px] border-0 bg-transparent"
      @click="onSelect"
    >
      <div class="w-full text-[14px] text-[hsl(var(--foreground))] truncate">{{ item.name }}</div>
    </button>
    <button v-if="removable" type="button" @click.stop="onRemove" title="從清單移除"
      class="flex-shrink-0 mr-1 p-1 rounded hover:bg-[hsl(var(--accent))] transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100">
      <XMarkIcon class="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
    </button>
  </div>
  
</template>

<style scoped>
button {
  -webkit-appearance: none;
  appearance: none;
  outline: none;
  box-shadow: none;
}
button:focus { outline: none; box-shadow: none; }
</style>
