import { invoke } from '@tauri-apps/api/core'
import type { WorkspaceFileEntry } from './types'

export async function workspaceListMediaFiles(folderPath: string): Promise<WorkspaceFileEntry[]> {
  return invoke<WorkspaceFileEntry[]>('workspace_list_media_files', { folderPath })
}

export async function workspaceMoveFile(args: { srcPath: string; destDir: string; overwrite?: boolean }): Promise<{ path: string; overwritten: boolean }> {
  return invoke<{ path: string; overwritten: boolean }>('workspace_move_file', { args })
}

export async function workspaceDeleteFile(path: string): Promise<void> {
  await invoke('workspace_delete_file', { path })
}

export async function workspaceExportImages(args: {
  leftPath: string
  rightPath: string
  leftTargetWidthPx: number
  rightTargetWidthPx: number
  destPath: string
  gapPx?: number
}): Promise<{ path: string; width: number; height: number; size: number }> {
  return invoke('workspace_export_images', { args })
}
