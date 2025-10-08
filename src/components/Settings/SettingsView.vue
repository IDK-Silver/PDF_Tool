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

      <!-- 低清渲染區塊 -->
      <section id="low-res-rendering" class="space-y-3">
        <h2 class="font-medium text-blue-600 dark:text-blue-400">⚡ 低清渲染（快速預覽）</h2>
        <div class="rounded-md border border-blue-200 dark:border-blue-800 p-4 space-y-3 bg-blue-50/30 dark:bg-blue-950/30">
          <!-- 主開關 -->
          <div class="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded">
            <input type="checkbox" id="enableLowRes" v-model="s.enableLowRes" class="w-4 h-4" />
            <label for="enableLowRes" class="flex-1">
              <span class="font-medium">⚡ 啟用低清渲染</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                滾動時先顯示低清圖（快），停止後升級高清（好）。關閉則直接高清（慢但清晰）。
              </p>
            </label>
          </div>

          <p class="text-xs text-[hsl(var(--muted-foreground))]">
            低清圖片用於滾動時快速顯示，固定使用 Raw 格式（零編解碼）
          </p>
          
          <!-- DPR 適配選項 -->
          <div 
            class="flex items-center gap-2 p-3 bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700 rounded"
            :class="{ 'opacity-50': !s.enableLowRes }"
          >
            <input type="checkbox" id="useLowResDpr" v-model="s.useLowResDpr" class="w-4 h-4" :disabled="!s.enableLowRes" />
            <label for="useLowResDpr" class="flex-1">
              <span class="font-medium">📱 Retina 螢幕適配</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                低清也考慮 DPR（Retina 螢幕更清晰，但渲染稍慢 20-40%）
                <span v-if="!s.enableLowRes" class="text-orange-600">（需先啟用低清渲染）</span>
              </p>
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3" :class="{ 'opacity-50': !s.enableLowRes }">
            <div>
              <label class="block mb-1">低清 DPI</label>
              <input 
                class="w-full border rounded px-2 py-1" 
                :value="s.lowResDpi" 
                @input="s.lowResDpi = number($event, s.lowResDpi)"
                :disabled="!s.enableLowRes"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                一般頁面低清 DPI。A4: 48dpi=0.4M像素(60ms), 60dpi=0.6M像素(90ms)。預設 60。
              </p>
            </div>
            <div>
              <label class="block mb-1">大頁面低清 DPI</label>
              <input 
                class="w-full border rounded px-2 py-1" 
                :value="s.largePageLowResDpi" 
                @input="s.largePageLowResDpi = number($event, s.largePageLowResDpi)"
                :disabled="!s.enableLowRes"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                A3/A2 大頁面專用低清 DPI（自動降級防卡頓）。預設 48。
              </p>
            </div>
            <div :class="{ 'opacity-50': !s.useLowResDpr }">
              <label class="block mb-1">低清 DPR 倍數</label>
              <input 
                class="w-full border rounded px-2 py-1" 
                :value="s.lowResDprMultiplier" 
                @input="s.lowResDprMultiplier = number($event, s.lowResDprMultiplier)"
                :disabled="!s.enableLowRes || !s.useLowResDpr"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Retina 適配時的 DPR 倍數上限。1.0=完整適配，1.5=稍快但清晰。預設 1.0。
                <span v-if="!s.useLowResDpr" class="text-orange-600">（需先啟用 Retina 適配）</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 高清渲染區塊 -->
      <section id="high-res-rendering" class="space-y-3">
        <h2 class="font-medium text-purple-600 dark:text-purple-400">✨ 高清渲染（精細品質）</h2>
        <div class="rounded-md border border-purple-200 dark:border-purple-800 p-4 space-y-3 bg-purple-50/30 dark:bg-purple-950/30">
          <p class="text-xs text-[hsl(var(--muted-foreground))]">
            高清圖片用於停止滾動後提升品質，可選 Raw 或壓縮格式
          </p>
          
          <!-- 激進模式開關 -->
          <div class="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded">
            <input type="checkbox" id="useRawForHighRes" v-model="s.useRawForHighRes" class="w-4 h-4" />
            <label for="useRawForHighRes" class="flex-1">
              <span class="font-medium">🚀 激進模式：高清也用 Raw</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                零編解碼，超快渲染（&lt;10ms），但記憶體大 10-80 倍（A4: 3MB/頁，A3: 6MB/頁）
              </p>
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <!-- 格式選擇（保守模式） -->
            <div v-if="!s.useRawForHighRes">
              <label class="block mb-1">高清輸出格式</label>
              <select v-model="s.renderFormat" class="w-full border rounded px-2 py-1">
                <option value="webp">WebP（推薦：檔案最小，文字清晰）</option>
                <option value="png">PNG（無損，檔案較大）</option>
                <option value="jpeg">JPEG（有損，速度較快）</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                大頁面自動降為 JPEG（避免 WebP 慢編碼）。
              </p>
            </div>
            
            <!-- Raw 快取調整（激進模式） -->
            <div v-else>
              <label class="block mb-1">Raw 高清快取上限（頁）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.rawHighResCacheSize" @input="s.rawHighResCacheSize = number($event, s.rawHighResCacheSize)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Raw 模式記憶體大，建議 10-15 頁（約 30-120MB）。預設 10。
              </p>
            </div>

            <!-- DPI 上限 -->
            <div>
              <label class="block mb-1">🎯 高清 DPI 上限</label>
              <input class="w-full border rounded px-2 py-1" :value="s.highResDpiCap" @input="s.highResDpiCap = number($event, s.highResDpiCap)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                限制高清渲染 DPI，防卡頓。A4: 96dpi=1.1M像素(200ms)，144dpi=2.5M像素(450ms)。預設 96。
              </p>
            </div>

            <!-- DPR 上限 -->
            <div>
              <label class="block mb-1">DPR 上限</label>
              <input class="w-full border rounded px-2 py-1" :value="s.dprCap" @input="s.dprCap = number($event, s.dprCap)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">限制裝置像素比對輸出寬度的放大，平衡清晰度與性能（預設 2.0）。</p>
            </div>

            <!-- 最大輸出寬度 -->
            <div>
              <label class="block mb-1">最大輸出寬度（px）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.maxOutputWidth" @input="s.maxOutputWidth = number($event, s.maxOutputWidth)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">避免超寬容器時輸出位圖過大（預設 1920）。</p>
            </div>

            <!-- 實際大小 DPI 上限 -->
            <div>
              <label class="block mb-1">實際大小 DPI 上限</label>
              <input class="w-full border rounded px-2 py-1" :value="s.actualModeDpiCap" @input="s.actualModeDpiCap = number($event, s.actualModeDpiCap)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">避免高倍縮放時 DPI 過大（預設 144）。</p>
            </div>

            <!-- 縮放防抖延遲 -->
            <div>
              <label class="block mb-1">縮放防抖延遲（ms）</label>
              <input class="w-full border rounded px-2 py-1" :value="s.zoomDebounceMs" @input="s.zoomDebounceMs = number($event, s.zoomDebounceMs)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">縮放停止後延遲再以新倍率請求高清渲染，預設 300ms。</p>
            </div>
          </div>
        </div>
      </section>

      <section id="performance" class="space-y-3">
        <h2 class="font-medium text-green-600 dark:text-green-400">⚙️ 效能控制</h2>
        <div class="rounded-md border border-green-200 dark:border-green-800 p-4 space-y-3 bg-green-50/30 dark:bg-green-950/30">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block mb-1">最大並行渲染</label>
              <input class="w-full border rounded px-2 py-1" :value="s.maxConcurrentRenders" @input="s.maxConcurrentRenders = number($event, s.maxConcurrentRenders)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">同時間最多渲染頁面數，避免 CPU 滿載（預設 2）。</p>
            </div>
            <div>
              <label class="block mb-1">高清預載範圍</label>
              <input class="w-full border rounded px-2 py-1" :value="s.highResOverscan" @input="s.highResOverscan = number($event, s.highResOverscan)" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">向可見區域上下預載的頁數（預設 2）。</p>
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
