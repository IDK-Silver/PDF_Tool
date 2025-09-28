<script setup lang="ts">
import type { PdfFile } from '../types/pdf'
import { inject } from 'vue'
import type { Ref } from 'vue'
import { ChevronDoubleRightIcon } from '@heroicons/vue/24/outline'

defineProps<{ activeFile: PdfFile | null }>()
const leftCollapsed = inject('leftCollapsed') as Ref<boolean> | undefined
const setLeftCollapsed = inject('setLeftCollapsed') as ((v?: boolean) => void) | undefined
</script>

<template>
  <div class="panel pad">
    <div class="view-header">
      <div class="title">
        <button v-if="leftCollapsed" class="btn-expand" type="button" @click="setLeftCollapsed?.(false)" aria-label="展開側欄" title="展開側欄">
          <ChevronDoubleRightIcon class="icon" aria-hidden="true" />
        </button>
        <h2>批次轉換</h2>
      </div>
    </div>
    <p class="muted">未來</p>
    <!-- <h3 style="margin:0 0 8px;">批次轉換（單選）</h3>
    <p class="muted" v-if="props.activeFile">目前選擇：{{ props.activeFile.name }}</p>
    <p class="muted" v-else>請在左側選擇一個 PDF 檔案</p> -->
  </div>
</template>

<style scoped>
.view-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.title h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text, #111827); }
.muted { color: var(--text-muted, #6b7280); }
.btn-expand { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: none; background: transparent; color: var(--text, #111827); border-radius: 6px; cursor: pointer; }
.btn-expand:hover { background: var(--hover, #f3f4f6); }
.btn-expand .icon { width: 16px; height: 16px; }
</style>
