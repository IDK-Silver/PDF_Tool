<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ContextMenuItem } from '../types/viewer'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'close'): void
}>()

const menuRef = ref<HTMLDivElement | null>(null)

const positionStyle = computed(() => {
  const menu = menuRef.value
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const width = menu?.offsetWidth ?? 200
  const height = menu?.offsetHeight ?? props.items.length * 32
  let left = props.x
  let top = props.y

  if (left + width > viewportWidth) left = viewportWidth - width - 8
  if (top + height > viewportHeight) top = viewportHeight - height - 8
  if (left < 8) left = 8
  if (top < 8) top = 8

  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
})

function handleItemClick(item: ContextMenuItem) {
  if (item.disabled) return
  emit('select', item.id)
}

function onGlobalClick(e: MouseEvent) {
  if (!props.visible) return
  const menu = menuRef.value
  if (menu && menu.contains(e.target as Node)) return
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('mousedown', onGlobalClick)
  // Do not close on global contextmenu; it conflicts with opening
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onGlobalClick)
  window.removeEventListener('keydown', onKeydown)
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    // force recalculation by touching positionStyle
    void positionStyle.value
  },
)
</script>

<template>
  <teleport to="body">
    <div v-if="visible" class="context-menu" :style="positionStyle" ref="menuRef" role="menu">
      <button
        v-for="item in items"
        :key="item.id"
        class="menu-item"
        type="button"
        :disabled="item.disabled"
        role="menuitem"
        @click="handleItemClick(item)"
      >
        <span class="label">{{ item.label }}</span>
        <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
      </button>
    </div>
  </teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  min-width: 200px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 2000;
}

.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: none;
  background: transparent;
  color: var(--text, #111827);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.menu-item:hover:not(:disabled),
.menu-item:focus-visible {
  background: var(--hover, #f3f4f6);
  outline: none;
}

.menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.label {
  pointer-events: none;
}

.shortcut {
  color: var(--text-muted, #6b7280);
  margin-left: 16px;
  pointer-events: none;
}
</style>
