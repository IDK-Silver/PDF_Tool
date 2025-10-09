<script setup lang="ts">
import type { PropType } from 'vue'
import { ArchiveBoxIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  saving: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  currentPage: { type: Number, default: 0 },
  totalPages: { type: Number, default: 0 },
  viewMode: { type: String as PropType<'fit' | 'actual'>, default: 'fit' },
  displayZoom: { type: Number, default: 100 },
  isPdf: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'set-fit-mode'): void
  (e: 'reset-zoom'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
}>()
</script>

<template>
  <div class="sticky top-0 z-20 bg-background/90 backdrop-blur border-b shrink-0">
    <div class="px-4 py-2 flex items-center justify-between gap-4">
      <!-- 左側：檔案操作 -->
      <div class="flex items-center gap-3">
        <button @click="emit('save')" :disabled="props.saving || !props.canSave"
          class="rounded border border-border w-8 h-8 flex items-center justify-center transition-colors"
          :class="props.canSave ? 'bg-blue-400 text-white hover:bg-blue-700' : 'bg-card text-muted-foreground opacity-60 cursor-not-allowed'"
          title="儲存">
          <ArchiveBoxIcon class="w-4 h-4" />
        </button>
      </div>

      <!-- 中間：頁碼導覽 -->
      <div class="flex items-center gap-3">
        <div class="flex items-center text-sm tabular-nums text-[hsl(var(--muted-foreground))]">
          <template v-if="props.isPdf && props.totalPages > 0">
            <span class="text-[hsl(var(--foreground))]">{{ props.currentPage }}</span>
            <span class="mx-1">/</span>
            <span>{{ props.totalPages }}</span>
          </template>
          <template v-else>
            <span>0 / 0</span>
          </template>
        </div>
      </div>

      <!-- 右側：檢視控制 -->
      <div class="flex items-center gap-3">
        <!-- 顯示模式 -->
        <div class="flex items-center gap-1 bg-card rounded border border-border p-0.5">
          <button @click="emit('set-fit-mode')"
            class="text-xs rounded px-2 h-7 flex items-center justify-center transition-colors whitespace-nowrap"
            :class="props.viewMode === 'fit' ? 'bg-[hsl(var(--accent))] shadow-sm' : 'hover:bg-hover'">
            符合寬度
          </button>
          <button @click="emit('reset-zoom')"
            class="text-xs rounded px-2 h-7 flex items-center justify-center transition-colors whitespace-nowrap"
            :class="props.viewMode === 'actual' ? 'bg-[hsl(var(--accent))] shadow-sm' : 'hover:bg-hover'">
            實際大小
          </button>
        </div>

        <!-- 縮放控制 -->
        <div class="flex items-center gap-1 bg-card rounded border border-border px-1">
          <button @click="emit('zoom-out')"
            class="w-7 h-7 text-sm rounded hover:bg-hover transition-colors flex items-center justify-center">
            −
          </button>
          <div class="min-w-[48px] text-center text-xs tabular-nums px-1">{{ props.displayZoom }}%</div>
          <button @click="emit('zoom-in')"
            class="w-7 h-7 text-sm rounded hover:bg-hover transition-colors flex items-center justify-center">
            +
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
