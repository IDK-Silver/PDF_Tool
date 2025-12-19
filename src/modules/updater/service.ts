import { invoke } from '@tauri-apps/api/core'
import type { UpdateCheckResult } from './types'

export async function checkForUpdate(force = false): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>('check_for_update', { force })
}

export async function skipVersion(version: string): Promise<void> {
  await invoke('skip_version', { version })
}

export async function remindLater(hours = 24): Promise<void> {
  await invoke('remind_later', { hours })
}

export async function openReleasePage(url: string): Promise<void> {
  await invoke('open_release_page', { url })
}
