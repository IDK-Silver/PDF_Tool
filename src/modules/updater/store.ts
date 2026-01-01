import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UpdateState, UpdateCheckResult, DownloadProgress } from './types'
import { checkForUpdate, downloadAndInstallUpdate, openReleasePage, isSelfUpdateEnabled } from './service'

export const useUpdaterStore = defineStore('updater', () => {
  const state = ref<UpdateState>({
    status: 'idle',
    error: null,
    result: null,
    downloadProgress: null,
    dialogVisible: false,
  })

  const selfUpdateEnabled = ref<boolean | null>(null)

  // Check if self-update feature is enabled (cached)
  async function checkSelfUpdateEnabled(): Promise<boolean> {
    if (selfUpdateEnabled.value === null) {
      selfUpdateEnabled.value = await isSelfUpdateEnabled()
    }
    return selfUpdateEnabled.value
  }

  async function check(force = false) {
    state.value.status = 'checking'
    state.value.error = null

    try {
      const result = await checkForUpdate()
      state.value.result = result

      if (result.error) {
        state.value.error = result.error
        state.value.status = 'idle'
      } else if (result.hasUpdate) {
        state.value.dialogVisible = true
        state.value.status = 'idle'
      } else if (force) {
        // User manually checked and no update available
        state.value.dialogVisible = true
        state.value.status = 'idle'
      } else {
        state.value.status = 'idle'
      }
    } catch (err: any) {
      state.value.error = err?.message || String(err)
      state.value.status = 'idle'
    }
  }

  async function downloadNow() {
    const releaseInfo = state.value.result?.releaseInfo
    if (!releaseInfo) return

    // Check if self-update is enabled
    const canSelfUpdate = await checkSelfUpdateEnabled()

    if (canSelfUpdate) {
      // Use Tauri updater for automatic download and install
      state.value.status = 'downloading'
      state.value.downloadProgress = { downloaded: 0, total: null }

      try {
        const result = await downloadAndInstallUpdate()

        if (result.success) {
          state.value.status = 'ready-to-restart'
        } else {
          state.value.error = result.error || 'Update failed'
          state.value.status = 'idle'
          // Fallback to manual download
          await openReleasePage(releaseInfo.htmlUrl)
          state.value.dialogVisible = false
        }
      } catch (err: any) {
        state.value.error = err?.message || String(err)
        state.value.status = 'idle'
        // Fallback to manual download
        await openReleasePage(releaseInfo.htmlUrl)
        state.value.dialogVisible = false
      }
    } else {
      // Self-update disabled (App Store build), open release page
      await openReleasePage(releaseInfo.htmlUrl)
      state.value.dialogVisible = false
    }
  }

  function updateDownloadProgress(progress: DownloadProgress) {
    state.value.downloadProgress = progress
  }

  function closeDialog() {
    // Only allow closing if not downloading
    if (state.value.status !== 'downloading') {
      state.value.dialogVisible = false
      state.value.status = 'idle'
      state.value.downloadProgress = null
    }
  }

  function showUpdateAvailable(result: UpdateCheckResult) {
    state.value.result = result
    state.value.dialogVisible = true
  }

  // Computed helpers
  const isChecking = computed(() => state.value.status === 'checking')
  const isDownloading = computed(() => state.value.status === 'downloading')
  const isReadyToRestart = computed(() => state.value.status === 'ready-to-restart')
  const downloadPercent = computed(() => {
    const progress = state.value.downloadProgress
    if (!progress || !progress.total) return null
    return Math.round((progress.downloaded / progress.total) * 100)
  })

  return {
    state,
    check,
    downloadNow,
    closeDialog,
    showUpdateAvailable,
    updateDownloadProgress,
    isChecking,
    isDownloading,
    isReadyToRestart,
    downloadPercent,
  }
})
