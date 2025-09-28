<script setup lang="ts">
import type { PdfFile } from '../types/pdf'

const props = defineProps<{ activeFile: PdfFile | null }>()
</script>

<template>
  <div class="panel pad">
    <h3 style="margin:0 0 8px;">批次轉換（單選）</h3>
    <p class="muted" v-if="props.activeFile">目前選擇：{{ props.activeFile.name }}</p>
    <p class="muted" v-else>請在左側選擇一個 PDF 檔案</p>
  </div>
</template>

