<script setup lang="ts">
import ModeChooseList from './components/ModeChooseList.vue'
import SettingBar from './components/SettingBar.vue'
import { useGlobalFileDrop } from '@/modules/filedrop/useFileDrop'
import { initOpenFileBridge } from '@/modules/app/openFileBridge'
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useUiStore } from '@/modules/ui/store'

const { isDragging } = useGlobalFileDrop()
const ui = useUiStore()
const asideClass = computed(() => ui.sidebarCollapsed ? 'hidden' : 'w-[260px]')
let disposeOpenBridge: (() => void) | null = null

function isEditableTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (t as any).isContentEditable === true
}

function onKeydown(e: KeyboardEvent) {
  if (!e.metaKey && !e.ctrlKey) return
  if (isEditableTarget(e.target)) return
  // Cmd/Ctrl + B: toggle/collapse sidebar
  const k = e.key.toLowerCase()
  if (k === 'b') {
    e.preventDefault()
    ui.toggleSidebar()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown, { passive: false })
  try {
    disposeOpenBridge = await initOpenFileBridge()
  } catch (err) {
    console.error('[App] Failed to init open-file bridge', err)
    disposeOpenBridge = null
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown as any)
  if (disposeOpenBridge) {
    try { disposeOpenBridge() } catch (err) {
      console.error('[App] Failed to teardown open-file bridge', err)
    }
    disposeOpenBridge = null
  }
})
</script>

<template>
  <div class="flex flex-row h-screen w-screen">
    <aside
      class="flex-shrink-0 bg-background flex flex-col border-r border-[hsl(var(--border))] pl-2 pr-4 relative z-50"
      :class="asideClass"
    >
      <!-- 固定區域：設定列和模式選擇 -->
      <div class="flex-shrink-0">
        <SettingBar />
        <ModeChooseList />
        <section class="w-full border-t border-[hsl(var(--border))] pt-[6px] py-2"></section>
      </div>
      <!-- 可滾動區域：檔案列表 -->
      <div class="flex-1 min-h-0 flex flex-col">
        <RouterView name="filelist" />
      </div>
    </aside>
    <main class="flex-1 min-h-0 overflow-hidden bg-background flex flex-col relative z-0 mr-8 mb-10">
      <div class="flex-1 min-h-0">
        <RouterView />
      </div>
    </main>
    <div
      v-if="isDragging"
      class="pointer-events-none fixed inset-0 z-[200] bg-black/40 flex items-center justify-center"
    >
      <div class="border-2 border-dashed border-[hsl(var(--primary))] bg-[hsl(var(--background))] px-8 py-6 rounded shadow text-lg text-[hsl(var(--foreground))]">
        將 PDF 或圖片拖曳到這裡
      </div>
    </div>
  </div>
</template>
