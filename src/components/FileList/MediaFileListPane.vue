<script setup lang="ts">
import { MagnifyingGlassIcon } from '@heroicons/vue/24/solid'
import { ref, computed } from 'vue'
import { FileList } from './index'
import type { FileItem } from './types'
import { useMediaStore } from '@/modules/media/store'
import { useFileListStore } from '@/modules/filelist/store'
import { open } from '@tauri-apps/plugin-dialog'

const q = ref('')

const media = useMediaStore()
const filelist = useFileListStore()

const selectedId = computed({
  get: () => media.selected?.id ?? null,
  set: (id: string | null) => {
    if (!id) {
      media.clear()
      return
    }
    const next = filelist.items.find(i => i.id === id)
    if (next) media.select(next)
  },
})

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
  if (first) media.select(first)
}

function onItemClick(item: FileItem) {
  media.select(item)
}

function onRemove(item: FileItem) {
  // 移除並調整選取狀態
  filelist.remove(item.path)
  if (media.selected?.id === item.id) {
    const next = filtered.value.length > 0 ? filtered.value[0] : null
    if (next) media.select(next)
    else media.clear()
  }
}

const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase()
  if (!keyword) return filelist.items
  return filelist.items.filter(i => i.name.toLowerCase().includes(keyword) || i.path.toLowerCase().includes(keyword))
})
</script>

<template>
  <!-- 搜尋欄固定在頂部 -->
  <div class="flex-shrink-0">
    <div class="flex gap-2 items-center pb-2">
      <div class="relative flex-1">
        <input v-model="q" class="w-full h-8 border rounded text-sm pl-8" placeholder="Search" />
        <MagnifyingGlassIcon class="w-5 h-5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <button class="h-8 px-3 border rounded text-sm flex-shrink-0" @click="addFiles">＋</button>
    </div>
  </div>
  <!-- 檔案列表可滾動區域 -->
  <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
    <FileList :items="filtered" :selected-id="selectedId" :removable="true"
      @item-click="onItemClick" @remove="onRemove" />
  </div>
</template>
