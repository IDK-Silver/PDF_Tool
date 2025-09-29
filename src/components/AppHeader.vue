<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { computed, inject } from 'vue'
import { Cog6ToothIcon, ChevronDoubleLeftIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const route = useRoute()
const isSettings = computed(() => route.path.startsWith('/settings'))
function openSettings() {
  if (!isSettings.value) router.push('/settings')
}
const setLeftCollapsed = inject('setLeftCollapsed') as ((v?: boolean) => void) | undefined
function collapseLeft() { setLeftCollapsed?.(true) }
</script>

<template>
  <div class="app-header">
    <div class="title" aria-label="App 名稱">Kano PDF</div>
    <div class="actions">
      <button type="button" class="btn-settings" :class="{ active: isSettings }" @click="openSettings" aria-label="開啟設定" title="設定">
        <Cog6ToothIcon class="icon" aria-hidden="true" />
      </button>
      <button type="button" class="btn-collapse" @click="collapseLeft" aria-label="收起側欄" title="收起側欄">
        <ChevronDoubleLeftIcon class="icon" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding-bottom: 12px;
  padding-left: 6px;
  padding-right: 6px;
  padding-top: 12px;
}

.title {
  font-weight: 600;
  color: var(--text, #111827);
}

.actions { display: inline-flex; align-items: center; gap: 8px; }

.btn-settings {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border, #e5e7eb);
  background: #fff;
  color: var(--text, #111827);
  border: #fff;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
  height: 28px;
}

.btn-settings:hover {
  background: var(--hover, #f3f4f6);
}

.btn-settings.active {
  background: var(--hover, #eef2ff);
  border-color: var(--border, #e5e7eb);
}

.btn-settings .icon {
  width: 16px;
  height: 16px;
  color: var(--text-muted, #6b7280);
}

.btn-settings.active .icon {
  color: var(--text, #111827);
}

.btn-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;            /* 不要邊框 */
  background: transparent; /* 與標題一致，hover 再給底色 */
  color: var(--text, #111827);
  border-radius: 6px;
  cursor: pointer;
}
.btn-collapse:hover { background: var(--hover, #f3f4f6); }
.btn-collapse .icon { width: 16px; height: 16px; }
</style>
