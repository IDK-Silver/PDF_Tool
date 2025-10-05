<script setup lang="ts">
import { ref } from 'vue'
import { FileList } from './index'
import type { FileItem } from './types'

const items = ref<FileItem[]>([
  { id: 'm-1', name: '影片清單.pdf', path: '/Users/demo/Movies/影片清單.pdf' },
  { id: 'm-2', name: '封面.jpg', path: '/Users/demo/Movies/封面.jpg' },
])

const selectedId = ref<string | null>(null)
</script>

<template>
  <FileList :items="items" v-bind:selected-id="selectedId" @update:selectedId="selectedId = $event" />
</template>

