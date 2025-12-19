import { listen } from '@tauri-apps/api/event'
import { useUpdaterStore } from './store'
import type { UpdateCheckResult } from './types'

export async function initUpdaterBridge(): Promise<() => void> {
  const updater = useUpdaterStore()

  // Listen for menu "Check for Updates" event
  const unlisten1 = await listen('menu:check-update', async () => {
    await updater.check(true) // force = true
  })

  // Listen for background update check result
  const unlisten2 = await listen<UpdateCheckResult>('update-available', (event) => {
    updater.showUpdateAvailable(event.payload)
  })

  return () => {
    unlisten1()
    unlisten2()
  }
}
