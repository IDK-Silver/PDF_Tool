<script setup lang="ts">
import { computed } from 'vue'
import { useCompressSettings } from '@/modules/compress/settings'

const settings = useCompressSettings()

const format = computed({
  get: () => settings.s.image.format,
  set: (v: 'preserve'|'jpeg'|'png'|'webp') => settings.s.image.format = v
})

const quality = computed({
  get: () => settings.s.image.quality,
  set: (v: number) => settings.s.image.quality = Math.max(50, Math.min(95, Math.round(v)))
})

const maxWidth = computed({
  get: () => settings.s.image.maxWidth,
  set: (v: number | undefined) => settings.s.image.maxWidth = v && v > 0 ? Math.round(v) : undefined
})

const maxHeight = computed({
  get: () => settings.s.image.maxHeight,
  set: (v: number | undefined) => settings.s.image.maxHeight = v && v > 0 ? Math.round(v) : undefined
})

const strip = computed({
  get: () => settings.s.image.stripMetadata,
  set: (v: boolean) => settings.s.image.stripMetadata = v
})
</script>

<template>
  <section class="max-w-4xl mx-auto">
    <!-- 說明 -->
    <div class="mb-6 p-4 rounded-lg bg-[hsl(var(--muted))]/30 border border-[hsl(var(--border))]">
      <p class="text-sm text-[hsl(var(--foreground))]">
        設定圖片壓縮參數：調整尺寸、重新編碼與移除中繼資料。後端壓縮流程尚未接線。
      </p>
    </div>

    <!-- 表單區 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 左欄：格式與品質 -->
      <div class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))]">
        <h3 class="text-base font-semibold border-b border-[hsl(var(--border))] pb-2">格式與品質</h3>
        
        <!-- 格式選擇 -->
        <div class="space-y-2">
          <label class="block text-sm font-medium">輸出格式</label>
          <select 
            v-model="format" 
            class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          >
            <option value="preserve">保留原格式</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
            <option value="png">PNG</option>
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

      <!-- 右欄：尺寸與中繼資料 -->
      <div class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))]">
        <h3 class="text-base font-semibold border-b border-[hsl(var(--border))] pb-2">尺寸與中繼資料</h3>
        
        <!-- 最大寬度 -->
        <div class="space-y-2">
          <label class="block text-sm font-medium">最大寬度 (px)</label>
          <input 
            type="number" 
            min="1" 
            v-model.number="maxWidth" 
            placeholder="不限制"
            class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
        </div>

        <!-- 最大高度 -->
        <div class="space-y-2">
          <label class="block text-sm font-medium">最大高度 (px)</label>
          <input 
            type="number" 
            min="1" 
            v-model.number="maxHeight" 
            placeholder="不限制"
            class="w-full border border-[hsl(var(--border))] rounded-md px-3 py-2 text-sm bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
        </div>

        <!-- 移除中繼資料 -->
        <div class="space-y-3 pt-2">
          <label class="flex items-start gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              v-model="strip" 
              class="mt-0.5 w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <div class="flex-1">
              <span class="text-sm font-medium group-hover:text-[hsl(var(--primary))]">移除中繼資料</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                移除 EXIF、GPS 等中繼資料
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  </section>
</template>

