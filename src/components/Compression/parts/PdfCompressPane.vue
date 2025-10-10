<script setup lang="ts">
import { computed } from 'vue'
import { useCompressSettings } from '@/modules/compress/settings'

const settings = useCompressSettings()

const targetEffectiveDpi = computed({
  get: () => settings.s.pdf.targetEffectiveDpi,
  set: (v: number) => settings.s.pdf.targetEffectiveDpi = Math.max(96, Math.min(300, Math.round(v)))
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
  set: (v: number) => settings.s.pdf.thresholdEffectiveDpi = Math.max(72, Math.min(600, Math.round(v)))
})
</script>

<template>
  <section class="max-w-4xl mx-auto h-full flex flex-col">
    <!-- 說明 -->
    <div class="mb-6 p-4 rounded-lg bg-[hsl(var(--muted))]/30 border border-[hsl(var(--border))]">
      <p class="text-sm text-[hsl(var(--foreground))]">
        採用「智慧壓縮」：保留文字與向量，只針對頁內影像做下採樣與重壓縮，並進行 PDF 結構無損最佳化。
      </p>
    </div>

    <!-- 可滾動的表單區 -->
    <div class="flex-1 overflow-y-auto pr-2">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 左欄：影像處理 -->
      <div class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))]">
        <h3 class="text-base font-semibold border-b border-[hsl(var(--border))] pb-2">影像處理</h3>
        
        <!-- DPI 模式 -->
        <div class="space-y-2">
          <label class="block text-sm font-medium">下採樣模式</label>
          <select 
            v-model="downsampleRule" 
            class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          >
            <option value="always">統一 DPI（強制調整所有影像）</option>
            <option value="whenAbove">條件 DPI（僅處理超過門檻的影像）</option>
          </select>
        </div>

        <!-- DPI 設定 -->
        <div class="space-y-4">
          <!-- 目標 DPI（永遠顯示） -->
          <div class="space-y-2">
            <label class="block text-sm font-medium">目標 DPI</label>
            <input 
              type="number" 
              min="72" 
              max="600" 
              step="1" 
              v-model.number="targetEffectiveDpi" 
              class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>
          
          <!-- 門檻 DPI（僅條件模式顯示） -->
          <div v-if="downsampleRule === 'whenAbove'" class="space-y-2">
            <label class="block text-sm font-medium">
              門檻 DPI
              <span class="text-xs text-[hsl(var(--muted-foreground))]">（僅處理超過此值的影像）</span>
            </label>
            <input 
              type="number" 
              min="72" 
              max="600" 
              step="1" 
              v-model.number="thresholdEffectiveDpi" 
              class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>
        </div>

        <!-- 影像格式 -->
        <div class="space-y-2">
          <label class="block text-sm font-medium">彩色/灰階影像格式</label>
          <select 
            v-model="format" 
            class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          >
            <option value="jpeg">JPEG</option>
            <option value="keep">保留原格式</option>
          </select>
        </div>

        <!-- 品質滑桿 -->
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <label class="text-sm font-medium">壓縮品質</label>
            <span class="text-sm font-mono text-[hsl(var(--muted-foreground))]">{{ quality }}</span>
          </div>
          <input 
            type="range" 
            min="50" 
            max="95" 
            step="1" 
            v-model.number="quality" 
            class="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[hsl(var(--muted))]"
          />
          <div class="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
            <span>較小檔案</span>
            <span>較高品質</span>
          </div>
        </div>
      </div>

      <!-- 右欄：結構最佳化 -->
      <div class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))]">
        <h3 class="text-base font-semibold border-b border-[hsl(var(--border))] pb-2">結構最佳化</h3>
        <div class="space-y-3 pt-2">
          <label class="flex items-start gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              v-model="losslessOptimize" 
              class="mt-0.5 w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <div class="flex-1">
              <span class="text-sm font-medium group-hover:text-[hsl(var(--primary))]">無損結構最佳化</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                優化 streams、object streams 與去除冗餘
              </p>
            </div>
          </label>

          <label class="flex items-start gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              v-model="removeMetadata" 
              class="mt-0.5 w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <div class="flex-1">
              <span class="text-sm font-medium group-hover:text-[hsl(var(--primary))]">移除中繼資料</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                移除文件與影像的 metadata
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
    </div>
  </section>
</template>
