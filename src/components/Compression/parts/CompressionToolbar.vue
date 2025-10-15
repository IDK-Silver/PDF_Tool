<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDoubleRightIcon } from '@heroicons/vue/24/outline'
import { useUiStore } from '@/modules/ui/store'

const props = defineProps<{
  running: boolean
  selectedName?: string
  fileSizeText?: string
  modeLabel?: string
  hideActions?: boolean
}>()

const emit = defineEmits<{ (e: 'start'): void; (e: 'cancel'): void }>()

const canStart = computed(() => !!props.selectedName && !props.running)

const ui = useUiStore()

function onStart() { emit('start') }
function onCancel() { emit('cancel') }
</script>

<template>
  <div class="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-[hsl(var(--border))] flex-shrink-0">
    <div class="px-3 py-2 flex items-center gap-3 bg-[hsl(var(--muted))]/30 min-h-[48px]">
      <!-- 左：展開側欄 + 檔名 -->
      <div class="flex items-center gap-2 min-w-0 flex-1">
      <button v-if="ui.sidebarCollapsed" @click="ui.setSidebarCollapsed(false)"
        class="rounded w-7 h-7 flex items-center justify-center transition-colors hover:bg-hover"
        title="展開側欄">
        <ChevronDoubleRightIcon class="w-4 h-4" />
      </button>
      <div class="truncate text-sm">
        <span class="text-[hsl(var(--muted-foreground))] mr-1">選擇檔案：</span>
        <span class="font-medium" v-if="selectedName">{{ selectedName }}</span>
        <span v-else class="text-[hsl(var(--muted-foreground))]">尚未選擇</span>
      </div>
    </div>

    <!-- 中：模式與檔案大小（有值才顯示） -->
    <div class="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))] flex-shrink-0 whitespace-nowrap">
      <div v-if="modeLabel" class="text-sm">
        <span class="mr-2">模式：</span>
        <span class="px-2 py-0.5 rounded bg-[hsl(var(--selection))]">{{ modeLabel }}</span>
      </div>
      <div v-if="fileSizeText" class="flex items-center gap-1">
        <span class="text-[hsl(var(--foreground))] font-medium">檔案大小：</span>
        <span class="font-mono">{{ fileSizeText }}</span>
      </div>
    </div>

    <!-- 右：動作按鈕 -->
    <div v-if="!props.hideActions" class="flex-shrink-0 flex items-center gap-2">
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
  </div>
</template>
