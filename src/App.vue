<script setup lang="ts">
import { ref, computed } from "vue";
import ModeTabs from './components/ModeTabs.vue'
import FileListPanel from './components/FileListPanel.vue'

type Mode = 'view' | 'convert' | 'compose'
const mode = ref<Mode>('view')

interface PdfFile { id: string; path: string; name: string }

// 各模式獨立清單
const filesView = ref<PdfFile[]>([])
const filesConvert = ref<PdfFile[]>([])
const filesCompose = ref<PdfFile[]>([])

// 各模式獨立選取
const activeViewId = ref<string | null>(null)
const activeConvertId = ref<string | null>(null)
const activeComposeId = ref<string | null>(null)

// 目前模式對應的清單/選取
const currentFiles = computed(() => {
  switch (mode.value) {
    case 'view': return filesView.value
    case 'convert': return filesConvert.value
    case 'compose': return filesCompose.value
  }
})
const currentActiveId = computed(() => {
  switch (mode.value) {
    case 'view': return activeViewId.value
    case 'convert': return activeConvertId.value
    case 'compose': return activeComposeId.value
  }
})
const activeFile = computed(() => currentFiles.value.find(f => f.id === currentActiveId.value) || null)

function getListRef() {
  return mode.value === 'view' ? filesView
       : mode.value === 'convert' ? filesConvert
       : filesCompose
}
function setActiveId(id: string | null) {
  if (mode.value === 'view') activeViewId.value = id
  else if (mode.value === 'convert') activeConvertId.value = id
  else activeComposeId.value = id
}

// 事件：新增/刪除/選取/右鍵（皆作用於目前模式）
function onAddFiles() {
  // TODO: 使用 Tauri dialog.open 導入檔案
  const arr = getListRef()
  const id = Math.random().toString(36).slice(2, 9)
  arr.value.push({ id, path: `/tmp/${id}.pdf`, name: `Example-${arr.value.length + 1}.pdf` })
}
function onRemove(id: string) {
  const arr = getListRef()
  const idx = arr.value.findIndex(f => f.id === id)
  if (idx >= 0) arr.value.splice(idx, 1)
  if (currentActiveId.value === id) setActiveId(null)
}
function onSelect(id: string | null) { setActiveId(id) }
function onContext(payload: { id: string; x: number; y: number }) {
  setActiveId(payload.id)
  // TODO: 顯示右鍵選單（之後接入）
  console.log('context menu @', payload)
}
</script>

<template>
  <main class="app-grid">
    <section class="left-col">
      <header class="menu">
        <ModeTabs v-model="mode" />
      </header>
      <FileListPanel
        :key="mode"
        :files="currentFiles"
        :active-id="currentActiveId"
        @add="onAddFiles"
        @select="onSelect"
        @context="onContext"
        @remove="onRemove"
      />
    </section>
    <section class="right-col">
      <div v-if="mode==='view'" class="panel pad">
        <h3 style="margin:0 0 8px;">檢視模式</h3>
        <p class="muted" v-if="activeFile">目前選擇：{{ activeFile.name }}</p>
        <p class="muted" v-else>請在左側選擇一個 PDF 檔案</p>
      </div>
      <div v-else-if="mode==='convert'" class="panel pad">
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
