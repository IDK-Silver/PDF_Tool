<script setup lang="ts">
import type { FileItem } from './types'

const props = defineProps<{
  item: FileItem
  selected?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

function onClick() {
  emit('select', props.item.id)
}
</script>

<template>
  <button
    type="button"
    @click="onClick"
    class="w-full h-[32px] text-left p-0 m-0 border-0 bg-transparent rounded-none flex items-center"
    :class="[
      selected ? '!bg-[hsl(var(--selection))]' : 'hover:bg-[hsl(var(--muted))]'
    ]"
  >
    <div class="w-full px-[8px] text-[14px] text-[hsl(var(--foreground))] truncate">{{ item.name }}</div>
  </button>
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
