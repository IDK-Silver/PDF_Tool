<script setup lang="ts">
import { useSettingsStore } from '@/modules/settings/store'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import ExportSettings from './parts/ExportSettings.vue'
import InsertDefaults from './parts/InsertDefaults.vue'
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
              <label class="block mb-1">輸出格式</label>
              <select v-model="s.renderFormat" class="w-full border rounded px-2 py-1">
                <option value="webp">WebP（推薦：檔案最小，文字清晰）</option>
                <option value="png">PNG（無損，檔案較大）</option>
                <option value="jpeg">JPEG（有損，速度較快）</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                WebP 比 PNG 小 30%，比 JPEG 清晰，是雙快取策略的最佳選擇。
              </p>
            </div>
            <div>
              <label class="block mb-1">DPR 上限</label>
              <input class="w-full border rounded px-2 py-1" :value="s.dprCap" @input="s.dprCap = number($event, s.dprCap)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">限制裝置像素比對輸出寬度的放大，平衡清晰度與性能（預設 2.0）。</p>
            </div>
            <div>
              <label class="block mb-1">縮放防抖延遲（ms）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.zoomDebounceMs" @input="s.zoomDebounceMs = number($event, s.zoomDebounceMs)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">縮放停止後延遲再以新倍率請求高清渲染，預設 180ms。</p>
            </div>
            <div>
              <label class="block mb-1">最大輸出寬度（px）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.maxOutputWidth" @input="s.maxOutputWidth = number($event, s.maxOutputWidth)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">避免超寬容器時輸出位圖過大（預設 1920）。</p>
            </div>
            <div>
              <label class="block mb-1">實際大小 DPI 上限</label>
              <input class="w-full border rounded px-2 py-1" :value="s.actualModeDpiCap" @input="s.actualModeDpiCap = number($event, s.actualModeDpiCap)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">避免高倍縮放時 DPI 過大（預設 144）。</p>
            </div>
            <div>
              <label class="block mb-1">可見區域擴展頁數</label>
              <input class="w-full border rounded px-2 py-1" :value="s.visibleMarginPages" @input="s.visibleMarginPages = number($event, s.visibleMarginPages)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">以目前頁為中心，向上下預載的頁數（預設 2）。</p>
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
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">同時間最多渲染頁面數，避免 CPU 滿載（預設 4）。</p>
            </div>
          </div>
        </div>
      </section>

  <section id="fileops" class="space-y-3">
    <h2 class="font-medium">檔案操作</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">刪除頁面時的行為</label>
            <div class="flex items-center gap-6">
              <label class="flex items-center gap-2">
                <input type="radio" value="saveAsNew" v-model="s.deleteBehavior" /> 另存新檔（預設）
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="overwrite" v-model="s.deleteBehavior" /> 覆蓋原檔（需確認）
              </label>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              「移除此頁」右鍵功能會依此行為執行；建議使用「另存新檔」以降低風險。
            </p>
          </div>
        </div>
  </section>

  <section id="insert-defaults" class="space-y-3">
    <h2 class="font-medium">插入空白頁預設</h2>
    <div class="rounded-md border p-4 space-y-3">
      <InsertDefaults />
    </div>
  </section>

  <section id="export" class="space-y-3">
    <h2 class="font-medium">匯出設定</h2>
    <div class="rounded-md border p-4 space-y-3">
      <ExportSettings />
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
              <label class="block mb-1">PNG 壓縮等級</label>
              <select v-model="s.pngCompression" class="w-full border rounded px-2 py-1">
                <option value="fast">快速（檔案較大）</option>
                <option value="balanced">平衡</option>
                <option value="best">最佳（檔案最小，較慢）</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">平衡速度與檔案大小。</p>
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
