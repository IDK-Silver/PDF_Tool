<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, provide } from "vue";
import { useRoute, useRouter } from "vue-router"
import ModeTabs from './components/ModeTabs.vue'
import AppHeader from './components/AppHeader.vue'
import FileListPanel from './components/FileListPanel.vue'
import { useModeFiles } from './composables/useModeFiles'
import type { Mode } from './types/pdf'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { loadAppState, saveAppStateDebounced } from './composables/persistence'

const route = useRoute()
const router = useRouter()
const isSettings = computed(() => route.path.startsWith('/settings'))

// 將模式與路由同步（雙向）
const mode = computed<Mode>({
  get: () => {
    const p = route.path
    if (p.startsWith('/convert')) return 'convert'
    if (p.startsWith('/compose')) return 'compose'
    return 'view'
  },
  set: (m) => {
    const path = m === 'view' ? '/view' : m === 'convert' ? '/convert' : '/compose'
    if (route.path !== path) router.replace(path)
  }
})

// 使用 composable 管理各模式清單與選取
const {
  // expose per-mode lists & active ids for persistence
  filesView,
  filesConvert,
  filesCompose,
  activeViewId,
  activeConvertId,
  activeComposeId,
  currentFiles,
  currentActiveId,
  activeFile,
  setActiveId,
  removeFromCurrent,
  addTo,
} = useModeFiles(mode)

// 左欄寬度（可拖曳）
const leftWidth = ref(320)
const minLeft = 240
const maxLeft = ref(Math.max(minLeft, window.innerWidth * 0.7))
const clamp = (v: number) => Math.min(Math.max(v, minLeft), maxLeft.value)
// 左欄收合
const leftCollapsed = ref(false)
provide('leftCollapsed', leftCollapsed)
provide('setLeftCollapsed', (v?: boolean) => { leftCollapsed.value = typeof v === 'boolean' ? v : !leftCollapsed.value })

function onGlobalKey(e: KeyboardEvent) {
  const meta = e.metaKey || e.ctrlKey
  if (!meta) return
  const t = e.target as HTMLElement | null
  const tag = (t?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return
  if (e.key.toLowerCase() === 'b') { e.preventDefault(); leftCollapsed.value = !leftCollapsed.value }
}

// 每個模式的搜尋字串與過濾結果
const qView = ref('')
const qConvert = ref('')
const qCompose = ref('')
const currentQuery = computed({
  get: () => (mode.value === 'view' ? qView.value : mode.value === 'convert' ? qConvert.value : qCompose.value),
  set: (v: string) => {
    if (mode.value === 'view') qView.value = v
    else if (mode.value === 'convert') qConvert.value = v
    else qCompose.value = v
  },
})

const filteredFiles = computed(() => {
  const term = currentQuery.value.trim().toLowerCase()
  if (!term) return currentFiles.value
  return currentFiles.value.filter(f => f.name.toLowerCase().includes(term))
})

function basename(p: string) {
  // cross-platform basename without Node path module
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

// Drag & Drop (Tauri file-drop)
const isDragging = ref(false)
let unlistenDrag: (() => void) | null = null
const prevent = (e: Event) => { e.preventDefault() }
let handleWinResize: (() => void) | null = null

onMounted(async () => {
  try {
    const persisted = await loadAppState()
    if (persisted) {
      filesView.value = Array.isArray(persisted.files?.view) ? persisted.files.view : []
      filesConvert.value = Array.isArray(persisted.files?.convert) ? persisted.files.convert : []
      filesCompose.value = Array.isArray(persisted.files?.compose) ? persisted.files.compose : []
      activeViewId.value = persisted.active?.view ?? null
      activeConvertId.value = persisted.active?.convert ?? null
      activeComposeId.value = persisted.active?.compose ?? null
      qView.value = persisted.queries?.view ?? ''
      qConvert.value = persisted.queries?.convert ?? ''
      qCompose.value = persisted.queries?.compose ?? ''
      if (persisted.lastMode) mode.value = persisted.lastMode
      if (persisted.ui?.leftWidthPx) leftWidth.value = clamp(persisted.ui.leftWidthPx)
      if (typeof persisted.ui?.leftCollapsed === 'boolean') leftCollapsed.value = persisted.ui.leftCollapsed
    }

    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    // Preferred v2 API: Webview onDragDropEvent
    unlistenDrag = await getCurrentWebview().onDragDropEvent((e) => {
      const payload = e.payload
      if (payload.type === 'enter' || payload.type === 'over') {
        isDragging.value = true
      } else if (payload.type === 'leave') {
        isDragging.value = false
      } else if (payload.type === 'drop') {
        isDragging.value = false
        const paths = payload.paths || []
        const pdfs = paths.filter((p) => p.toLowerCase().endsWith('.pdf'))
        if (!pdfs.length) {
          console.debug('DragDrop: no PDFs in payload', paths)
        }
        for (const path of pdfs) addTo(mode.value, { path, name: basename(path) })
      }
    })
  } catch (err) {
    // likely running in pure web (no Tauri); ignore
    console.warn('File drop not available:', err)
  }
  // window resize: 更新最大寬度並夾住目前值
  handleWinResize = () => {
    maxLeft.value = Math.max(minLeft, window.innerWidth * 0.7)
    leftWidth.value = clamp(leftWidth.value)
  }
  window.addEventListener('resize', handleWinResize)
  window.addEventListener('keydown', onGlobalKey)
  // register watchers after initial load
  watch([
    filesView, filesConvert, filesCompose,
    activeViewId, activeConvertId, activeComposeId,
    () => qView.value, () => qConvert.value, () => qCompose.value,
    () => mode.value,
    () => leftWidth.value,
    () => leftCollapsed.value,
  ], persistNow, { deep: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', prevent)
  window.removeEventListener('drop', prevent)
  try { unlistenDrag?.() } finally { unlistenDrag = null }
  if (handleWinResize) {
    try { window.removeEventListener('resize', handleWinResize) } finally { handleWinResize = null }
  }
  window.removeEventListener('keydown', onGlobalKey)
})

async function onAddFiles() {
  try {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'PDF', extensions: ['pdf', 'PDF'] }]
    })
    if (!selected) return
    const paths = Array.isArray(selected) ? selected : [selected]
    for (const path of paths) {
      addTo(mode.value, { path, name: basename(path) })
    }
  } catch (e) {
    console.warn('open dialog failed', e)
  }
}
function onRemove(id: string) {
  removeFromCurrent(id)
}
function onSelect(id: string | null) { setActiveId(id) }
function onTabNavigate(m: Mode) { mode.value = m }

// Persist on changes (lists, active selections, queries, and mode)
function persistNow() {
  saveAppStateDebounced({
    version: 1,
    lastMode: mode.value,
    files: {
      view: filesView.value,
      convert: filesConvert.value,
      compose: filesCompose.value,
    },
    active: {
      view: activeViewId.value,
      convert: activeConvertId.value,
      compose: activeComposeId.value,
    },
    queries: {
      view: qView.value,
      convert: qConvert.value,
      compose: qCompose.value,
    },
    ui: { leftWidthPx: leftWidth.value, leftCollapsed: leftCollapsed.value },
  }, 1000)
}

// 拖移調整左欄寬度
function onResizeStart(e: PointerEvent) {
  const startX = e.clientX
  const start = leftWidth.value
  const target = e.currentTarget as HTMLElement
  try { (target as any).setPointerCapture?.(e.pointerId) } catch {}

  function onMove(ev: PointerEvent) {
    leftWidth.value = clamp(start + (ev.clientX - startX))
  }
  function onUp(ev: PointerEvent) {
    try { (target as any).releasePointerCapture?.(ev.pointerId) } catch {}
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}



</script>

<template>
  <main class="app-grid" :style="{ gridTemplateColumns: ((isSettings || leftCollapsed) ? '0px 0px 1fr' : leftWidth + 'px 6px 1fr') }">
    <div v-if="isDragging" class="drop-overlay" aria-hidden="true">
      PDF 匯入
    </div>
    <section class="left-col">
      <header class="menu">
        <AppHeader />
        <ModeTabs v-if="!isSettings && !leftCollapsed" v-model="mode" @navigate="onTabNavigate" />
      </header>
      <FileListPanel v-if="!isSettings && !leftCollapsed" :key="mode" :files="filteredFiles" :active-id="currentActiveId" v-model:query="currentQuery"
        @add="onAddFiles" @select="onSelect" @remove="onRemove">
      </FileListPanel>
    </section>
    <div v-show="!isSettings && !leftCollapsed"
      class="col-resizer"
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="leftWidth"
      aria-label="調整側欄寬度"
      @pointerdown="onResizeStart"
    />
    <section class="right-col">
      <router-view v-slot="{ Component }">
        <component :is="Component" :active-file="activeFile" />
      </router-view>
    </section>
  </main>

</template>

<style>
.app-grid {
  display: grid;
  grid-template-rows: 1fr;
  height: 100vh;
  /* 防止整頁滾動，改由子區塊管理 */
  overflow: hidden;
}

.left-col {
  grid-column: 1;
  display: grid;
  grid-template-rows: auto 1fr;
  border-right: 1px solid var(--border);
  /* 允許子元素正確溢出處理 */
  min-height: 0;
  /* 左欄自身不滾動 */
  overflow: hidden;
}

.menu {
  padding: 8px 8px;
  border-bottom: 1px solid var(--border);
}

.right-col {
  grid-column: 3;
  height: 100%;
  overflow: hidden;
  padding: 12px;
}

.mode-wrap {
  height: 100%;
}

.pad {
  padding: 12px;
}

.muted {
  color: var(--text-muted);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.7);
  border: 2px dashed var(--border);
  color: var(--text-muted, #6b7280);
  font-weight: 500;
  z-index: 10;
  pointer-events: none;
}

.col-resizer {
  grid-column: 2;
  grid-row: 1 / -1;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
}
.col-resizer:hover { background: var(--hover, #f9fafb); }
.col-resizer:active { background: var(--hover, #f3f4f6); }
</style>
