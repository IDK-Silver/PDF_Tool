<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  running: boolean
  selectedName?: string
}>()

const emit = defineEmits<{ (e: 'start'): void; (e: 'cancel'): void }>()

const canStart = computed(() => !!props.selectedName && !props.running)

function onStart() { emit('start') }
function onCancel() { emit('cancel') }
</script>

<template>
  <div class="px-3 py-2 flex items-center gap-3 bg-[hsl(var(--muted))]/30">
    <div class="flex-1 min-w-0 text-sm truncate">
      <span class="text-[hsl(var(--muted-foreground))] mr-1">選擇檔案：</span>
      <span class="font-medium" v-if="selectedName">{{ selectedName }}</span>
      <span v-else class="text-[hsl(var(--muted-foreground))]">尚未選擇</span>
    </div>
    <div class="flex-shrink-0 flex items-center gap-2">
      <button
        class="px-3 py-1 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
        :class="props.running 
          ? 'bg-orange-500 text-white' 
          : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'"
        :disabled="!canStart && !props.running"
        @click="onStart"
      >{{ props.running ? '壓縮中...' : '開始壓縮' }}</button>
      <button
        class="px-3 py-1 rounded border border-[hsl(var(--border))] transition-colors disabled:opacity-50 whitespace-nowrap"
        :disabled="!running"
        @click="onCancel"
      >取消</button>
    </div>
  </div>
</template>

