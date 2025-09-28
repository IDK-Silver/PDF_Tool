<script setup lang="ts">
import { ref, computed } from "vue";
import ModeTabs from './components/ModeTabs.vue'
import FileListPanel from './components/FileListPanel.vue'
import { useModeFiles } from './composables/useModeFiles'
import type { Mode } from './types/pdf'

const mode = ref<Mode>('view')

// 使用 composable 管理各模式清單與選取
const {
  currentFiles,
  currentActiveId,
  activeFile,
  setActiveId,
  removeFromCurrent,
  addExampleToCurrent,
} = useModeFiles(mode)

// 每個模式的搜尋字串與過濾結果
const qView = ref('')
const qConvert = ref('')
const qCompose = ref('')
const currentQuery = computed({
  get: () => (mode.value === 'view' ? qView.value : mode.value === 'convert' ? qConvert.value : qCompose.value),
  set: (v: string) => {
    if (mode.value === 'view') qView.value = v
    else if (mode.value === 'convert') qConvert.value = v
    else qCompose.value = v
  },
})

const filteredFiles = computed(() => {
  const term = currentQuery.value.trim().toLowerCase()
  if (!term) return currentFiles.value
  return currentFiles.value.filter(f => f.name.toLowerCase().includes(term))
})

function onAddFiles() {
  // TODO: 使用 Tauri dialog.open 導入檔案
  addExampleToCurrent()
}
function onRemove(id: string) {
  removeFromCurrent(id)
}
function onSelect(id: string | null) { setActiveId(id) }

</script>

<template>
  <main class="app-grid">
    <section class="left-col">
      <header class="menu">
        <ModeTabs v-model="mode" />
      </header>
      <FileListPanel :key="mode" :files="filteredFiles" :active-id="currentActiveId" v-model:query="currentQuery"
        @add="onAddFiles" @select="onSelect" @remove="onRemove">
      </FileListPanel>
    </section>
    <section class="right-col">
      <div v-if="mode === 'view'" class="panel pad">
        <h3 style="margin:0 0 8px;">檢視模式</h3>
        <p class="muted" v-if="activeFile">目前選擇：{{ activeFile.name }}</p>
        <p class="muted" v-else>請在左側選擇一個 PDF 檔案</p>
      </div>
      <div v-else-if="mode === 'convert'" class="panel pad">
        <h3 style="margin:0 0 8px;">批次轉換（單選）</h3>
        <p class="muted" v-if="activeFile">目前選擇：{{ activeFile.name }}</p>
        <p class="muted" v-else>請在左側選擇一個 PDF 檔案</p>
      </div>
      <div v-else class="panel pad">
        <h3 style="margin:0 0 8px;">合併分割模式</h3>
        <p class="muted">稍後實作左右 2:1 子版面。</p>
      </div>
    </section>
  </main>

</template>

<style>
.app-grid {
  display: grid;
  grid-template-columns: 3fr 7fr;
  height: 100vh;
  /* 防止整頁滾動，改由子區塊管理 */
  overflow: hidden;
}

.left-col {
  display: grid;
  grid-template-rows: auto 1fr;
  border-right: 1px solid var(--border);
  min-width: 280px;
  /* 允許子元素正確溢出處理 */
  min-height: 0;
  /* 左欄自身不滾動 */
  overflow: hidden;
}

.menu {
  padding: 8px 8px;
  border-bottom: 1px solid var(--border);
}

.right-col {
  height: 100%;
  overflow: hidden;
  padding: 12px;
}

.mode-wrap {
  height: 100%;
}

.pad {
  padding: 12px;
}

.muted {
  color: var(--text-muted);
}
</style>
