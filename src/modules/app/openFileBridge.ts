import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useFileListStore } from '@/modules/filelist/store'
import { useMediaStore } from '@/modules/media/store'

const SUPPORTED_MEDIA = /\.(pdf|png|jpe?g|webp|gif|bmp|tiff?|svg)$/i

function isTauriEnv() {
  return typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

let stopListening: (() => void) | null = null

export async function initOpenFileBridge(): Promise<() => void> {
  if (!isTauriEnv()) return () => {}
  if (stopListening) return stopListening
  const filelist = useFileListStore()
  const media = useMediaStore()

  try {
    const unlisten = await listen<string[]>('open-file', async event => {
      const payload = Array.isArray(event.payload) ? event.payload : []
      const filtered = payload
        .filter(p => typeof p === 'string' && SUPPORTED_MEDIA.test(p))
      if (!filtered.length) return
      filelist.addPaths(filtered)
      const firstPath = filtered[0]
      try {
        await media.selectPath(firstPath)
      } catch (err) {
        console.error('[openFileBridge] Failed to select path', firstPath, err)
      }
    })

    stopListening = () => {
      unlisten()
      stopListening = null
    }

    try {
      await invoke('frontend_ready')
    } catch (err) {
      console.error('[openFileBridge] frontend_ready failed', err)
    }
  } catch (err) {
    console.error('[openFileBridge] Failed to register open-file listener', err)
    return () => {}
  }

  return stopListening || (() => {})
}
