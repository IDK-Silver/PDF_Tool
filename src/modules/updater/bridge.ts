import { listen } from '@tauri-apps/api/event'
import { useUpdaterStore } from './store'
import { useSettingsStore } from '@/modules/settings/store'
import { isAppStoreBuild } from './service'
import type { DownloadProgress } from './types'

export async function initUpdaterBridge(): Promise<() => void> {
  const updater = useUpdaterStore()
  const settings = useSettingsStore()

  // Listen for menu "Check for Updates" event
  const unlisten1 = await listen('menu:check-update', async () => {
    await updater.check(true) // force = true
  })

  // Listen for download progress updates
  const unlisten2 = await listen<DownloadProgress>('update-download-progress', (event) => {
    updater.updateDownloadProgress(event.payload)
  })

  // Auto-check for updates on startup (if enabled and not App Store build)
  try {
    const isAppStore = await isAppStoreBuild()
    if (!isAppStore && settings.s.checkUpdateOnStartup) {
      // Silent check (force = false), only shows dialog if update is available
      await updater.check(false)
    }
  } catch (err) {
    console.error('[updater] Failed to auto-check for updates', err)
  }

  return () => {
    unlisten1()
    unlisten2()
  }
}
