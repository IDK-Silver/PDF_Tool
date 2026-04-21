import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { readLocalJson, writeLocalJson } from '@/modules/persist/local'

export type WorkspaceExportFormat = 'png' | 'jpeg' | 'webp'

export interface WorkspaceExportSettingsState {
  format: WorkspaceExportFormat
  baseWidthPx: number   // target width of the larger pane while keeping the current pane ratio
  quality: number       // 1-100, used for jpeg / webp
  lastDir: string | null
}

export const WORKSPACE_EXPORT_BASE_WIDTH_MIN_PX = 400
export const WORKSPACE_EXPORT_BASE_WIDTH_MAX_PX = 4000
export const WORKSPACE_EXPORT_BASE_WIDTH_DEFAULT_PX = 1200

export const defaultWorkspaceExportSettings: WorkspaceExportSettingsState = {
  format: 'png',
  baseWidthPx: WORKSPACE_EXPORT_BASE_WIDTH_DEFAULT_PX,
  quality: 90,
  lastDir: null,
}

export function clampBaseWidthPx(value: number): number {
  const v = Number.isFinite(value) ? Math.round(value) : WORKSPACE_EXPORT_BASE_WIDTH_DEFAULT_PX
  return Math.min(
    WORKSPACE_EXPORT_BASE_WIDTH_MAX_PX,
    Math.max(WORKSPACE_EXPORT_BASE_WIDTH_MIN_PX, v),
  )
}

export function clampQuality(value: number): number {
  const v = Number.isFinite(value) ? Math.round(value) : 90
  return Math.min(100, Math.max(1, v))
}

export function extensionFor(format: WorkspaceExportFormat): string {
  if (format === 'jpeg') return 'jpg'
  return format
}

const STORAGE_KEY = 'workspace-export-settings'

export const useWorkspaceExportSettings = defineStore('workspace-export-settings', () => {
  const s = ref<WorkspaceExportSettingsState>({ ...defaultWorkspaceExportSettings })

  ;(async () => {
    const loaded = await readLocalJson<Partial<WorkspaceExportSettingsState>>(STORAGE_KEY, {})
    const merged: WorkspaceExportSettingsState = {
      ...defaultWorkspaceExportSettings,
      ...loaded,
    }
    merged.format = (['png', 'jpeg', 'webp'] as WorkspaceExportFormat[]).includes(merged.format)
      ? merged.format
      : 'png'
    merged.baseWidthPx = clampBaseWidthPx(merged.baseWidthPx)
    merged.quality = clampQuality(merged.quality)
    Object.assign(s.value, merged)
  })()

  let persistTimer: number | null = null
  function schedulePersist(v: WorkspaceExportSettingsState) {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    persistTimer = window.setTimeout(() => {
      void writeLocalJson(STORAGE_KEY, v)
      persistTimer = null
    }, 200)
  }

  watch(s, v => schedulePersist(v), { deep: true })

  function reset() { Object.assign(s.value, defaultWorkspaceExportSettings) }

  return { s, reset }
})
