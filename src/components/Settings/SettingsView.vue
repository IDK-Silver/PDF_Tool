<script setup lang="ts">
import { useSettingsStore } from '@/modules/settings/store'
import { useUiStore } from '@/modules/ui/store'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ExportSettings from './parts/ExportSettings.vue'
import InsertDefaults from './parts/InsertDefaults.vue'
import { ChevronDoubleRightIcon } from '@heroicons/vue/24/outline'
import { useCompressSettings } from '@/modules/compress/settings'
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog'

const { t } = useI18n()
const settings = useSettingsStore()
const s = settings.s
const ui = useUiStore()
const route = useRoute()
const compressSettings = useCompressSettings()

const number = (e: Event, fallback: number) => {
  const v = Number((e.target as HTMLInputElement).value)
  return Number.isFinite(v) ? v : fallback
}
const clampZoomMax = (v: number) => Math.min(800, Math.max(50, Math.round(v)))

async function resetToDefaults() {
  const confirmed = await confirmDialog(t('settings.resetConfirm'))
  if (confirmed) {
    settings.reset()
  }
}

// 初次載入若網址帶 hash，自動捲動到對應區塊
function scrollToHash(raw: string | null | undefined) {
  const hash = raw || ''
  // only accept simple #id fragments (avoid '#/settings')
  if (!hash.startsWith('#') || hash.length <= 1 || hash.startsWith('#/')) return
  // basic validation for CSS ID selector
  if (!/^#[A-Za-z][\w\-:.]*$/.test(hash)) return
  const root = document.querySelector('[data-settings-scroll-root]') as HTMLElement | null
  const el = document.querySelector(hash) as HTMLElement | null
  if (!root || !el) return
  const header = root.querySelector('header.sticky') as HTMLElement | null
  const offset = (header?.offsetHeight ?? 0) + 8
  const rRect = root.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  const top = root.scrollTop + (eRect.top - rRect.top) - offset
  root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

onMounted(() => { scrollToHash(route.hash) })
watch(() => route.hash, (h) => { scrollToHash(h) })
</script>

<template>
  <div class="h-full overflow-auto scrollbar-visible" data-settings-scroll-root>
    <div class="mx-auto max-w-3xl p-6 space-y-8 text-sm">
      <header class="sticky top-0 bg-background/80 backdrop-blur z-10 py-3 border-b">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <!-- 展開側欄按鈕 -->
            <button
              v-if="ui.sidebarCollapsed"
              @click="ui.setSidebarCollapsed(false)"
              class="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-[hsl(var(--selection))] transition"
              :title="$t('settings.expandSidebar')"
              :aria-label="$t('settings.expandSidebar')"
            >
              <ChevronDoubleRightIcon class="w-5 h-5" />
            </button>
            <h1 class="text-lg font-medium">{{ $t('settings.title') }}</h1>
          </div>
          <button @click="resetToDefaults" class="px-2 py-1 text-sm rounded border border-border bg-card hover:bg-hover transition-colors">{{ $t('settings.resetDefaults') }}</button>
        </div>
        <p class="text-xs text-[hsl(var(--muted-foreground))]">{{ $t('settings.subtitle') }}</p>
      </header>

      <section id="language" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.language.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">{{ $t('settings.language.select') }}</label>
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <label class="flex items-center gap-2">
                <input type="radio" value="system" v-model="s.language" />
                <span>{{ $t('settings.language.system') }}</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="zh-TW" v-model="s.language" />
                <span>繁體中文</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="en" v-model="s.language" />
                <span>English</span>
              </label>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {{ $t('settings.language.description') }}
            </p>
          </div>
        </div>
      </section>

      <section id="appearance" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.appearance.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">{{ $t('settings.appearance.themeMode') }}</label>
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <label class="flex items-center gap-2">
                <input type="radio" value="system" v-model="s.theme" />
                <span>{{ $t('settings.appearance.system') }}</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="light" v-model="s.theme" />
                <span>{{ $t('settings.appearance.light') }}</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="dark" v-model="s.theme" />
                <span>{{ $t('settings.appearance.dark') }}</span>
              </label>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {{ $t('settings.appearance.themeDescription') }}
            </p>
          </div>

          <div class="flex items-start gap-2" :class="{ 'opacity-50': settings.actualTheme !== 'dark' }">
            <input type="checkbox" id="invertColorsInDarkMode" v-model="s.invertColorsInDarkMode" :disabled="settings.actualTheme !== 'dark'" class="mt-1 w-4 h-4" />
            <label for="invertColorsInDarkMode" class="flex-1">
              <span class="font-medium">{{ $t('settings.appearance.invertColors') }}</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                {{ $t('settings.appearance.invertColorsDescription') }}
                <span v-if="settings.actualTheme !== 'dark'" class="block mt-1">{{ $t('settings.appearance.invertColorsDisabled') }}</span>
              </p>
            </label>
          </div>
        </div>
      </section>

      

      <section id="high-res-rendering" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.highRes.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <p class="text-xs text-[hsl(var(--muted-foreground))]">
            {{ $t('settings.highRes.description') }}
          </p>

          <div>
            <label class="block mb-1">{{ $t('settings.highRes.outputFormat') }}</label>
            <select v-model="s.renderFormat" class="w-full border border-border rounded px-2 py-1 bg-input text-foreground">
              <option value="raw">{{ $t('settings.highRes.formatRaw') }}</option>
              <option value="webp">{{ $t('settings.highRes.formatWebP') }}</option>
              <option value="png">{{ $t('settings.highRes.formatPNG') }}</option>
              <option value="jpeg">{{ $t('settings.highRes.formatJPEG') }}</option>
            </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.highRes.formatDescription') }}</p>
          </div>

          <div v-if="s.renderFormat === 'raw'">
            <label class="block mb-1">{{ $t('settings.highRes.rawCacheLimit') }}</label>
            <input
              class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
              :value="s.rawHighResCacheSize"
              @input="s.rawHighResCacheSize = number($event, s.rawHighResCacheSize)"
            />
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {{ $t('settings.highRes.rawCacheDescription') }}
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">{{ $t('settings.highRes.dpiCap') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.highResDpiCap"
                @input="s.highResDpiCap = number($event, s.highResDpiCap)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.highRes.dpiCapDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.highRes.dprCap') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.dprCap"
                @input="s.dprCap = number($event, s.dprCap)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.highRes.dprCapDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.highRes.maxOutputWidth') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.maxOutputWidth"
                @input="s.maxOutputWidth = number($event, s.maxOutputWidth)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.highRes.maxOutputWidthDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.highRes.actualSizeDpiCap') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.actualModeDpiCap"
                @input="s.actualModeDpiCap = number($event, s.actualModeDpiCap)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {{ $t('settings.highRes.actualSizeDpiCapDescription') }}
              </p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.highRes.zoomRerenderDelay') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.zoomRerenderDelayMs"
                @input="s.zoomRerenderDelayMs = number($event, s.zoomRerenderDelayMs)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.highRes.zoomRerenderDelayDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.highRes.hiResRerenderDelay') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.hiResRerenderDelayMs"
                @input="s.hiResRerenderDelayMs = number($event, s.hiResRerenderDelayMs)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.highRes.hiResRerenderDelayDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.highRes.scrollEndDelay') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.scrollEndDebounceMs"
                @input="s.scrollEndDebounceMs = number($event, s.scrollEndDebounceMs)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.highRes.scrollEndDelayDescription') }}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="performance" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.performance.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">{{ $t('settings.performance.maxConcurrentRenders') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.maxConcurrentRenders"
                @input="s.maxConcurrentRenders = number($event, s.maxConcurrentRenders)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.performance.maxConcurrentRendersDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.performance.highResOverscan') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.highResOverscan"
                @input="s.highResOverscan = number($event, s.highResOverscan)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.performance.highResOverscanDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.performance.structureOverscan') }}</label>
              <input
                type="number"
                min="1"
                max="100"
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.structureOverscan"
                @input="s.structureOverscan = number($event, s.structureOverscan)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.performance.structureOverscanDescription') }}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="zoom-interaction" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.zoom.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-1">{{ $t('settings.zoom.maxZoom') }}</label>
            <input
              type="number"
              step="10"
              min="50"
              max="800"
              class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
              :value="s.zoomMaxPercent"
              @input="s.zoomMaxPercent = clampZoomMax(number($event, s.zoomMaxPercent))"
            />
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {{ $t('settings.zoom.maxZoomDescription') }}
            </p>
          </div>
          <div>
            <label class="block mb-1">{{ $t('settings.zoom.sensitivity') }}</label>
            <input
              type="number"
              step="0.0001"
              min="0.0005"
              max="0.005"
              class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
              :value="s.zoomSensitivity"
              @input="s.zoomSensitivity = number($event, s.zoomSensitivity)"
            />
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {{ $t('settings.zoom.sensitivityDescription') }}
            </p>
          </div>
          <div class="pt-2 border-t">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">
              {{ $t('settings.zoom.sensitivityTip') }}
            </p>
          </div>
        </div>
      </section>

      <section id="fileops" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.fileOps.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">{{ $t('settings.fileOps.editSaveBehavior') }}</label>
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <label class="flex items-center gap-2">
                <input type="radio" value="saveAsNew" v-model="s.deleteBehavior" />
                <span>{{ $t('settings.fileOps.saveAsNew') }}</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="overwrite" v-model="s.deleteBehavior" />
                <span>{{ $t('settings.fileOps.overwrite') }}</span>
              </label>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {{ $t('settings.fileOps.editSaveDescription') }}
            </p>
          </div>
        </div>
      </section>

      <section id="compression-save" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.compressionSave.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">{{ $t('settings.compressionSave.outputStrategy') }}</label>
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <label class="flex items-center gap-2">
                <input type="radio" value="saveAsNew" v-model="compressSettings.s.saveBehavior" />
                <span>{{ $t('settings.fileOps.saveAsNew') }}</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="overwrite" v-model="compressSettings.s.saveBehavior" />
                <span>{{ $t('settings.fileOps.overwrite') }}</span>
              </label>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {{ $t('settings.compressionSave.description') }}
            </p>
          </div>
        </div>
      </section>

      <section id="insert-defaults" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.insertDefaults.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <InsertDefaults />
        </div>
      </section>

      <section id="text-layer" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.textLayer.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="flex items-start gap-2">
            <input type="checkbox" id="enableTextExtraction" v-model="s.enableTextExtraction" class="mt-1 w-4 h-4" />
            <label for="enableTextExtraction" class="flex-1">
              <span class="font-medium">{{ $t('settings.textLayer.enableTextExtraction') }}</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                {{ $t('settings.textLayer.enableTextExtractionDescription') }}
              </p>
            </label>
          </div>

          <div :class="{ 'opacity-50 pointer-events-none': !s.enableTextExtraction }">
            <label class="block mb-1">{{ $t('settings.textLayer.range') }}</label>
            <input
              type="number"
              min="0"
              max="20"
              class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
              :value="s.textLayerRange"
              @input="s.textLayerRange = number($event, s.textLayerRange)"
            />
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {{ $t('settings.textLayer.rangeDescription') }}
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3" :class="{ 'opacity-50 pointer-events-none': !s.enableTextExtraction }">
            <div>
              <label class="block mb-1">{{ $t('settings.textLayer.globalOffsetX') }}</label>
              <input
                type="number"
                step="0.1"
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.textLayerGlobalOffsetX"
                @input="s.textLayerGlobalOffsetX = number($event, s.textLayerGlobalOffsetX)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.textLayer.globalOffsetXDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.textLayer.globalOffsetY') }}</label>
              <input
                type="number"
                step="0.1"
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.textLayerGlobalOffsetY"
                @input="s.textLayerGlobalOffsetY = number($event, s.textLayerGlobalOffsetY)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.textLayer.globalOffsetYDescription') }}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3" :class="{ 'opacity-50 pointer-events-none': !s.enableTextExtraction }">
            <div>
              <label class="block mb-1">{{ $t('settings.textLayer.overlapThreshold') }}</label>
              <input
                type="number"
                step="0.1"
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.textLayerOverlapThreshold"
                @input="s.textLayerOverlapThreshold = number($event, s.textLayerOverlapThreshold)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.textLayer.overlapThresholdDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.textLayer.minSpacing') }}</label>
              <input
                type="number"
                step="0.1"
                min="0"
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.textLayerMinSpacing"
                @input="s.textLayerMinSpacing = number($event, s.textLayerMinSpacing)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.textLayer.minSpacingDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.textLayer.smallGapThreshold') }}</label>
              <input
                type="number"
                step="0.1"
                min="0"
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.textLayerSmallGapThreshold"
                @input="s.textLayerSmallGapThreshold = number($event, s.textLayerSmallGapThreshold)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.textLayer.smallGapThresholdDescription') }}</p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.textLayer.smallGapSpacing') }}</label>
              <input
                type="number"
                step="0.1"
                min="0"
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.textLayerSmallGapSpacing"
                @input="s.textLayerSmallGapSpacing = number($event, s.textLayerSmallGapSpacing)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{{ $t('settings.textLayer.smallGapSpacingDescription') }}</p>
            </div>
          </div>
          <div class="pt-2 border-t">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">
              {{ $t('settings.textLayer.tip') }}
            </p>
          </div>
        </div>
      </section>

      <section id="export" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.export.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <ExportSettings />
        </div>
      </section>

      <section id="encoding" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.encoding.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">{{ $t('settings.encoding.jpegQuality') }}</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.jpegQuality"
                @input="s.jpegQuality = number($event, s.jpegQuality)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {{ $t('settings.encoding.jpegQualityDescription') }}
              </p>
            </div>
            <div>
              <label class="block mb-1">{{ $t('settings.encoding.pngCompression') }}</label>
              <select v-model="s.pngCompression" class="w-full border border-border rounded px-2 py-1 bg-input text-foreground">
                <option value="fast">{{ $t('settings.encoding.pngFast') }}</option>
                <option value="balanced">{{ $t('settings.encoding.pngBalanced') }}</option>
                <option value="best">{{ $t('settings.encoding.pngBest') }}</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {{ $t('settings.encoding.pngCompressionDescription') }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="debug" class="space-y-3">
        <h2 class="font-medium text-base">{{ $t('settings.debug.title') }}</h2>
        <div class="rounded-md border p-4 space-y-3">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="s.devPerfOverlay" />
            <span>{{ $t('settings.debug.perfOverlay') }}</span>
          </label>
          <p class="text-xs text-[hsl(var(--muted-foreground))]">
            {{ $t('settings.debug.perfOverlayDescription') }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
