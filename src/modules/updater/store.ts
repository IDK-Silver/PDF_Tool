import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { UpdateState, UpdateCheckResult } from './types'
import { checkForUpdate, skipVersion, remindLater, openReleasePage } from './service'

export const useUpdaterStore = defineStore('updater', () => {
  const state = ref<UpdateState>({
    checking: false,
    error: null,
    result: null,
    dialogVisible: false,
  })

  async function check(force = false) {
    state.value.checking = true
    state.value.error = null

    try {
      const result = await checkForUpdate(force)
      state.value.result = result

      if (result.error) {
        state.value.error = result.error
      } else if (result.hasUpdate && !result.isSkipped && !result.isRemindLater) {
        state.value.dialogVisible = true
      } else if (force && !result.hasUpdate) {
        // User manually checked and no update available
        state.value.dialogVisible = true
      }
    } catch (err: any) {
      state.value.error = err?.message || String(err)
    } finally {
      state.value.checking = false
    }
  }

  async function downloadNow() {
    const url = state.value.result?.releaseInfo?.htmlUrl
    if (url) {
      await openReleasePage(url)
      state.value.dialogVisible = false
    }
  }

  async function later(hours = 24) {
    try {
      await remindLater(hours)
      state.value.dialogVisible = false
    } catch (err: any) {
      console.error('[updater] Failed to set remind later:', err)
    }
  }

  async function skip() {
    const version = state.value.result?.latestVersion
    if (version) {
      try {
        await skipVersion(version)
        state.value.dialogVisible = false
      } catch (err: any) {
        console.error('[updater] Failed to skip version:', err)
      }
    }
  }

  function closeDialog() {
    state.value.dialogVisible = false
  }

  function showUpdateAvailable(result: UpdateCheckResult) {
    state.value.result = result
    state.value.dialogVisible = true
  }

  return {
    state,
    check,
    downloadNow,
    later,
    skip,
    closeDialog,
    showUpdateAvailable,
  }
})
