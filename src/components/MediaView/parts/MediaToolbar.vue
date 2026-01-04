<script setup lang="ts">
import type { PropType } from 'vue'
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArchiveBoxIcon, ChevronDoubleRightIcon, FolderOpenIcon, MagnifyingGlassIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowsPointingOutIcon, XMarkIcon, PencilIcon } from '@heroicons/vue/24/outline'
import { useUiStore } from '@/modules/ui/store'
import { useAnnotationStore } from '@/modules/annotation/store'

const { t } = useI18n()

const props = defineProps({
  saving: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  canReveal: { type: Boolean, default: false },
  currentPage: { type: Number, default: 0 },
  totalPages: { type: Number, default: 0 },
  viewMode: { type: String as PropType<'fit' | 'actual'>, default: 'fit' },
  displayZoom: { type: Number, default: 100 },
  isPdf: { type: Boolean, default: false },
  canZoomIn: { type: Boolean, default: true },
  canZoomOut: { type: Boolean, default: true },
  searchActive: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'discard'): void
  (e: 'reveal'): void
  (e: 'toggle-search', ev: MouseEvent): void
  (e: 'set-fit-mode'): void
  (e: 'reset-zoom'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
  (e: 'jump-to-page', page: number): void
}>()

const ui = useUiStore()
const annotation = useAnnotationStore()

// Toggle annotation toolbar
function toggleAnnotationToolbar() {
  if (annotation.activeTool !== null) {
    annotation.setActiveTool(null)
    annotation.clearSelection()
    annotation.setPendingObject(null)
  } else {
    annotation.setActiveTool('select')
  }
}

// Shift 鍵狀態：按下 Shift 時，儲存按鈕改為「捨棄變更」
const shiftDown = ref(false)
function updateShiftState(e: KeyboardEvent) {
  // 以事件內的修飾鍵狀態為準；keyup 也會帶 shiftKey=false
  shiftDown.value = !!e.shiftKey
}
onMounted(() => {
  window.addEventListener('keydown', updateShiftState)
  window.addEventListener('keyup', updateShiftState)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', updateShiftState)
  window.removeEventListener('keyup', updateShiftState)
})

// 頁碼輸入：以輸入欄直接跳頁（Enter/Blur 提交，Esc 取消）
const pageFocused = ref(false)
const pageText = ref('0')

function syncPageText() {
  pageText.value = String(props.currentPage || 0)
}
syncPageText()

watch(() => props.currentPage, () => { if (!pageFocused.value) syncPageText() })

function clampToValidPage(n: number): number {
  const total = Math.max(0, props.totalPages || 0)
  if (total <= 0) return 0
  return Math.min(total, Math.max(1, Math.floor(n)))
}

function commitPageInput() {
  if (!props.isPdf || props.totalPages <= 0) { syncPageText(); return }
  const parsed = Number(String(pageText.value || '').replace(/[^0-9]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) { syncPageText(); return }
  const page = clampToValidPage(parsed)
  if (page && page !== props.currentPage) emit('jump-to-page', page)
}

function cancelPageInput(el?: HTMLInputElement | null) {
  syncPageText()
  if (el) el.blur()
}

function handlePageMouseDown(e: MouseEvent) {
  const el = e.currentTarget as HTMLInputElement | null
  if (!el) return
  e.preventDefault()
  el.focus()
  el.select()
}
</script>

<template>
  <div class="sticky top-0 z-20 bg-background/90 backdrop-blur border-b shrink-0">
    <div class="px-4 py-2 flex items-center justify-between gap-4 relative">
      <!-- 左側：檔案操作 -->
      <div class="flex items-center gap-3 z-10">
        <!-- 展開側欄（僅在側欄收合時顯示） -->
        <button v-if="ui.sidebarCollapsed" @click="ui.setSidebarCollapsed(false)"
          class="rounded w-8 h-8 flex items-center justify-center transition-colors hover:bg-hover" :title="t('sidebar.expand')">
          <ChevronDoubleRightIcon class="w-4 h-4" />
        </button>
        <button @click="shiftDown ? emit('discard') : emit('save')" :disabled="props.saving || !props.canSave"
          class="rounded w-8 h-8 flex items-center justify-center transition-colors"
          :class="props.canSave ? (shiftDown ? 'bg-red-500 text-white hover:bg-red-700' : 'bg-blue-400 text-white hover:bg-blue-700') : 'bg-card text-muted-foreground opacity-60 cursor-not-allowed'"
          :title="shiftDown ? t('toolbar.discard') : t('toolbar.save')">
          <component :is="shiftDown ? XMarkIcon : ArchiveBoxIcon" class="w-4 h-4" />
        </button>
        <button v-if="props.isPdf" data-search-trigger @click="emit('toggle-search', $event)"
          class="rounded w-8 h-8 flex items-center justify-center transition-colors"
          :class="props.searchActive ? 'bg-blue-400 text-white hover:bg-blue-700' : 'hover:bg-hover text-[hsl(var(--foreground))]'"
          :title="t('toolbar.search')">
          <MagnifyingGlassIcon class="w-4 h-4" />
        </button>
        <button @click="emit('reveal')" :disabled="!props.canReveal"
          class="rounded w-8 h-8 flex items-center justify-center transition-colors"
          :class="props.canReveal ? 'hover:bg-hover' : 'opacity-40 cursor-not-allowed'" :title="t('toolbar.revealInFinder')">
          <FolderOpenIcon class="w-4 h-4" />
        </button>

        <!-- Annotate toggle button -->
        <button @click="toggleAnnotationToolbar"
          class="rounded w-8 h-8 flex items-center justify-center transition-colors"
          :class="annotation.activeTool !== null ? 'bg-blue-400 text-white hover:bg-blue-700' : 'hover:bg-hover'"
          title="Annotate">
          <PencilIcon class="w-4 h-4" />
        </button>
      </div>

      <!-- 中間：頁碼導覽 (絕對置中) -->
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="flex items-center text-sm tabular-nums text-[hsl(var(--muted-foreground))] pointer-events-auto">
          <template v-if="props.isPdf && props.totalPages > 0">
            <input :value="pageText" :size="Math.max(1, String(pageText || '').length)"
              @input="(e: any) => pageText = e.target.value"
              @focus="pageFocused = true; ($event.target as HTMLInputElement).select()"
              @mousedown.prevent="handlePageMouseDown"
              @blur="pageFocused = false; commitPageInput()"
              @keydown.enter.prevent="commitPageInput(); ($event.target as HTMLInputElement).blur()"
              @keydown.esc.prevent="cancelPageInput($event.target as HTMLInputElement)" type="text" inputmode="numeric"
              pattern="[0-9]*"
              class="text-center text-[hsl(var(--foreground))] bg-transparent border-0 px-0 focus:outline-none w-auto"
              :title="t('toolbar.pageInputHint')" />
            <span class="mx-1">/</span>
            <span>{{ props.totalPages }}</span>
          </template>
          <template v-else>
            <span>0 / 0</span>
          </template>
        </div>
      </div>

      <!-- 右側：縮放控制 -->
      <div class="flex items-center gap-1 z-10">
        <!-- 縮小 -->
        <button @click="emit('zoom-out')" :disabled="!props.canZoomOut"
          class="w-8 h-8 rounded transition-colors flex items-center justify-center"
          :class="props.canZoomOut ? 'hover:bg-hover' : 'opacity-40 cursor-not-allowed'"
          :title="props.canZoomOut ? t('toolbar.zoomOut') : t('toolbar.zoomOutDisabled')">
          <MagnifyingGlassMinusIcon class="w-4 h-4" />
        </button>
        <!-- 實際大小 (放大鏡 + 1) -->
        <button @click="emit('reset-zoom')"
          :disabled="props.viewMode === 'actual' && props.displayZoom === 100"
          class="w-8 h-8 rounded transition-colors flex items-center justify-center relative"
          :class="props.viewMode === 'actual' && props.displayZoom === 100 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-hover'"
          :title="t('toolbar.actualSize')">
          <MagnifyingGlassIcon class="w-4 h-4" />
          <span class="absolute text-[7px] font-bold" style="top: 10px; left: 13px;">1</span>
        </button>
        <!-- 符合寬度 -->
        <button @click="emit('set-fit-mode')"
          :disabled="props.viewMode === 'fit'"
          class="w-8 h-8 rounded transition-colors flex items-center justify-center"
          :class="props.viewMode === 'fit' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-hover'"
          :title="t('toolbar.fitWidth')">
          <ArrowsPointingOutIcon class="w-4 h-4" />
        </button>
        <!-- 放大 -->
        <button @click="emit('zoom-in')" :disabled="!props.canZoomIn"
          class="w-8 h-8 rounded transition-colors flex items-center justify-center"
          :class="props.canZoomIn ? 'hover:bg-hover' : 'opacity-40 cursor-not-allowed'"
          :title="props.canZoomIn ? t('toolbar.zoomIn') : t('toolbar.zoomInDisabled')">
          <MagnifyingGlassPlusIcon class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
