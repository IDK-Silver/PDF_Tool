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
        <input class="input search" v-model.trim="query" type="text" placeholder="搜尋檔名..." />
        <div class="head-right">
          <slot name="actions" />
          <button class="btn" type="button" @click="emit('add')">新增檔案</button>
        </div>
      </div>
      <div class="files">
        <template v-if="props.files.length">
          <FileListItem
            v-for="f in props.files"
            :key="f.id"
            :file="f"
            :active="props.activeId === f.id"
            @select="emit('select', f.id)"
            @remove="emit('remove', $event)"
          />
        </template>
        <div v-else class="empty muted">無檔案</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.list-wrap { padding: 12px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.list { position: relative; flex: 1 1 0; min-height: 0; display: grid; grid-template-rows: auto 1fr; overflow: hidden; }
.panel.list { border: none; box-shadow: 0 1px 2px rgba(0,0,0,.04); }

.list-head {
  display: grid;
  /* 左：搜尋欄，右：新增按鈕 */
  grid-template-columns: 1fr auto; 
  gap: 8px;
  /* 與項目區塊對齊 */
  padding: 8px;
}
.head-right { display: flex; align-items: center; gap: 8px; }
.files { min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px;}
.search {
  /* 讓搜尋欄與列表項目的內距一致 */
  height: 32px;
}
.empty { padding: 16px; text-align: center; }
.muted { color: var(--text-muted, #6b7280); }
</style>
