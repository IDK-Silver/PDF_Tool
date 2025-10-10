<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCompressSettings } from '@/modules/compress/settings'
import { useMediaStore } from '@/modules/media/store'

const settings = useCompressSettings()
const media = useMediaStore()

// 原始圖片尺寸
const originalWidth = computed(() => media.descriptor?.width ?? 0)
const originalHeight = computed(() => media.descriptor?.height ?? 0)
const hasValidImage = computed(() => originalWidth.value > 0 && originalHeight.value > 0)

const format = computed({
  get: () => settings.s.image.format,
  set: (v: 'preserve'|'jpeg'|'png'|'webp') => settings.s.image.format = v
})

const quality = computed({
  get: () => settings.s.image.quality,
  set: (v: number) => settings.s.image.quality = Math.max(50, Math.min(95, Math.round(v)))
})

// 使用縮放比例（0-100%）
const scalePercent = ref(100)

// 計算實際輸出尺寸
const outputWidth = computed(() => {
  if (!hasValidImage.value) return 0
  return Math.round(originalWidth.value * scalePercent.value / 100)
})

const outputHeight = computed(() => {
  if (!hasValidImage.value) return 0
  return Math.round(originalHeight.value * scalePercent.value / 100)
})

// 同步到 settings（保持向後相容）
watch([outputWidth, outputHeight], ([w, h]) => {
  settings.s.image.maxWidth = w > 0 ? w : undefined
  settings.s.image.maxHeight = h > 0 ? h : undefined
})

// 從 settings 初始化比例（如果有設定）
watch([originalWidth, originalHeight], ([w, h]) => {
  if (w > 0 && h > 0) {
    const settingsWidth = settings.s.image.maxWidth
    if (settingsWidth && settingsWidth < w) {
      scalePercent.value = Math.round(settingsWidth / w * 100)
    } else {
      scalePercent.value = 100
    }
  }
}, { immediate: true })

const strip = computed({
  get: () => settings.s.image.stripMetadata,
  set: (v: boolean) => settings.s.image.stripMetadata = v
})

</script>

<template>
  <section class="max-w-4xl mx-auto h-full flex flex-col">
    <!-- 說明 -->
    <div class="mb-6 p-4 rounded-lg bg-[hsl(var(--muted))]/30 border border-[hsl(var(--border))]">
      <p class="text-sm text-[hsl(var(--foreground))]">
        設定圖片壓縮參數：調整尺寸、重新編碼與移除中繼資料。後端壓縮流程尚未接線。
      </p>
    </div>

    <!-- 可滾動的表單區 -->
    <div class="flex-1 overflow-y-auto pr-2">
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

        <!-- 右欄：尺寸調整 -->
        <div class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))]">
          <h3 class="text-base font-semibold border-b border-[hsl(var(--border))] pb-2">尺寸調整</h3>
          
          <!-- 原始尺寸顯示 -->
          <div v-if="hasValidImage" class="p-3 rounded-md bg-[hsl(var(--muted))]/30">
            <div class="text-xs text-[hsl(var(--muted-foreground))] mb-1">原始尺寸</div>
            <div class="font-mono text-sm">
              {{ originalWidth }} × {{ originalHeight }} px
            </div>
          </div>
          <div v-else class="p-3 rounded-md bg-[hsl(var(--muted))]/30">
            <div class="text-xs text-[hsl(var(--muted-foreground))]">載入中...</div>
          </div>

          <!-- 縮放比例滑桿 -->
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <label class="text-sm font-medium">縮放比例</label>
              <span class="text-sm font-mono text-[hsl(var(--muted-foreground))]">{{ scalePercent }}%</span>
            </div>
            <input 
              type="range" 
              min="10" 
              max="100" 
              step="5" 
              v-model.number="scalePercent"
              :disabled="!hasValidImage"
              class="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div class="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
              <span>10%</span>
              <span>100%（原始大小）</span>
            </div>
          </div>

          <!-- 輸出尺寸顯示 -->
          <div v-if="hasValidImage" class="p-3 rounded-md bg-[hsl(var(--accent))]/10 border border-[hsl(var(--accent))]/30">
            <div class="text-xs text-[hsl(var(--muted-foreground))] mb-1">輸出尺寸</div>
            <div class="font-mono text-sm font-medium text-[hsl(var(--accent-foreground))]">
              {{ outputWidth }} × {{ outputHeight }} px
            </div>
            <div class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              比例已鎖定，自動等比縮放
            </div>
          </div>
        </div>

        <!-- 中繼資料（跨欄） -->
        <div class="lg:col-span-2 space-y-4 p-4 rounded-lg border border-[hsl(var(--border))]">
          <h3 class="text-base font-semibold border-b border-[hsl(var(--border))] pb-2">進階選項</h3>
          
          <label class="flex items-start gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              v-model="strip" 
              class="mt-0.5 w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <div class="flex-1">
              <span class="text-sm font-medium group-hover:text-[hsl(var(--primary))]">移除中繼資料</span>
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                移除 EXIF、GPS、相機資訊等中繼資料，減少檔案大小並保護隱私
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  </section>
</template>

