<script setup lang="ts">
import { EyeIcon, ArrowPathIcon, Squares2X2Icon } from '@heroicons/vue/24/outline'

type Mode = 'view' | 'convert' | 'compose'

const mode = defineModel<Mode>({ required: true })
const emit = defineEmits<{ (e: 'navigate', key: Mode): void }>()

const tabs: Array<{ key: Mode, label: string, icon: any }> = [
  { key: 'view', label: 'View', icon: EyeIcon },
  { key: 'convert', label: 'Convert', icon: ArrowPathIcon },
  { key: 'compose', label: 'Compose', icon: Squares2X2Icon },
]

</script>


<template>
  <div class="tabs">
    <button
      v-for="(tab, index) in tabs"
      :key="index"
      class="tab-btn"
      :class="{ active: mode === tab.key }"
      type="button"
      @click="(mode = tab.key, emit('navigate', tab.key))"
      :aria-pressed="mode === tab.key"
    >
      <component :is="tab.icon" class="icon" aria-hidden="true" />
      <span class="label">{{ tab.label }}</span>
    </button>
  </div>
</template>


<style>
.tabs { display: flex; flex-direction: column; gap: 8px; }

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: #fff;
  cursor: pointer;
  text-align: left;
  border: none;
  height: 32px;
}

.tab-btn:hover { background: var(--hover); }

.tab-btn.active {
  background: var(--selected, #f3f4f6);
  color: inherit;
  /* box-shadow: inset 3px 0 0 var(--selected-bar, #d1d5db); */
}

.tab-btn:focus { outline: 2px solid var(--ring); outline-offset: 2px; }

.tab-btn .icon { width: 16px; height: 16px; color: var(--text-muted, #6b7280); }
.tab-btn.active .icon { color: var(--text, #111827); }
</style>
