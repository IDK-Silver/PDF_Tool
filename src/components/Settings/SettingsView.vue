<script setup lang="ts">
import { useSettingsStore } from '@/modules/settings/store'
import { useUiStore } from '@/modules/ui/store'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import ExportSettings from './parts/ExportSettings.vue'
import InsertDefaults from './parts/InsertDefaults.vue'
import { ChevronDoubleRightIcon } from '@heroicons/vue/24/outline'
import { useCompressSettings } from '@/modules/compress/settings'

const settings = useSettingsStore()
const s = settings.s
const ui = useUiStore()
const route = useRoute()
const compressSettings = useCompressSettings()

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
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">格式完全依設定選擇，無大頁面強制降級。</p>
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
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">限制高清渲染 DPI，避免卡頓。預設 144。</p>
            </div>
            <div>
              <label class="block mb-1">DPR 上限</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.dprCap"
                @input="s.dprCap = number($event, s.dprCap)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">控制裝置像素比對輸出寬度的放大。預設 1.5。</p>
            </div>
            <div>
              <label class="block mb-1">最大輸出寬度（px）</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.maxOutputWidth"
                @input="s.maxOutputWidth = number($event, s.maxOutputWidth)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">避免超寬容器時輸出位圖過大。預設 1200。</p>
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
              <label class="block mb-1">縮放重渲染延遲（ms）</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.zoomRerenderDelayMs"
                @input="s.zoomRerenderDelayMs = number($event, s.zoomRerenderDelayMs)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">縮放操作後觸發高清重渲染的延遲。預設 150 ms。</p>
            </div>
            <div>
              <label class="block mb-1">高清重渲染預設延遲（ms）</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.hiResRerenderDelayMs"
                @input="s.hiResRerenderDelayMs = number($event, s.hiResRerenderDelayMs)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">未指定延遲時使用的預設值。預設 300 ms。</p>
            </div>
            <div>
              <label class="block mb-1">捲動結束延遲（ms）</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.scrollEndDebounceMs"
                @input="s.scrollEndDebounceMs = number($event, s.scrollEndDebounceMs)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">辨識「捲動結束」後再批次渲染的延遲。預設 500 ms。</p>
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
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">限制同時間的渲染頁數。預設 4。</p>
            </div>
            <div>
              <label class="block mb-1">高清預載範圍</label>
              <input
                class="w-full border border-border rounded px-2 py-1 bg-input text-foreground"
                :value="s.highResOverscan"
                @input="s.highResOverscan = number($event, s.highResOverscan)"
              />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">向可見區域上下預載的頁數。預設 4。</p>
            </div>
          </div>
        </div>
      </section>

      <section id="fileops" class="space-y-3">
        <h2 class="font-medium text-base">檔案操作</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">編輯存檔行為（檢視/編輯頁）</label>
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
              用於編輯動作（例如移除頁面）後的儲存策略；建議使用「另存新檔」以降低風險。
            </p>
          </div>
        </div>
      </section>

      <section id="compression-save" class="space-y-3">
        <h2 class="font-medium text-base">壓縮存檔行為</h2>
        <div class="rounded-md border p-4 space-y-3">
          <div>
            <label class="block mb-2">壓縮執行時的輸出策略</label>
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
              <label class="flex items-center gap-2">
                <input type="radio" value="saveAsNew" v-model="compressSettings.s.saveBehavior" />
                <span>另存新檔</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="radio" value="overwrite" v-model="compressSettings.s.saveBehavior" />
                <span>覆蓋原檔</span>
              </label>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              影響壓縮頁面「開始壓縮」的預設行為；可於壓縮工具列快速切換。
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
