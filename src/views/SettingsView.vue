<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, watch, onMounted } from 'vue'
import { loadSettings, saveSettingsDebounced, type AppSettings } from '../composables/persistence'

const router = useRouter()
function goBack() {
  // 若有上一頁則返回，否則導回 /view
  if (history.length > 1) router.back()
  else router.replace('/view')
}

const exportDpi = ref<number>(300)
const exportFormat = ref<'png' | 'jpeg'>('png')
const jpegQuality = ref<number>(0.9)
const defaultZoomMode = ref<'actual'|'fit'>('fit')

onMounted(async () => {
  const s = await loadSettings()
  exportDpi.value = s.exportDpi
  exportFormat.value = s.exportFormat
  jpegQuality.value = s.jpegQuality ?? 0.9
  defaultZoomMode.value = s.defaultZoomMode ?? 'fit'
})

function persist() {
  const s: AppSettings = {
    exportDpi: clampDpi(exportDpi.value),
    exportFormat: exportFormat.value,
    jpegQuality: clampQuality(jpegQuality.value),
    defaultZoomMode: defaultZoomMode.value,
  }
  saveSettingsDebounced(s)
}

function clampDpi(v: number) { return Math.min(1200, Math.max(72, Math.round(v || 300))) }
function clampQuality(v: number) { return Math.min(1, Math.max(0.1, Number.isFinite(v) ? v : 0.9)) }

watch([exportDpi, exportFormat, jpegQuality, defaultZoomMode], persist, { deep: false })
</script>

<template>
  <div class="settings-root">
    <div class="settings-header">
      <button class="btn-back" type="button" @click="goBack" aria-label="返回">← 返回</button>
      <h3 class="title">設定</h3>
    </div>
    <div class="panel pad">
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-root { display: flex; flex-direction: column; gap: 12px; }
.settings-header { display: flex; align-items: center; gap: 12px; }
.btn-back { border: 1px solid var(--border, #e5e7eb); background: #fff; color: var(--text, #111827); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.btn-back:hover { background: var(--hover, #f3f4f6); }
.title { margin: 0; font-size: 16px; font-weight: 600; color: var(--text, #111827); }
.muted { color: var(--text-muted, #6b7280); }
.section { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.row { display: flex; align-items: center; gap: 10px; }
.label { width: 90px; color: var(--text-muted, #6b7280); }
.input { height: 28px; padding: 0 8px; border: 1px solid var(--border, #e5e7eb); border-radius: 6px; }
.choice { display: flex; align-items: center; gap: 12px; }
</style>
