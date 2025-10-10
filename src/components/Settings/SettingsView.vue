<script setup lang="ts">
import { useSettingsStore } from '@/modules/settings/store'
import { useUiStore } from '@/modules/ui/store'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import ExportSettings from './parts/ExportSettings.vue'
import InsertDefaults from './parts/InsertDefaults.vue'
import { ChevronDoubleRightIcon } from '@heroicons/vue/24/outline'

const settings = useSettingsStore()
const s = settings.s
const ui = useUiStore()
const route = useRoute()

const number = (e: Event, fallback: number) => {
  const v = Number((e.target as HTMLInputElement).value)
  return Number.isFinite(v) ? v : fallback
}

function resetToDefaults() {
  if (confirm('確定要回復預設設定？此動作會覆蓋目前所有設定。')) {
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
              title="展開左側欄"
              aria-label="展開左側欄"
            >
              <ChevronDoubleRightIcon class="w-5 h-5" />
            </button>
            <h1 class="text-lg font-medium">設定</h1>
          </div>
          <button @click="resetToDefaults" class="px-2 py-1 text-sm rounded border border-border bg-card hover:bg-hover transition-colors">回復預設</button>
        </div>
        <p class="text-xs text-[hsl(var(--muted-foreground))]">調整渲染體驗與效能參數。右側主視圖會即時套用。</p>
      </header>

      <section id="appearance" class="space-y-3">
        <h2 class="font-medium text-base">外觀</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">主題模式</label>
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <label class="flex items-center gap-2">
                <input type="radio" value="light" v-model="s.theme" />
                <span>亮色（預設）</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="dark" v-model="s.theme" />
                <span>暗色</span>
              </label>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              切換介面的配色主題，即時生效。
            </p>
          </div>

          <div class="flex items-start gap-2" :class="{ 'opacity-50': s.theme !== 'dark' }">
            <input type="checkbox" id="invertColorsInDarkMode" v-model="s.invertColorsInDarkMode" :disabled="s.theme !== 'dark'" class="mt-1 w-4 h-4" />
            <label for="invertColorsInDarkMode" class="flex-1">
              <span class="font-medium">暗色模式反轉文件顏色</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                在暗色模式下反轉 PDF/圖片的顏色，讓白底黑字的文件變成黑底白字，更適合夜間閱讀。
                <span v-if="s.theme !== 'dark'" class="block mt-1">需先啟用暗色模式。</span>
              </p>
            </label>
          </div>
        </div>
      </section>

      <section id="low-res-rendering" class="space-y-3">
        <h2 class="font-medium text-base">低清渲染</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="flex items-start gap-2">
            <input type="checkbox" id="enableLowRes" v-model="s.enableLowRes" class="mt-1 w-4 h-4" />
            <label for="enableLowRes" class="flex-1">
              <span class="font-medium">啟用低清渲染</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                滾動時先顯示低清圖，停止後升級為高清。關閉可直接輸出高清，速度較慢但最清晰。
              </p>
            </label>
          </div>

          <p class="text-xs text-[hsl(var(--muted-foreground))]">
            低清圖片固定使用 Raw 格式，避免額外的解碼延遲。
          </p>

          <div class="flex items-start gap-2" :class="{ 'opacity-50': !s.enableLowRes }">
            <input type="checkbox" id="useLowResDpr" v-model="s.useLowResDpr" class="mt-1 w-4 h-4" :disabled="!s.enableLowRes" />
            <label for="useLowResDpr" class="flex-1">
              <span class="font-medium">啟用 DPR 調整</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                針對高 DPI 螢幕輸出更清楚的低清圖，速度會略慢。
                <span v-if="!s.enableLowRes" class="block">需先啟用低清渲染。</span>
              </p>
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3" :class="{ 'opacity-50': !s.enableLowRes }">
            <div>
              <label class="block mb-1">低清 DPI</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.lowResDpi"
                @input="s.lowResDpi = number($event, s.lowResDpi)"
                :disabled="!s.enableLowRes"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                一般頁面的低清 DPI。預設 60（A4 約 0.6M 像素）。
              </p>
            </div>
            <div>
              <label class="block mb-1">大頁面低清 DPI</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.largePageLowResDpi"
                @input="s.largePageLowResDpi = number($event, s.largePageLowResDpi)"
                :disabled="!s.enableLowRes"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                A3/A2 等大頁面的專用 DPI。預設 48。
              </p>
            </div>
            <div :class="{ 'opacity-50': !s.enableLowRes || !s.useLowResDpr }">
              <label class="block mb-1">DPR 倍數上限</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.lowResDprMultiplier"
                @input="s.lowResDprMultiplier = number($event, s.lowResDprMultiplier)"
                :disabled="!s.enableLowRes || !s.useLowResDpr"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                控制低清輸出時的 DPR 倍數。預設 1.0。
                <span v-if="!s.useLowResDpr" class="block">需先啟用 DPR 調整。</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="high-res-rendering" class="space-y-3">
        <h2 class="font-medium text-base">高清渲染</h2>
        <div class="rounded-md border p-4 space-y-3">
          <p class="text-xs text-[hsl(var(--muted-foreground))]">
            停止捲動後會載入高清頁面，用於最終檢視與輸出。
          </p>

          <div>
            <label class="block mb-1">高清輸出格式</label>
            <select v-model="s.renderFormat" class="w-full border border-border rounded px-2 py-1 bg-input text-foreground">
              <option value="raw">Raw（預設，最快速）</option>
              <option value="webp">WebP（高壓縮比）</option>
              <option value="png">PNG（無損）</option>
              <option value="jpeg">JPEG（相容性佳）</option>
            </select>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              大頁面仍會自動降為 JPEG 以避免長時間編碼。
            </p>
          </div>

          <div v-if="s.renderFormat === 'raw'">
            <label class="block mb-1">Raw 快取上限（頁）</label>
            <input
              class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
              :value="s.rawHighResCacheSize"
              @input="s.rawHighResCacheSize = number($event, s.rawHighResCacheSize)"
            />
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Raw 影像佔用記憶體，建議維持 10–15 頁（約 30–120 MB）。
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">高清 DPI 上限</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.highResDpiCap"
                @input="s.highResDpiCap = number($event, s.highResDpiCap)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                限制高清渲染 DPI，避免卡頓。預設 96。
              </p>
            </div>
            <div>
              <label class="block mb-1">DPR 上限</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.dprCap"
                @input="s.dprCap = number($event, s.dprCap)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                控制裝置像素比對輸出寬度的放大。預設 2.0。
              </p>
            </div>
            <div>
              <label class="block mb-1">最大輸出寬度（px）</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.maxOutputWidth"
                @input="s.maxOutputWidth = number($event, s.maxOutputWidth)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                避免超寬容器時輸出位圖過大。預設 1920。
              </p>
            </div>
            <div>
              <label class="block mb-1">實際大小 DPI 上限</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.actualModeDpiCap"
                @input="s.actualModeDpiCap = number($event, s.actualModeDpiCap)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                防止高倍縮放時 DPI 過大。預設 144。
              </p>
            </div>
            <div>
              <label class="block mb-1">縮放防抖延遲（ms）</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.zoomDebounceMs"
                @input="s.zoomDebounceMs = number($event, s.zoomDebounceMs)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                縮放停止後延遲再請求高清渲染。預設 300 ms。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="performance" class="space-y-3">
        <h2 class="font-medium text-base">效能控制</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">最大並行渲染</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.maxConcurrentRenders"
                @input="s.maxConcurrentRenders = number($event, s.maxConcurrentRenders)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                限制同時間的渲染頁數，預設 2。
              </p>
            </div>
            <div>
              <label class="block mb-1">高清預載範圍</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.highResOverscan"
                @input="s.highResOverscan = number($event, s.highResOverscan)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                向可見區域上下預載的頁數。預設 2。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="fileops" class="space-y-3">
        <h2 class="font-medium text-base">檔案操作</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">刪除頁面時的行為</label>
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <label class="flex items-center gap-2">
                <input type="radio" value="saveAsNew" v-model="s.deleteBehavior" />
                <span>另存新檔</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="overwrite" v-model="s.deleteBehavior" />
                <span>覆蓋原檔</span>
              </label>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              「移除此頁」右鍵功能會依此行為執行；建議使用「另存新檔」以降低風險。
            </p>
          </div>
        </div>
      </section>

      <section id="insert-defaults" class="space-y-3">
        <h2 class="font-medium text-base">插入空白頁預設</h2>
        <div class="rounded-md border p-4 space-y-3">
          <InsertDefaults />
        </div>
      </section>

      <section id="export" class="space-y-3">
        <h2 class="font-medium text-base">匯出設定</h2>
        <div class="rounded-md border p-4 space-y-3">
          <ExportSettings />
        </div>
      </section>

      <section id="encoding" class="space-y-3">
        <h2 class="font-medium text-base">編碼品質</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">JPEG 品質（1–100）</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.jpegQuality"
                @input="s.jpegQuality = number($event, s.jpegQuality)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                數值越高越清晰，檔案也會變大。建議 80–85。
              </p>
            </div>
            <div>
              <label class="block mb-1">PNG 壓縮等級</label>
              <select v-model="s.pngCompression" class="w-full border border-border rounded px-2 py-1 bg-input text-foreground">
                <option value="fast">快速（檔案較大）</option>
                <option value="balanced">平衡</option>
                <option value="best">最佳（檔案最小，較慢）</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                在速度與檔案大小之間取得平衡。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="debug" class="space-y-3">
        <h2 class="font-medium text-base">除錯與輔助</h2>
        <div class="rounded-md border p-4 space-y-3">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="s.devPerfOverlay" />
            <span>顯示效能浮層（右下角 inflight/queued）</span>
          </label>
          <p class="text-xs text-[hsl(var(--muted-foreground))]">
            提供當前渲染佇列與進行中數量，方便調整參數。
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
