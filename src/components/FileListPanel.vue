<script setup lang="ts">
import { computed, ref } from 'vue'
import FileListItem from './FileListItem.vue'

interface PdfFile { id: string; path: string; name: string; pages?: number }

const props = withDefaults(defineProps<{
  files: PdfFile[]
  activeId: string | null
}>(), {})

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'select', id: string | null): void
  (e: 'context', payload: { id: string; x: number; y: number }): void
  (e: 'remove', id: string): void
}>()

const q = ref('')
const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return props.files
  return props.files.filter(f => f.name.toLowerCase().includes(term))
})
</script>

<template>
  <section class="list-wrap">
    <div class="panel list">
      <div class="list-head">
        <input class="input search" v-model.trim="q" type="text" placeholder="搜尋檔名..." />
        <button class="btn" type="button" @click="emit('add')">新增檔案</button>
      </div>
      <div class="files">
        <template v-if="filtered.length">
          <FileListItem
            v-for="f in filtered"
            :key="f.id"
            :file="f"
            :active="props.activeId === f.id"
            @select="emit('select', f.id)"
            @context="emit('context', $event)"
            @remove="emit('remove', $event)"
          />
        </template>
        <div v-else class="empty muted">沒有符合搜尋的檔案</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.list-wrap { padding: 12px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.list { flex: 1 1 0; min-height: 0; display: grid; grid-template-rows: auto 1fr; overflow: hidden; }
.panel.list { border: none; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.list-head {
  display: grid;
  /* 左：搜尋欄，右：新增按鈕 */
  grid-template-columns: 1fr auto; 
  gap: 8px;
  /* 與項目區塊對齊 */
  padding: 8px;
}
.files { min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.search {
  /* 讓搜尋欄與列表項目的內距一致 */
  height: 32px;
}
.empty { padding: 16px; text-align: center; }
.muted { color: var(--text-muted, #6b7280); }
</style>
