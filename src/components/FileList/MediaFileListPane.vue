<script setup lang="ts">
import { ref, computed } from 'vue'
import { FileList } from './index'
import type { FileItem } from './types'
import { useMediaStore } from '@/modules/media/store'
import { useFileListStore } from '@/modules/filelist/store'
import { open } from '@tauri-apps/plugin-dialog'

const selectedId = ref<string | null>(null)
const q = ref('')

const media = useMediaStore()
const filelist = useFileListStore()

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
  filelist.addPaths(list)
  const firstPath = list[0]
  const first = filelist.items.find(i => i.path === firstPath)
  if (first) {
    selectedId.value = first.id
    media.select(first)
  }
}

function onItemClick(item: FileItem) {
  selectedId.value = item.id
  media.select(item)
}

function onRemove(item: FileItem) {
  // 移除並調整選取狀態
  filelist.remove(item.path)
  if (selectedId.value === item.id) {
    const next = (filtered.value && filtered.value.length > 0) ? filtered.value[0] : null
    if (next) {
      selectedId.value = next.id
      media.select(next)
    } else {
      selectedId.value = null
      media.clear()
    }
  }
}

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase()
  if (!keyword) return filelist.items
  return filelist.items.filter(i => i.name.toLowerCase().includes(keyword) || i.path.toLowerCase().includes(keyword))
})
</script>

<template>
  <div class="grid grid-cols-10 gap-1 h-auto min-h-10 max-w-[17] pb-2">
    <input v-model="q" class="col-span-8 border rounded text-sm pl-2" placeholder="搜尋檔名或路徑" />
    <button class="col-span-2 border rounded  text-sm" @click="addFiles">＋</button>
  </div>
  <FileList :items="filtered" v-bind:selected-id="selectedId" :removable="true"
    @update:selectedId="selectedId = $event" @item-click="onItemClick" @remove="onRemove" />
</template>
