<script setup lang="ts">
interface PdfFile { id: string; name: string; path: string; pages?: number }

const props = defineProps<{ file: PdfFile; active?: boolean; disabled?: boolean }>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'context', payload: { id: string; x: number; y: number }): void
  (e: 'remove', id: string): void
}>()

function onSelect() {
  if (props.disabled) return
  emit('select', props.file.id)
}
function onContext(e: MouseEvent) {
  e.preventDefault()
  if (props.disabled) return
  emit('context', { id: props.file.id, x: e.clientX, y: e.clientY })
}
function onRemove(e: MouseEvent) {
  e.stopPropagation()
  if (props.disabled) return
  emit('remove', props.file.id)
}
</script>

<template>
  <div
    class="row"
    :class="{ active: props.active, disabled: props.disabled }"
    role="button"
    tabindex="0"
    @click="onSelect"
    @keydown.enter.prevent="onSelect"
    @contextmenu="onContext"
    :aria-selected="props.active"
  >
    <div class="name">{{ props.file.name }}</div>
    <button class="delete-btn" type="button" title="刪除" @click="onRemove">刪除</button>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 1fr auto; /* 名稱 | 刪除 */
  gap: 10px;
  align-items: center;
  padding: 12px;
  background: #fff;
  border: none;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  user-select: none;
}
.row:hover { background: var(--hover, #f9fafb); }
.row.active {
  background: var(--selected, #f3f4f6);
  box-shadow: inset 3px 0 0 var(--selected-bar, #d1d5db);
}
.row:focus-visible { outline: 2px solid var(--ring, rgba(37,99,235,.5)); outline-offset: 2px; }
.row.disabled { opacity: .6; pointer-events: none; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted { color: var(--text-muted, #6b7280); }
.delete-btn {
  border: none;
  background: transparent;
  color: var(--text-muted, #6b7280);
  border-radius: var(--radius-sm, 6px);
  padding: 4px 6px;
  cursor: pointer;
}
.delete-btn:hover { background: var(--hover, #f9fafb); color: #dc2626; }
.delete-btn:focus { outline: 2px solid var(--ring, rgba(37,99,235,.5)); outline-offset: 2px; }
</style>
