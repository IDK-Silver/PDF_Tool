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
      <label class="block mb-1">{{ $t('settings.export.imageFormat') }}</label>
      <select v-model="s.imageFormat" class="w-full border border-border rounded px-2 py-1 bg-input text-foreground">
        <option value="png">{{ $t('settings.export.formatPNG') }}</option>
        <option value="jpeg">{{ $t('settings.export.formatJPEG') }}</option>
      </select>
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.export.formatDescription') }}</p>
    </div>
    <div>
      <label class="block mb-1">{{ $t('settings.export.dpi') }}</label>
      <input class="w-full border border-border rounded px-2 py-1 bg-input text-foreground" :value="s.imageDpi" @input="s.imageDpi = number($event, s.imageDpi)" />
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.export.dpiDescription') }}</p>
    </div>
    <div>
      <label class="block mb-1">{{ $t('settings.export.jpegQuality') }}</label>
      <input class="w-full border border-border rounded px-2 py-1 bg-input text-foreground" :disabled="s.imageFormat !== 'jpeg'" :value="s.imageQuality" @input="s.imageQuality = number($event, s.imageQuality)" />
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.export.jpegQualityDescription') }}</p>
    </div>
  </div>
</template>

