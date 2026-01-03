import { invoke } from '@tauri-apps/api/core'
import type { UpdateCheckResult, UpdateResult } from './types'

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>('check_for_update')
}

export async function downloadAndInstallUpdate(): Promise<UpdateResult> {
  return invoke<UpdateResult>('download_and_install_update')
}

export async function openReleasePage(url: string): Promise<void> {
  await invoke('open_release_page', { url })
}

export async function getPlatform(): Promise<string> {
  return invoke<string>('get_platform')
}

export async function isSelfUpdateEnabled(): Promise<boolean> {
  return invoke<boolean>('is_self_update_enabled')
}

export async function isAppStoreBuild(): Promise<boolean> {
  return invoke<boolean>('is_app_store_build')
}
