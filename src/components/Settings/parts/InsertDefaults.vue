<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/modules/settings/store'

const settings = useSettingsStore()
const s = settings.s
const useCurrentPageSize = computed(() => s.insertPaper === 'CurrentPage')

const number = (e: Event, fallback: number) => {
  const v = Number((e.target as HTMLInputElement).value)
  return Number.isFinite(v) ? v : fallback
}

function toggleOrientation() {
  if (useCurrentPageSize.value) return
  s.insertOrientation = s.insertOrientation === 'portrait' ? 'landscape' : 'portrait'
}
</script>

<template>
  <div class="space-y-3 text-sm">
    <!-- Paper and orientation -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="md:col-span-2">
        <label class="block mb-1">{{ $t('settings.insertDefaults.paper') }}</label>
        <select v-model="s.insertPaper" class="w-full border border-border rounded px-2 py-1 bg-input text-foreground">
          <option value="CurrentPage">{{ $t('settings.insertDefaults.paperCurrentPage') }}</option>
          <option value="A4">{{ $t('settings.insertDefaults.paperA4') }}</option>
          <option value="Letter">{{ $t('settings.insertDefaults.paperLetter') }}</option>
          <option value="A5">{{ $t('settings.insertDefaults.paperA5') }}</option>
          <option value="Legal">{{ $t('settings.insertDefaults.paperLegal') }}</option>
          <option value="Tabloid">{{ $t('settings.insertDefaults.paperTabloid') }}</option>
          <option value="Custom">{{ $t('settings.insertDefaults.paperCustom') }}</option>
        </select>
      </div>
      <div>
        <label class="block mb-1">{{ $t('settings.insertDefaults.orientation') }}</label>
        <div class="flex items-center gap-2">
          <button
            @click="toggleOrientation"
            :disabled="useCurrentPageSize"
            class="px-2 py-1 rounded border border-border bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:bg-hover"
          >
            {{ s.insertOrientation === 'portrait' ? $t('settings.insertDefaults.portrait') : $t('settings.insertDefaults.landscape') }}
          </button>
        </div>
        <p v-if="useCurrentPageSize" class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.insertDefaults.orientationCurrentPageDescription') }}</p>
      </div>
    </div>
    <!-- Custom size -->
    <div>
      <label class="block mb-1">{{ $t('settings.insertDefaults.customSize') }}</label>
      <div class="flex items-center gap-2">
        <input class="w-24 border border-border rounded px-2 py-1 bg-input text-foreground" :disabled="s.insertPaper !== 'Custom'" :value="s.insertCustomWidthMm" @input="s.insertCustomWidthMm = number($event, s.insertCustomWidthMm)" />
        <span>×</span>
        <input class="w-24 border border-border rounded px-2 py-1 bg-input text-foreground" :disabled="s.insertPaper !== 'Custom'" :value="s.insertCustomHeightMm" @input="s.insertCustomHeightMm = number($event, s.insertCustomHeightMm)" />
      </div>
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.insertDefaults.customSizeDescription') }}</p>
    </div>
  </div>
</template>
