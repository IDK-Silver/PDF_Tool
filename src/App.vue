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
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { loadAppState, saveAppState, saveAppStateDebounced } from './composables/persistence'

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
let unlistenFileOpen: (() => void) | null = null
const prevent = (e: Event) => { e.preventDefault() }
let handleWinResize: (() => void) | null = null

onMounted(async () => {
  try {
    const persisted = await loadAppState()
    if (persisted) {
      console.log('[App.vue] Loading persisted state:', persisted)
      // 反轉列表順序，讓最新的檔案在最上面
      filesView.value = Array.isArray(persisted.files?.view) ? persisted.files.view.reverse() : []
      filesConvert.value = Array.isArray(persisted.files?.convert) ? persisted.files.convert.reverse() : []
      filesCompose.value = Array.isArray(persisted.files?.compose) ? persisted.files.compose.reverse() : []
      console.log('[App.vue] Loaded files:', filesView.value.map(f => ({id: f.id, name: f.name})))

      // 直接使用持久化的 activeId，不要覆蓋
      const persistedViewId = persisted.active?.view
      const persistedConvertId = persisted.active?.convert
      const persistedComposeId = persisted.active?.compose

      console.log('[App.vue] Setting activeViewId to:', persistedViewId)
      activeViewId.value = persistedViewId ?? null
      activeConvertId.value = persistedConvertId ?? null
      activeComposeId.value = persistedComposeId ?? null
      console.log('[App.vue] activeViewId after setting:', activeViewId.value)
      // 驗證 activeViewId 是否存在於檔案列表中
      const foundFile = filesView.value.find(f => f.id === activeViewId.value)
      console.log('[App.vue] Active file found:', foundFile ? foundFile.name : 'NOT FOUND')

      qView.value = persisted.queries?.view ?? ''
      qConvert.value = persisted.queries?.convert ?? ''
      qCompose.value = persisted.queries?.compose ?? ''
      if (persisted.lastMode) mode.value = persisted.lastMode
      if (persisted.ui?.leftWidthPx) leftWidth.value = clamp(persisted.ui.leftWidthPx)
      if (typeof persisted.ui?.leftCollapsed === 'boolean') leftCollapsed.value = persisted.ui.leftCollapsed

      // 移除自動選擇第一個檔案的邏輯，保持使用者的選擇
      // 只有在完全沒有 activeId 時才選擇第一個
      if (!activeViewId.value && filesView.value.length > 0) {
        console.log('[App.vue] No active file selected, selecting first file')
        activeViewId.value = filesView.value[0].id
      }
    }

    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)

    // 處理檔案開啟的函數
    const handleFileOpen = (paths: string[]) => {
      console.log('[App.vue] Handling file open:', paths)
      if (paths && Array.isArray(paths)) {
        let lastAddedId = null
        for (const path of paths) {
          // 檔案路徑已在後端處理完成，直接使用
          if (path.toLowerCase().endsWith('.pdf')) {
            const id = addTo(mode.value, { path, name: basename(path) })
            if (id) lastAddedId = id
          }
        }
        // 自動選擇並顯示最後開啟的檔案
        if (lastAddedId) {
          setActiveId(lastAddedId)
        }
      }
    }

    // 監聽檔案開啟事件（統一事件）
    unlistenFileOpen = await listen('open-file', (event) => {
      console.log('[App.vue] Open-file event received:', event)
      handleFileOpen(event.payload as string[])
    })

    // 主動獲取初始檔案（處理冷啟動的情況）
    try {
      const initialFiles = await invoke<string[]>('frontend_ready')
      if (initialFiles && initialFiles.length > 0) {
        console.log('[App.vue] Got initial files from frontend_ready:', initialFiles)
        handleFileOpen(initialFiles)
      }
    } catch (err) {
      console.warn('[App.vue] Failed to call frontend_ready:', err)
    }

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
        let lastAddedId = null
        for (const path of pdfs) {
          const id = addTo(mode.value, { path, name: basename(path) })
          if (id) lastAddedId = id
        }
        // 自動選擇最後拖入的檔案
        if (lastAddedId) {
          setActiveId(lastAddedId)
        }
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

  // 禁用預設的右鍵選單（除了 PDF 檢視器區域）
  window.addEventListener('contextmenu', handleContextMenu)

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

// 在應用關閉前立即儲存狀態（使用同步版本）
const saveBeforeUnload = (e?: BeforeUnloadEvent) => {
  const state = {
    version: 1 as const,
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
  }

  console.log('[App.vue] Saving state before unload, activeViewId:', activeViewId.value)

  // 嘗試同步儲存
  try {
    // 直接呼叫 saveAppState（它是異步的，但我們立即執行）
    saveAppState(state).then(() => {
      console.log('[App.vue] State saved successfully before unload')
    }).catch(err => {
      console.error('[App.vue] Failed to save state before unload:', err)
    })

    // 在 Tauri 環境中，給一點時間讓儲存完成
    if (e) {
      e.preventDefault()
      e.returnValue = ''
      // 延遲一下讓儲存完成
      setTimeout(() => {
        window.close()
      }, 100)
      return false
    }
  } catch (err) {
    console.error('[App.vue] Error in saveBeforeUnload:', err)
  }
}

// 監聽頁面關閉事件
window.addEventListener('beforeunload', saveBeforeUnload)
// Tauri 特定的關閉事件
window.addEventListener('unload', () => saveBeforeUnload())

// 儲存右鍵事件處理函數的參考
const handleContextMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  const isPdfViewer = target.closest('.pdf-viewer') || target.closest('.page-inner')
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
  if (!isPdfViewer && !isInput) {
    e.preventDefault()
  }
}

onBeforeUnmount(() => {
  saveBeforeUnload() // 確保在組件卸載前儲存
  window.removeEventListener('beforeunload', saveBeforeUnload)
  window.removeEventListener('unload', () => saveBeforeUnload())
  window.removeEventListener('dragover', prevent)
  window.removeEventListener('drop', prevent)
  window.removeEventListener('contextmenu', handleContextMenu)
  try { unlistenDrag?.() } finally { unlistenDrag = null }
  try { unlistenFileOpen?.() } finally { unlistenFileOpen = null }
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
    let lastAddedId = null
    for (const path of paths) {
      const id = addTo(mode.value, { path, name: basename(path) })
      if (id) lastAddedId = id
    }
    // 自動選擇最後新增的檔案
    if (lastAddedId) {
      setActiveId(lastAddedId)
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
  console.log('[App.vue] Persisting state, activeViewId:', activeViewId.value)
  const state = {
    version: 1 as const,
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
  }

  // 對於 activeId 的變更，立即儲存；其他變更使用防抖
  if (activeViewId.value || activeConvertId.value || activeComposeId.value) {
    // 立即儲存
    saveAppState(state).then(() => {
      console.log('[App.vue] State saved immediately, activeViewId:', activeViewId.value)
    })
  } else {
    // 使用防抖儲存
    saveAppStateDebounced(state, 1000)
  }
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
  function finish() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onBlur, true)
    target.removeEventListener('lostpointercapture', onLostCapture)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }
  function onUp(ev: PointerEvent) {
    try { (target as any).releasePointerCapture?.(ev.pointerId) } catch {}
    finish()
  }
  function onCancel(_ev: PointerEvent) { finish() }
  function onLostCapture(_ev: Event) { finish() }
  function onBlur() { finish() }
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('blur', onBlur, true)
  target.addEventListener('lostpointercapture', onLostCapture)
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
