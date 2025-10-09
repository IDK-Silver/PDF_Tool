<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Cog6ToothIcon, ChevronDoubleLeftIcon } from '@heroicons/vue/24/outline'
import { useUiStore } from '@/modules/ui/store'
const router = useRouter()
const ui = useUiStore()
function onSettings() { router.push({ name: 'settings' }) }
function onCollapse() { ui.toggleSidebar() }
</script>

<template>
  <header class="w-full h-[48px] flex items-center justify-between">
    <div class="text-[hsl(var(--foreground))] font-medium select-none">
      Kano PDF Tool
    </div>
    <div class="flex items-center gap-[8px]">
      <button
        type="button"
        @click="onSettings"
        aria-label="Open settings"
        class="icon-btn w-[32px] h-[32px] inline-flex items-center justify-center rounded-[6px] bg-transparent text-[hsl(var(--foreground))]"
      >
        <Cog6ToothIcon />
      </button>
      <button
        type="button"
        @click="onCollapse"
        aria-label="Toggle sidebar"
        class="icon-btn w-[32px] h-[32px] inline-flex items-center justify-center rounded-[6px] bg-transparent text-[hsl(var(--foreground))]"
        title="收合側欄"
      >
        <ChevronDoubleLeftIcon />
      </button>
    </div>
  </header>
</template>

<style scoped>
.icon-btn {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  border: 0;
  outline: none;
  box-shadow: none;
}
.icon-btn:focus,
.icon-btn:active {
  outline: none;
  box-shadow: none;
}
.icon-btn :deep(svg) {
  width: 16px;
  height: 16px;
  stroke: currentColor;
}
</style>
