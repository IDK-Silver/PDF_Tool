export interface ReleaseAsset {
  name: string
  browserDownloadUrl: string
  size: number
}

export interface ReleaseInfo {
  tagName: string
  name: string
  body: string
  htmlUrl: string
  publishedAt: string
  assets: ReleaseAsset[]
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
  releaseInfo: ReleaseInfo | null
  error: string | null
}

export interface DownloadProgress {
  downloaded: number
  total: number | null
}

export interface UpdateResult {
  success: boolean
  error: string | null
}

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'installing' | 'ready-to-restart'

export interface UpdateState {
  status: UpdateStatus
  error: string | null
  result: UpdateCheckResult | null
  downloadProgress: DownloadProgress | null
  dialogVisible: boolean
}
