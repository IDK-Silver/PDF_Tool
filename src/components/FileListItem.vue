<script setup lang="ts">
import { computed } from 'vue'
import { DocumentTextIcon, PhotoIcon } from '@heroicons/vue/24/outline'
import type { PdfFile } from '../types/pdf'

const props = defineProps<{ file: PdfFile; active?: boolean; disabled?: boolean }>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'remove', id: string): void
}>()

function onSelect() {
  if (props.disabled) return
  emit('select', props.file.id)
}
function onRemove(e: MouseEvent) {
  e.stopPropagation()
  if (props.disabled) return
  emit('remove', props.file.id)
}

const isImage = computed(() => (props.file as any).kind === 'image')
</script>

<template>
  <div class="row" :class="{ active: props.active, disabled: props.disabled }" role="button" tabindex="0"
    @click="onSelect" @keydown.enter.prevent="onSelect" :aria-selected="props.active">
    <div class="leading-icon" aria-hidden="true">
      <PhotoIcon v-if="isImage" class="icon" />
      <DocumentTextIcon v-else class="icon" />
    </div>
    <div class="name">{{ props.file.name }}</div>
    <button class="delete-btn" type="button" title="刪除" aria-label="刪除" @click="onRemove">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M6 7h12M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m1 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7z" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  /* 圖示 | 名稱 | 刪除 */
  gap: 6px;
  align-items: center;
  padding: 4px 10px;
  min-height: 28px;
  background: #fff;
  border: none;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  user-select: none;

}

.row:hover {
  background: var(--hover, #f9fafb);
}

.row.active {
  background: var(--selected, #f3f4f6);
  /* box-shadow: inset 3px 0 0 var(--selected-bar, #d1d5db); */
}

.row:focus-visible {
  outline: 2px solid var(--ring, rgba(37, 99, 235, .5));
  outline-offset: 2px;
}

.row.disabled {
  opacity: .6;
  pointer-events: none;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--text-muted, #6b7280);
}

.leading-icon .icon {
  width: 16px;
  height: 16px;
  color: var(--text-muted, #6b7280);
  display: block;
}

.row.active .leading-icon .icon {
  color: var(--text, #111827);
}

.delete-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted, #6b7280);
  border-radius: var(--radius-sm, 6px);
  padding: 0;
  cursor: pointer;
  opacity: 0;
}

.row:hover .delete-btn,
.row.active .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: var(--hover, #f9fafb);
  color: #dc2626;
}

.delete-btn:focus {
  outline: 2px solid var(--ring, rgba(37, 99, 235, .5));
  outline-offset: 2px;
}

.delete-btn .icon {
  width: 16px;
  height: 16px;
}
</style>
