<script setup lang="ts">
import { ref } from 'vue'
import { FileList } from './index'
import type { FileItem } from './types'

const items = ref<FileItem[]>([
  { id: 'p-1', name: '合併目錄.pdf', path: '/Users/yufeng/Desktop/00-115碩博甄試簡章' },
])

const selectedId = ref<string | null>(null)
</script>

<template>
  <FileList :items="items" v-bind:selected-id="selectedId" @update:selectedId="selectedId = $event" />
</template>

