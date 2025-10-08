<script setup lang="ts">
import { useSettingsStore } from '@/modules/settings/store'
const settings = useSettingsStore()
const s = settings.s

const number = (e: Event, fallback: number) => {
  const v = Number((e.target as HTMLInputElement).value)
  return Number.isFinite(v) ? v : fallback
}

function toggleOrientation() {
  s.value.insertOrientation = s.value.insertOrientation === 'portrait' ? 'landscape' : 'portrait'
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
    <div class="md:col-span-2">
      <label class="block mb-1">預設紙張</label>
      <select v-model="s.insertPaper" class="w-full border rounded px-2 py-1">
        <option value="A4">A4（210 × 297 mm）</option>
        <option value="Letter">Letter（216 × 279.4 mm）</option>
        <option value="A5">A5（148 × 210 mm）</option>
        <option value="Legal">Legal（216 × 355.6 mm）</option>
        <option value="Tabloid">Tabloid（279.4 × 431.8 mm）</option>
        <option value="Custom">自訂尺寸（下方輸入）</option>
      </select>
    </div>
    <div>
      <label class="block mb-1">方向</label>
      <div class="flex items-center gap-2">
        <button @click="toggleOrientation" class="px-2 py-1 rounded border bg-white">
          {{ s.insertOrientation === 'portrait' ? '直向' : '橫向' }}
        </button>
      </div>
    </div>
    <div>
      <label class="block mb-1">自訂寬 × 高（mm）</label>
      <div class="flex items-center gap-2">
        <input class="w-20 border rounded px-2 py-1" :disabled="s.insertPaper !== 'Custom'" :value="s.insertCustomWidthMm" @input="s.insertCustomWidthMm = number($event, s.insertCustomWidthMm)" />
        <span>×</span>
        <input class="w-20 border rounded px-2 py-1" :disabled="s.insertPaper !== 'Custom'" :value="s.insertCustomHeightMm" @input="s.insertCustomHeightMm = number($event, s.insertCustomHeightMm)" />
      </div>
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">僅在選擇「自訂尺寸」時生效。</p>
    </div>
  </div>
</template>

