<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, watch, onMounted } from 'vue'
import { loadSettings, saveSettingsDebounced, type AppSettings } from '../composables/persistence'
import { ChevronLeftIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
function goBack() {
  if (history.length > 1) router.back()
  else router.replace('/view')
}

const exportDpi = ref<number>(300)
const exportFormat = ref<'png' | 'jpeg'>('png')
const jpegQuality = ref<number>(0.9)
const defaultZoomMode = ref<'actual' | 'fit'>('fit')
const viewerTextIdleMs = ref<number>(100)
const viewerRenderIdleMs = ref<number>(20)
const viewerZoomTweenMs = ref<number>(120)
const switchToActualOnSidebarToggle = ref<boolean>(false)
const sidebarToggleTargetScale = ref<number>(1)
const searchHighlightRetryDelayMs = ref<number>(80)
const searchHighlightRetryCount = ref<number>(4)

onMounted(async () => {
  const s = await loadSettings()
  exportDpi.value = s.exportDpi
  exportFormat.value = s.exportFormat
  jpegQuality.value = s.jpegQuality ?? 0.9
  defaultZoomMode.value = s.defaultZoomMode ?? 'fit'
  viewerTextIdleMs.value = Number.isFinite(s.viewerTextIdleMs) ? (s.viewerTextIdleMs as number) : 100
  viewerRenderIdleMs.value = Number.isFinite(s.viewerRenderIdleMs) ? (s.viewerRenderIdleMs as number) : 20
  viewerZoomTweenMs.value = Number.isFinite(s.viewerZoomTweenMs) ? (s.viewerZoomTweenMs as number) : 120
  switchToActualOnSidebarToggle.value = !!s.switchToActualOnSidebarToggle
  sidebarToggleTargetScale.value = Number.isFinite(s.sidebarToggleTargetScale) ? (s.sidebarToggleTargetScale as number) : 1
  searchHighlightRetryDelayMs.value = Number.isFinite(s.searchHighlightRetryDelayMs) ? (s.searchHighlightRetryDelayMs as number) : 80
  searchHighlightRetryCount.value = Number.isFinite(s.searchHighlightRetryCount) ? Math.round(s.searchHighlightRetryCount as number) : 4
})

function persist() {
  const s: AppSettings = {
    exportDpi: clampDpi(exportDpi.value),
    exportFormat: exportFormat.value,
    jpegQuality: clampQuality(jpegQuality.value),
    defaultZoomMode: defaultZoomMode.value,
    viewerTextIdleMs: clampMs(viewerTextIdleMs.value),
    viewerRenderIdleMs: clampMs(viewerRenderIdleMs.value),
    viewerZoomTweenMs: clampMs(viewerZoomTweenMs.value),
    switchToActualOnSidebarToggle: !!switchToActualOnSidebarToggle.value,
    sidebarToggleTargetScale: clampScale(sidebarToggleTargetScale.value),
    searchHighlightRetryDelayMs: clampMs(searchHighlightRetryDelayMs.value),
    searchHighlightRetryCount: clampRetryCount(searchHighlightRetryCount.value),
  }
  saveSettingsDebounced(s)
}

function clampDpi(v: number) { return Math.min(1200, Math.max(72, Math.round(v || 300))) }
function clampQuality(v: number) { return Math.min(1, Math.max(0.1, Number.isFinite(v) ? v : 0.9)) }
function clampMs(v: number) { return Math.min(1000, Math.max(0, Math.round(Number.isFinite(v) ? v : 0))) }
function clampScale(v: number) { return Math.min(6, Math.max(0.1, Number.isFinite(v) ? v : 1)) }
function clampRetryCount(v: number) { return Math.min(10, Math.max(0, Math.round(Number.isFinite(v) ? v : 4))) }
watch([
  exportDpi,
  exportFormat,
  jpegQuality,
  defaultZoomMode,
  viewerTextIdleMs,
  viewerRenderIdleMs,
  viewerZoomTweenMs,
  switchToActualOnSidebarToggle,
  sidebarToggleTargetScale,
  searchHighlightRetryDelayMs,
  searchHighlightRetryCount,
], persist, { deep: false })
</script>

<template>
  <div class="settings-root">
    <div class="panel pad settings-panel">
      <div class="settings-header">
        <button class="btn-back" type="button" @click="goBack" aria-label="返回" title="返回">
          <ChevronLeftIcon class="icon" aria-hidden="true" />
        </button>
        <h3 class="title">設定</h3>
      </div>
      <div class="section">
        <h4>匯出圖片</h4>
        <div class="row">
          <label class="label" for="dpi">DPI</label>
          <input id="dpi" class="input" type="number" min="72" max="1200" step="1" v-model.number="exportDpi" />
        </div>
        <div class="row">
          <label class="label">格式</label>
          <div class="choice">
            <label><input type="radio" value="png" v-model="exportFormat" /> PNG</label>
            <label><input type="radio" value="jpeg" v-model="exportFormat" /> JPEG</label>
          </div>
        </div>
        <div class="row" v-if="exportFormat === 'jpeg'">
          <label class="label" for="q">JPEG 品質</label>
          <input id="q" class="input" type="range" min="0.1" max="1" step="0.05" v-model.number="jpegQuality" />
          <span class="muted">{{ Math.round(jpegQuality * 100) }}%</span>
        </div>
      </div>
      <div class="section">
        <h4>檢視預設</h4>
        <div class="row">
          <label class="label">縮放模式</label>
          <div class="choice">
            <label><input type="radio" value="fit" v-model="defaultZoomMode" /> 縮放到適當大小</label>
            <label><input type="radio" value="actual" v-model="defaultZoomMode" /> 實際大小</label>
          </div>
        </div>
        <div class="row">
          <label class="label">側欄切換時</label>
          <label><input type="checkbox" v-model="switchToActualOnSidebarToggle" /> 自動切換到「實際大小」</label>
        </div>
        <div class="row">
          <label class="label">搜尋高亮重試</label>
          <span class="muted">延遲(ms)</span>
          <input class="input" type="number" min="0" max="1000" step="10" v-model.number="searchHighlightRetryDelayMs" />
          <span class="muted">次數</span>
          <input class="input" type="number" min="0" max="10" step="1" v-model.number="searchHighlightRetryCount" />
        </div>
      </div>

      <div class="section">
        <h4>檢視效能微調</h4>
        <div class="row">
          <label class="label" for="textIdle">文字層閒置 (ms)</label>
          <input id="textIdle" class="input" type="number" min="0" max="1000" step="10" v-model.number="viewerTextIdleMs" />
          <span class="muted">建議 100</span>
        </div>
        <div class="row">
          <label class="label" for="renderIdle">重繪閒置 (ms)</label>
          <input id="renderIdle" class="input" type="number" min="0" max="1000" step="5" v-model.number="viewerRenderIdleMs" />
          <span class="muted">建議 20</span>
        </div>
        <div class="row">
          <label class="label" for="zoomTween">縮放過渡 (ms)</label>
          <input id="zoomTween" class="input" type="number" min="0" max="1000" step="10" v-model.number="viewerZoomTweenMs" />
          <span class="muted">建議 120（0 = 關閉）</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-root { display: flex; flex-direction: column; gap: 12px; }
.settings-panel { padding-top: 0; }
.settings-header { display: flex; align-items: center; gap: 8px; padding: 12px 0 10px; border-bottom: 1px solid var(--border, #e5e7eb); }
.btn-back { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: none; background: transparent; color: var(--text, #111827); border-radius: 6px; cursor: pointer; }
.btn-back:hover { background: var(--hover, #f3f4f6); }
.btn-back .icon { width: 16px; height: 16px; }
.title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text, #111827); }
.muted { color: var(--text-muted, #6b7280); }
.section { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.row { display: flex; align-items: center; gap: 10px; }
.label { width: 100px; color: var(--text-muted, #6b7280); }
.input { height: 28px; padding: 0 8px; border: 1px solid var(--border, #e5e7eb); border-radius: 6px; }
.choice { display: flex; align-items: center; gap: 12px; }
</style>
