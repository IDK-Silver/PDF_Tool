<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'
import { Cog6ToothIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const route = useRoute()
const isSettings = computed(() => route.path.startsWith('/settings'))
function openSettings() {
  if (!isSettings.value) router.push('/settings')
}
</script>

<template>
  <div class="app-header">
    <div class="title" aria-label="App 名稱">PDF Tool</div>
    <button type="button" class="btn-settings" :class="{ active: isSettings }" @click="openSettings" aria-label="開啟設定"
      title="設定">
      <Cog6ToothIcon class="icon" aria-hidden="true" />
      <span class="label">設定</span>
    </button>
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
</style>
