import type { FileItem } from '@/components/FileList/types'

export type WorkspacePaneKey = 'left' | 'right'

export interface WorkspacePaneState {
  folderPath: string | null
  folderName: string | null
  bookmark?: string
  order: string[]
  selectedPath: string | null
}

export interface WorkspaceItem {
  id: string
  name: string
  activePane: WorkspacePaneKey
  left: WorkspacePaneState
  right: WorkspacePaneState
}

export interface WorkspaceFileEntry extends FileItem {
  type: 'pdf' | 'image'
}
