import { invoke } from '@tauri-apps/api/core'
import type { UpdateCheckResult, ReleaseAsset } from './types'

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

export async function getPlatform(): Promise<string> {
  return invoke<string>('get_platform')
}

export function findPlatformAsset(assets: ReleaseAsset[], platform: string): ReleaseAsset | null {
  const patterns: Record<string, RegExp[]> = {
    'macos-arm64': [/\.dmg$/i, /aarch64.*\.dmg$/i, /arm64.*\.dmg$/i],
    'macos-x64': [/x64.*\.dmg$/i, /\.dmg$/i],
    'windows-arm64': [/arm64.*\.msi$/i, /aarch64.*\.msi$/i, /\.msi$/i],
    'windows-x64': [/x64.*\.msi$/i, /\.msi$/i, /\.exe$/i],
    'linux-x64': [/\.AppImage$/i, /\.deb$/i],
  }

  const platformPatterns = patterns[platform] || []

  for (const pattern of platformPatterns) {
    const match = assets.find(a => pattern.test(a.name))
    if (match) return match
  }

  return null
}
