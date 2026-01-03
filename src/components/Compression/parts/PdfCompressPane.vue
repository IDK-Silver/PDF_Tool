<script setup lang="ts">
import { computed } from 'vue'
import { useCompressSettings } from '@/modules/compress/settings'

const settings = useCompressSettings()
// i18n is used via $t in template

const targetEffectiveDpi = computed({
  get: () => settings.s.pdf.targetEffectiveDpi,
  set: (v: number) => {
    const n = Number(v)
    settings.s.pdf.targetEffectiveDpi = Number.isFinite(n) && n > 0 ? n : settings.s.pdf.targetEffectiveDpi
  }
})

const format = computed({
  get: () => settings.s.pdf.format,
  set: (v: 'jpeg' | 'keep') => settings.s.pdf.format = v
})

const quality = computed({
  get: () => settings.s.pdf.quality,
  set: (v: number) => settings.s.pdf.quality = Math.max(50, Math.min(95, Math.round(v)))
})

// 黑白（二值）策略已移除（v1 僅做 JPEG/Flate 與結構最佳化）

const losslessOptimize = computed({
  get: () => settings.s.pdf.losslessOptimize,
  set: (v: boolean) => settings.s.pdf.losslessOptimize = v
})

const removeMetadata = computed({
  get: () => settings.s.pdf.removeMetadata,
  set: (v: boolean) => settings.s.pdf.removeMetadata = v
})

const downsampleRule = computed({
  get: () => settings.s.pdf.downsampleRule,
  set: (v: 'always' | 'whenAbove') => settings.s.pdf.downsampleRule = v
})

const thresholdEffectiveDpi = computed({
  get: () => settings.s.pdf.thresholdEffectiveDpi,
  set: (v: number) => {
    const n = Number(v)
    settings.s.pdf.thresholdEffectiveDpi = Number.isFinite(n) && n > 0 ? n : settings.s.pdf.thresholdEffectiveDpi
  }
})
</script>

<template>
  <section class="max-w-4xl mx-auto h-full flex flex-col">
    <!-- Scrollable form area -->
    <div class="flex-1 overflow-y-auto pr-2">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left column: Image processing -->
        <div class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))]">
          <h3 class="text-base font-semibold border-b border-[hsl(var(--border))] pb-2">{{ $t('compression.pdf.imageProcessing') }}</h3>

          <!-- DPI mode -->
          <div class="space-y-2">
            <label class="block text-sm font-medium">{{ $t('compression.pdf.downsampleMode') }}</label>
            <select v-model="downsampleRule"
              class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]">
              <option value="always">{{ $t('compression.pdf.downsampleAlways') }}</option>
              <option value="whenAbove">{{ $t('compression.pdf.downsampleWhenAbove') }}</option>
            </select>
          </div>

          <!-- DPI settings -->
          <div class="space-y-4">
            <!-- Target DPI (always visible) -->
            <div class="space-y-2">
              <label class="block text-sm font-medium">{{ $t('compression.pdf.targetDpi') }}</label>
              <input type="number" step="any" v-model.number="targetEffectiveDpi"
                class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" />
            </div>

            <!-- Threshold DPI (conditional mode only) -->
            <div v-if="downsampleRule === 'whenAbove'" class="space-y-2">
              <label class="block text-sm font-medium">
                {{ $t('compression.pdf.thresholdDpi') }}
                <span class="text-xs text-[hsl(var(--muted-foreground))]">{{ $t('compression.pdf.thresholdDpiHint') }}</span>
              </label>
              <input type="number" step="any" v-model.number="thresholdEffectiveDpi"
                class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" />
            </div>
          </div>

          <!-- Image format -->
          <div class="space-y-2">
            <label class="block text-sm font-medium">{{ $t('compression.pdf.imageFormat') }}</label>
            <select v-model="format"
              class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]">
              <option value="jpeg">{{ $t('compression.pdf.formatJpeg') }}</option>
              <option value="keep">{{ $t('compression.pdf.formatKeep') }}</option>
            </select>
          </div>

          <!-- Quality slider -->
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <label class="text-sm font-medium">{{ $t('compression.pdf.quality') }}</label>
              <span class="text-sm font-mono text-[hsl(var(--muted-foreground))]">{{ quality }}</span>
            </div>
            <input type="range" min="50" max="95" step="1" v-model.number="quality"
              class="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[hsl(var(--muted))]" />
            <div class="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
              <span>{{ $t('compression.pdf.smallerFile') }}</span>
              <span>{{ $t('compression.pdf.higherQuality') }}</span>
            </div>
          </div>
        </div>

        <!-- Right column: Structure optimization -->
        <div class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))]">
          <h3 class="text-base font-semibold border-b border-[hsl(var(--border))] pb-2">{{ $t('compression.pdf.structureOptimization') }}</h3>
          <div class="space-y-3 pt-2">
            <label class="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" v-model="losslessOptimize"
                class="mt-0.5 w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]" />
              <div class="flex-1">
                <span class="text-sm font-medium group-hover:text-[hsl(var(--primary))]">{{ $t('compression.pdf.losslessOptimize') }}</span>
                <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  {{ $t('compression.pdf.losslessOptimizeDesc') }}
                </p>
              </div>
            </label>

            <label class="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" v-model="removeMetadata"
                class="mt-0.5 w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]" />
              <div class="flex-1">
                <span class="text-sm font-medium group-hover:text-[hsl(var(--primary))]">{{ $t('compression.pdf.removeMetadata') }}</span>
                <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  {{ $t('compression.pdf.removeMetadataDesc') }}
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
