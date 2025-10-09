<script setup lang="ts">
import { useExportSettings } from '@/modules/export/settings'
const exp = useExportSettings()
const s = exp.s

const number = (e: Event, fallback: number) => {
  const v = Number((e.target as HTMLInputElement).value)
  return Number.isFinite(v) ? v : fallback
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
    <div>
      <label class="block mb-1">匯出圖片格式</label>
      <select v-model="s.imageFormat" class="w-full border border-border rounded px-2 py-1 bg-input text-foreground">
        <option value="png">PNG（無損）</option>
        <option value="jpeg">JPEG（有損）</option>
      </select>
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">決定匯出之圖片檔格式。</p>
    </div>
    <div>
      <label class="block mb-1">匯出解析度（DPI）</label>
      <input class="w-full border border-border rounded px-2 py-1 bg-input text-foreground" :value="s.imageDpi" @input="s.imageDpi = number($event, s.imageDpi)" />
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">72 = 1 倍，建議 150 或 300。</p>
    </div>
    <div>
      <label class="block mb-1">JPEG 品質（1–100）</label>
      <input class="w-full border border-border rounded px-2 py-1 bg-input text-foreground" :disabled="s.imageFormat !== 'jpeg'" :value="s.imageQuality" @input="s.imageQuality = number($event, s.imageQuality)" />
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">僅 JPEG 有效；值越高越清晰，檔案越大。</p>
    </div>
  </div>
</template>

