<script setup lang="ts">
import { useSettingsStore } from '@/modules/settings/store'
const settings = useSettingsStore()
const s = settings.s

const number = (e: Event, fallback: number) => {
  const v = Number((e.target as HTMLInputElement).value)
  return Number.isFinite(v) ? v : fallback
}
</script>

<template>
  <div class="h-full overflow-auto">
    <div class="mx-auto max-w-3xl p-6 space-y-8 text-sm">
      <header class="sticky top-0 bg-background/80 backdrop-blur z-10 -mx-6 px-6 py-3 border-b">
        <h1 class="text-lg font-medium">設定</h1>
        <p class="text-xs text-[hsl(var(--muted-foreground))]">調整渲染體驗與效能參數。右側主視圖會即時套用。</p>
      </header>

      <section id="rendering" class="space-y-3">
        <h2 class="font-medium">渲染策略</h2>
        <div class="rounded-md border p-4 space-y-3">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="s.lowQualityFirst" />
            低清先顯示
          </label>
          <p class="text-xs text-[hsl(var(--muted-foreground))]">先以較低解析度快速顯示頁面，待捲動穩定後替換為高清，提升「秒開」體感。</p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">低清格式</label>
              <select v-model="s.lowQualityFormat" class="w-full border rounded px-2 py-1">
                <option value="jpeg">JPEG（速度快、檔小）</option>
                <option value="png">PNG（無損）</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">建議使用 JPEG 以加速低清階段的渲染與傳輸。</p>
            </div>
            <div>
              <label class="block mb-1">低清寬度比例</label>
              <input class="w-full border rounded px-2 py-1" :value="s.lowQualityScale" @input="s.lowQualityScale = number($event, s.lowQualityScale)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">相對於目標寬度的比例（例如 0.5 = 一半寬度）。</p>
            </div>
            <div>
              <label class="block mb-1">高清延遲（毫秒）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.highQualityDelayMs" @input="s.highQualityDelayMs = number($event, s.highQualityDelayMs)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">低清顯示後等待多久再補高清，避免連續捲動時不必要的重算。</p>
            </div>
            <div>
              <label class="block mb-1">高清格式</label>
              <select v-model="s.highQualityFormat" class="w-full border rounded px-2 py-1">
                <option value="png">PNG（無損，文字清晰）</option>
                <option value="jpeg">JPEG（有損，速度較快）</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">文字/矢量頁面建議 PNG；掃描影像可用 JPEG。</p>
            </div>
            <div>
              <label class="block mb-1">DPR 上限</label>
              <input class="w-full border rounded px-2 py-1" :value="s.dprCap" @input="s.dprCap = number($event, s.dprCap)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">限制裝置像素比對輸出寬度的放大，平衡清晰度與性能（預設 2.0）。</p>
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
