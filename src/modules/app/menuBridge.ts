import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { useFileListStore } from '@/modules/filelist/store'
import { useMediaStore } from '@/modules/media/store'
import { openInFileManager } from '@/modules/media/openInFileManager'

function isTauriEnv() {
  return typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

let unlisteners: Array<() => void> = []

export async function initMenuBridge(): Promise<() => void> {
  if (!isTauriEnv()) return () => {}

  const filelist = useFileListStore()
  const media = useMediaStore()

  try {
    // File menu: Open
    const unlistenOpen = await listen('menu:open-file', async () => {
      try {
        const selected = await open({
          multiple: true,
          filters: [{
            name: 'Media Files',
            extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'svg']
          }]
        })

        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected]
          filelist.addPaths(paths)
          if (paths.length > 0) {
            await media.selectPath(paths[0])
          }
        }
      } catch (err) {
        console.error('[menuBridge] Failed to open file', err)
      }
    })

    // File menu: Close File
    const unlistenClose = await listen('menu:remove-file', () => {
      const current = media.selected
      if (current?.path) {
        filelist.remove(current.path)
      }
    })

    // File menu: Show in File Manager
    const unlistenReveal = await listen('menu:open-in-file-manager', async () => {
      const current = media.selected
      if (current?.path) {
        try {
          await openInFileManager(current.path)
        } catch (err) {
          console.error('[menuBridge] Failed to open in file manager', err)
        }
      }
    })

    // Edit menu: Find
    const unlistenFind = await listen('menu:find', () => {
      // Emit a custom event that can be caught by the MediaView component
      window.dispatchEvent(new CustomEvent('menu:find'))
    })

    // View menu events - emit as window events for MediaView to handle
    const unlistenZoomIn = await listen('menu:zoom-in', () => {
      window.dispatchEvent(new CustomEvent('menu:zoom-in'))
    })

    const unlistenZoomOut = await listen('menu:zoom-out', () => {
      window.dispatchEvent(new CustomEvent('menu:zoom-out'))
    })

    const unlistenFitWidth = await listen('menu:fit-width', () => {
      window.dispatchEvent(new CustomEvent('menu:fit-width'))
    })

    const unlistenFitPage = await listen('menu:fit-page', () => {
      window.dispatchEvent(new CustomEvent('menu:fit-page'))
    })

    const unlistenActualSize = await listen('menu:actual-size', () => {
      window.dispatchEvent(new CustomEvent('menu:actual-size'))
    })

    unlisteners = [
      unlistenOpen,
      unlistenClose,
      unlistenReveal,
      unlistenFind,
      unlistenZoomIn,
      unlistenZoomOut,
      unlistenFitWidth,
      unlistenFitPage,
      unlistenActualSize
    ]

    return () => {
      unlisteners.forEach(fn => fn())
      unlisteners = []
    }
  } catch (err) {
    console.error('[menuBridge] Failed to register menu listeners', err)
    return () => {}
  }
}
