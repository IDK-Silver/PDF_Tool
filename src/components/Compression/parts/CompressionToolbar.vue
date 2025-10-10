<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  running: boolean
  selectedName?: string
}>()

const emit = defineEmits<{ (e: 'start'): void; (e: 'cancel'): void }>()

function human(n?: number) {
  if (!n || n <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(v < 10 && u > 0 ? 1 : 0)} ${units[u]}`
}

const canStart = computed(() => !!props.selectedName && !props.running)

function onStart() { emit('start') }
function onCancel() { emit('cancel') }
</script>

<template>
  <div class="px-3 py-2 flex items-center gap-3 bg-[hsl(var(--muted))]/30">
    <div class="text-sm truncate">
      <span class="text-[hsl(var(--muted-foreground))] mr-1">選擇檔案：</span>
      <span class="font-medium" v-if="selectedName">{{ selectedName }}</span>
      <span v-else class="text-[hsl(var(--muted-foreground))]">尚未選擇</span>
    </div>
    <div class="ml-auto flex items-center gap-2">
      <button
        class="px-3 py-1 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        :disabled="!canStart"
        @click="onStart"
      >開始壓縮</button>
      <button
        class="px-3 py-1 rounded border border-[hsl(var(--border))] disabled:opacity-50"
        :disabled="!running"
        @click="onCancel"
      >取消</button>
    </div>
  </div>
</template>

