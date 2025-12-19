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
  isSkipped: boolean
  isRemindLater: boolean
  error: string | null
}

export interface UpdateState {
  checking: boolean
  error: string | null
  result: UpdateCheckResult | null
  dialogVisible: boolean
}
