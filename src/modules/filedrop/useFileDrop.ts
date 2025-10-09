import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { DragDropEvent } from '@tauri-apps/api/webview'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useFileListStore } from '@/modules/filelist/store'
import { useMediaStore } from '@/modules/media/store'

const SUPPORTED_MEDIA = /\.(pdf|png|jpe?g|webp|gif|bmp|tiff?)$/i

function isTauriEnv() {
  // Tauri 2.x 使用 __TAURI_INTERNALS__ 而非 __TAURI__
  return typeof window !== 'undefined' && 
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

function filterSupported(paths: string[]) {
  return paths.filter(p => SUPPORTED_MEDIA.test(p.toLowerCase()))
}

export function useGlobalFileDrop() {
  const isDragging = ref(false)
  const filelist = useFileListStore()
  const media = useMediaStore()

  let unlisten: UnlistenFn | null = null
  let listenersAttached = false

  function preventDefault(e: DragEvent) {
    const types = e.dataTransfer?.types
    if (types && Array.from(types).includes('Files')) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
  }

  function handleDropEvent(event: DragDropEvent) {
    switch (event.type) {
      case 'enter': {
        const allowed = filterSupported(event.paths)
        isDragging.value = allowed.length > 0
        break
      }
      case 'drop': {
        isDragging.value = false
        const allowed = filterSupported(event.paths)
        if (!allowed.length) return
        filelist.addPaths(allowed)
        const firstPath = allowed[0]
        const firstItem = filelist.items.find(i => i.path === firstPath) || null
        if (firstItem) {
          media.select(firstItem)
        } else {
          media.selectPath(firstPath)
        }
        break
      }
      case 'leave': {
        isDragging.value = false
        break
      }
      case 'over':
      default:
        break
    }
  }

  onMounted(() => {
    if (!isTauriEnv()) return
    if (typeof document !== 'undefined') {
      document.addEventListener('dragover', preventDefault)
      document.addEventListener('drop', preventDefault)
      listenersAttached = true
    }
    const win = getCurrentWindow()
    win.onDragDropEvent(ev => {
      console.log('[FileDrop] Drag event:', ev.payload)
      handleDropEvent(ev.payload)
    })
      .then(fn => { 
        unlisten = fn
        console.log('[FileDrop] Tauri listener registered')
      })
      .catch((err) => { 
        console.error('[FileDrop] Failed to register listener:', err)
      })
  })

  onBeforeUnmount(() => {
    if (listenersAttached && typeof document !== 'undefined') {
      document.removeEventListener('dragover', preventDefault)
      document.removeEventListener('drop', preventDefault)
      listenersAttached = false
    }
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  })

  return {
    isDragging,
  }
}
