<script setup lang="ts">
import { useSettingsStore } from '@/modules/settings/store'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
const settings = useSettingsStore()
const s = settings.s
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
  <div class="h-full overflow-auto" data-settings-scroll-root>
    <div class="mx-auto max-w-3xl p-6 space-y-8 text-sm">
      <header class="sticky top-0 bg-background/80 backdrop-blur z-10 py-3 border-b">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-lg font-medium">設定</h1>
          <button @click="resetToDefaults" class="px-2 py-1 text-sm rounded border bg-white">回復預設</button>
        </div>
        <p class="text-xs text-[hsl(var(--muted-foreground))]">調整渲染體驗與效能參數。右側主視圖會即時套用。</p>
      </header>

      <section id="rendering" class="space-y-3">
        <h2 class="font-medium">渲染策略</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">輸出格式（單階段）</label>
              <select v-model="s.highQualityFormat" class="w-full border rounded px-2 py-1">
                <option value="png">PNG（無損，文字清晰）</option>
                <option value="jpeg">JPEG（有損，速度較快）</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">不再使用低清→高清兩段；一律直接輸出單一格式。</p>
            </div>
            <div>
              <label class="block mb-1">DPR 上限</label>
              <input class="w-full border rounded px-2 py-1" :value="s.dprCap" @input="s.dprCap = number($event, s.dprCap)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">限制裝置像素比對輸出寬度的放大，平衡清晰度與性能（預設 2.0）。</p>
            </div>
            <div>
              <label class="block mb-1">高清重渲染延遲（ms）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.highQualityDelayMs" @input="s.highQualityDelayMs = number($event, s.highQualityDelayMs)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">縮放停止後延遲再以新倍率請求高清渲染，預設 120ms。</p>
            </div>
            <div>
              <label class="block mb-1">最佳符合最大輸出寬度（px）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.maxTargetWidth" @input="s.maxTargetWidth = number($event, s.maxTargetWidth)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">避免超寬容器時輸出位圖過大（預設 1920）。</p>
            </div>
            <div>
              <label class="block mb-1">實際大小 DPI 上限</label>
              <input class="w-full border rounded px-2 py-1" :value="s.actualDpiCap" @input="s.actualDpiCap = number($event, s.actualDpiCap)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">避免高倍縮放時 DPI 過大（預設 144）。</p>
            </div>
          </div>
        </div>
      </section>

      <section id="width" class="space-y-3">
        <h2 class="font-medium">目標寬度</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-1">
              <input type="radio" value="container" v-model="s.targetWidthPolicy" /> 容器寬
            </label>
            <label class="flex items-center gap-1">
              <input type="radio" value="scale" v-model="s.targetWidthPolicy" /> 基準寬 × 倍率
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">基準寬</label>
              <input class="w-full border rounded px-2 py-1" :value="s.baseWidth" @input="s.baseWidth = number($event, s.baseWidth)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">當選擇「基準寬 × 倍率」時使用，預設 1200。</p>
            </div>
          </div>
        </div>
      </section>

      <section id="performance" class="space-y-3">
        <h2 class="font-medium">效能</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">最大並行渲染</label>
              <input class="w-full border rounded px-2 py-1" :value="s.maxConcurrentRenders" @input="s.maxConcurrentRenders = number($event, s.maxConcurrentRenders)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">同時間最多渲染頁面數，避免 CPU 滿載。</p>
            </div>
            <div>
              <label class="block mb-1">預抓距離（px）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.prefetchPx" @input="s.prefetchPx = number($event, s.prefetchPx)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">可視區域上下的預抓距離（越大越早渲染）。</p>
            </div>
            <div>
              <label class="block mb-1">預抓半徑（高品質）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.highRadius" @input="s.highRadius = number($event, s.highRadius)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">以目前頁為中心，向上下預抓的頁數（預設 2）。</p>
            </div>
            <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="s.preloadAllPages" /> 前景穩定後背景預加載全部頁面
              </label>
              <div>
                <label class="block mb-1">預加載頁數（中心半徑）</label>
                <input class="w-full border rounded px-2 py-1" :disabled="s.preloadAllPages" :value="s.preloadRange" @input="s.preloadRange = number($event, s.preloadRange)" />
                <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">非「全部」時，以當前頁為中心預先加載的範圍。</p>
              </div>
              <div>
                <label class="block mb-1">預加載延遲（ms）</label>
                <input class="w-full border rounded px-2 py-1" :value="s.preloadIdleMs" @input="s.preloadIdleMs = number($event, s.preloadIdleMs)" />
                <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">捲動或縮放穩定後延遲觸發背景預加載。</p>
              </div>
            </div>
            <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block mb-1">預加載批次大小</label>
                <input class="w-full border rounded px-2 py-1" :value="s.preloadBatchSize" @input="s.preloadBatchSize = number($event, s.preloadBatchSize)" />
                <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">每次閒置處理的頁數（建議 2–3）。</p>
              </div>
              <div>
                <label class="block mb-1">預加載啟動延遲（ms）</label>
                <input class="w-full border rounded px-2 py-1" :value="s.preloadStartDelayMs" @input="s.preloadStartDelayMs = number($event, s.preloadStartDelayMs)" />
                <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">載入穩定後多久開始背景預載（建議 500）。</p>
              </div>
              <label class="flex items-center gap-2 mt-6 md:mt-0">
                <input type="checkbox" v-model="s.pausePreloadOnInteraction" /> 互動時暫停預載（滾動、拖曳）
              </label>
              <div>
                <label class="block mb-1">預載 DPR 上限</label>
                <input class="w-full border rounded px-2 py-1" :value="s.preloadDprCap" @input="s.preloadDprCap = number($event, s.preloadDprCap)" />
                <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">背景預載時使用較保守的 DPR（預設 1.0）。</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="encoding" class="space-y-3">
        <h2 class="font-medium">編碼品質</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">JPEG 品質（1–100）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.jpegQuality" @input="s.jpegQuality = number($event, s.jpegQuality)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">越高越清晰（檔案越大）。建議 80–85。</p>
            </div>
            <div>
              <label class="block mb-1">PNG 快速壓縮</label>
              <div class="flex items-center gap-2">
                <input type="checkbox" v-model="s.pngFast" /> 啟用（較快、檔較大）
              </div>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">關閉時採較高壓縮（較慢、檔較小）。</p>
            </div>
          </div>
        </div>
      </section>

      <section id="debug" class="space-y-3">
        <h2 class="font-medium">除錯與輔助</h2>
        <div class="rounded-md border p-4 space-y-3">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="s.devPerfOverlay" />
            顯示效能浮層（右下角 inflight/queued）
          </label>
          <p class="text-xs text-[hsl(var(--muted-foreground))]">提供當前渲染佇列與進行中數量，方便調整參數。</p>
        </div>
      </section>

      <footer class="text-xs text-[hsl(var(--muted-foreground))] py-4">
        詳細說明請見 <code>docs/settings.md</code>。
      </footer>
    </div>
  </div>
</template>
