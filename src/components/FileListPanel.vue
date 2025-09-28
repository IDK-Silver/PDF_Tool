<script setup lang="ts">
import FileListItem from './FileListItem.vue'
import type { PdfFile } from '../types/pdf'

const props = defineProps<{
  files: PdfFile[]
  activeId: string | null
}>()

const query = defineModel<string>('query', { default: '' })

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'select', id: string | null): void
  (e: 'remove', id: string): void
}>()
</script>

<template>
  <section class="list-wrap">
    <div class="panel list">

      <div class="list-head">
        <div class="search-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" />
          </svg>
          <input class="input search" v-model.trim="query" type="text" placeholder="Search" />
        </div>
        <div class="head-right">
          <slot name="actions" />
          <button class="icon-btn" type="button" @click="emit('add')" aria-label="新增檔案" title="新增檔案">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
      <div class="files">
        <template v-if="props.files.length">
          <FileListItem v-for="f in props.files" :key="f.id" :file="f" :active="props.activeId === f.id"
            @select="emit('select', f.id)" @remove="emit('remove', $event)" />
        </template>
        <div v-else class="empty muted">無檔案</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.list-wrap {
  padding: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

.panel.list {
  border: none;
  box-shadow: white;
}

.list-head {
  display: grid;
  /* 左：搜尋欄，右：新增按鈕 */
  grid-template-columns: 7fr auto;
  gap: 8px;
  /* 與項目區塊對齊 */
  padding: 8px;
  padding-left: 4px;  /* 對齊 ModeTabs 左內距（10px）*/
  padding-right: 12px; /* 對齊列表列的 (files 8px + row 8px) */
}

.head-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.files {
  min-height: 0;
  overflow-y: auto;
  padding: 2px;
  padding-left: 0px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.search {
  /* 讓搜尋欄與列表項目的內距一致 */
  height: 32px;
}
/* 移除搜尋欄聚焦時的藍色外框 */
.input.search:focus { outline: none !important; box-shadow: none !important; }
/* 搜尋欄容器與圖示 */
.search-wrap { position: relative; }
.search-wrap .search { padding-left: 28px; }
.search-wrap .search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--text, #111827); }
/* 讓 placeholder 不要太淡 */
.search::placeholder { color: var(--text, #111827); opacity: .85; }

.empty {
  padding: 16px;
  text-align: center;
}

.muted {
  color: var(--text-muted, #6b7280);
}

.icon-btn { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; color: var(--text, #111827); border-radius: 6px; cursor: pointer; }
.icon-btn:hover { background: var(--hover, #f3f4f6); }
.icon-btn .icon { width: 16px; height: 16px; }
</style>
