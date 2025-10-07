<script setup lang="ts">
import { ref, computed } from 'vue'
import { FileList } from './index'
import type { FileItem } from './types'
import { useMediaStore } from '@/modules/media/store'
import { open } from '@tauri-apps/plugin-dialog'

const items = ref<FileItem[]>([])
const selectedId = ref<string | null>(null)
const q = ref('')

const media = useMediaStore()

function baseName(p: string) {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function ensureItem(path: string): FileItem {
  const name = baseName(path)
  const existing = items.value.find(i => i.path === path)
  if (existing) return existing
  const it: FileItem = { id: path, name, path }
  items.value.push(it)
  return it
}

async function addFiles() {
  const picked = await open({
    multiple: true,
    filters: [
      { name: 'PDF / 圖片', extensions: ['pdf','png','jpg','jpeg','webp','gif','bmp','tiff','tif'] },
    ],
  })
  if (!picked) return
  const list = Array.isArray(picked) ? picked : [picked]
  // 新增並選取第一個
  const first = ensureItem(list[0])
  selectedId.value = first.id
  media.select(first)
  // 其餘僅加入清單
  for (let i = 1; i < list.length; i++) ensureItem(list[i])
}

function onItemClick(item: FileItem) {
  selectedId.value = item.id
  media.select(item)
}

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase()
  if (!keyword) return items.value
  return items.value.filter(i => i.name.toLowerCase().includes(keyword) || i.path.toLowerCase().includes(keyword))
})
</script>

<template>
  <!-- <div class="w-full border-b border-[hsl(var(--border))] p-[8px]">
  </div> -->

  <!-- <div p-[8px]>

  </div> -->

  <div class="grid grid-cols-10 gap-1 h-auto min-h-8 max-w-[17]">
    <input v-model="q" class="col-span-8 border rounded text-sm pl-2" placeholder="搜尋檔名或路徑" />
    <button class="col-span-2 border rounded  text-sm" @click="addFiles">＋</button>
  </div>
  <FileList :items="filtered" v-bind:selected-id="selectedId" @update:selectedId="selectedId = $event"
    @item-click="onItemClick" />
</template>
