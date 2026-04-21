<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { XMarkIcon, FolderOpenIcon } from '@heroicons/vue/24/outline'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { dirname, join } from '@tauri-apps/api/path'
import {
  WORKSPACE_EXPORT_BASE_WIDTH_MAX_PX,
  WORKSPACE_EXPORT_BASE_WIDTH_MIN_PX,
  clampBaseWidthPx,
  clampQuality,
  extensionFor,
  useWorkspaceExportSettings,
  type WorkspaceExportFormat,
} from '@/modules/workspace/exportSettings'
import { workspaceExportImages } from '@/modules/workspace/service'

type CaptureSource = {
  leftPath: string
  rightPath: string
  leftCssWidth: number
  rightCssWidth: number
  leftImageWidthPx: number | null
  rightImageWidthPx: number | null
  defaultBaseName: string
  defaultDir: string | null
}

const props = defineProps<{
  open: boolean
  source: CaptureSource | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'exported', payload: { path: string; format: WorkspaceExportFormat }): void
}>()

const { t } = useI18n()
const settings = useWorkspaceExportSettings()

const format = computed<WorkspaceExportFormat>({
  get: () => settings.s.format,
  set: (v) => { settings.s.format = v },
})

const baseWidth = computed<number>({
  get: () => settings.s.baseWidthPx,
  set: (v) => { settings.s.baseWidthPx = clampBaseWidthPx(v) },
})

const quality = computed<number>({
  get: () => settings.s.quality,
  set: (v) => { settings.s.quality = clampQuality(v) },
})

const destPath = ref<string>('')
const isExporting = ref(false)
const errorMessage = ref<string>('')

const showsQualitySlider = computed(() => format.value !== 'png')

const currentExtension = computed(() => extensionFor(format.value))

function swapExtension(path: string, ext: string): string {
  const sep = path.includes('\\') && !path.includes('/') ? '\\' : '/'
  const parts = path.split(sep)
  const last = parts[parts.length - 1] ?? ''
  const dot = last.lastIndexOf('.')
  const base = dot > 0 ? last.slice(0, dot) : last
  parts[parts.length - 1] = `${base}.${ext}`
  return parts.join(sep)
}

async function suggestDefaultPath(): Promise<string> {
  const src = props.source
  if (!src) return ''
  const ext = currentExtension.value
  const fileName = `${src.defaultBaseName}.${ext}`
  const dir = settings.s.lastDir || src.defaultDir || ''
  if (!dir) return fileName
  try {
    return await join(dir, fileName)
  } catch {
    return fileName
  }
}

watch(
  () => props.open,
  async (next) => {
    if (!next) return
    errorMessage.value = ''
    destPath.value = await suggestDefaultPath()
    await nextTick()
  },
)

// When the user changes format, rewrite the extension on the current dest path.
watch(format, (next) => {
  if (!destPath.value) return
  destPath.value = swapExtension(destPath.value, extensionFor(next))
})

function close() {
  if (isExporting.value) return
  emit('update:open', false)
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close()
}

async function pickDestination() {
  const src = props.source
  const ext = currentExtension.value
  const formatLabel = format.value.toUpperCase()
  const suggested = destPath.value || (src ? `${src.defaultBaseName}.${ext}` : `capture.${ext}`)
  const chosen = await saveDialog({
    defaultPath: suggested,
    filters: [{ name: formatLabel, extensions: [ext] }],
  })
  if (chosen) destPath.value = chosen
}

async function onExport() {
  const src = props.source
  if (!src || !destPath.value || isExporting.value) return

  errorMessage.value = ''
  isExporting.value = true
  try {
    const deviceScale = Math.max(1, window.devicePixelRatio || 1)
    const largestCssWidth = Math.max(src.leftCssWidth, src.rightCssWidth, 1)
    const targetLargest = Math.max(
      Math.round(largestCssWidth * deviceScale),
      clampBaseWidthPx(baseWidth.value),
    )
    const scale = targetLargest / largestCssWidth
    const leftWidth = Math.max(1, Math.round(src.leftCssWidth * scale))
    const rightWidth = Math.max(1, Math.round(src.rightCssWidth * scale))
    const startedAt = performance.now()

    // Ensure the file extension matches the selected format so the backend writes
    // a file the OS opens correctly with the user-chosen destination.
    const normalizedDest = destPath.value.toLowerCase().endsWith(`.${currentExtension.value}`)
      ? destPath.value
      : swapExtension(destPath.value, currentExtension.value)

    console.info('[workspace] export request', {
      format: format.value,
      quality: quality.value,
      baseWidth: targetLargest,
      scale,
      leftTargetWidth: leftWidth,
      rightTargetWidth: rightWidth,
      destPath: normalizedDest,
    })

    const result = await workspaceExportImages({
      leftPath: src.leftPath,
      rightPath: src.rightPath,
      leftTargetWidthPx: leftWidth,
      rightTargetWidthPx: rightWidth,
      destPath: normalizedDest,
      gapPx: 12,
      format: format.value,
      quality: quality.value,
    })

    console.info('[workspace] export finished', {
      path: result.path,
      width: result.width,
      height: result.height,
      size: result.size,
      format: result.format,
      durationMs: Math.round(performance.now() - startedAt),
    })

    try {
      settings.s.lastDir = await dirname(result.path)
    } catch {
      // non-fatal
    }

    emit('exported', { path: result.path, format: format.value })
    emit('update:open', false)
  } catch (error: any) {
    const msg = (error && (error.message || error.toString())) || t('workspace.captureFailed')
    errorMessage.value = typeof msg === 'string' ? msg : t('workspace.captureFailed')
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="props.open"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        @click="onBackdropClick"
      >
        <div
          class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-xl"
          @click.stop
        >
          <div class="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 class="text-base font-medium">{{ t('workspace.exportDialog.title') }}</h2>
            <button
              class="flex h-7 w-7 items-center justify-center rounded transition hover:bg-[hsl(var(--selection))] disabled:opacity-50"
              :disabled="isExporting"
              :aria-label="t('workspace.exportDialog.close')"
              @click="close"
            >
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div class="space-y-2">
              <label class="block text-sm font-medium">{{ t('workspace.exportDialog.format') }}</label>
              <select
                v-model="format"
                :disabled="isExporting"
                class="w-full rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] disabled:opacity-50"
              >
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
              </select>
              <p class="text-xs text-[hsl(var(--muted-foreground))]">
                {{ t('workspace.exportDialog.formatDesc') }}
              </p>
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium">{{ t('workspace.exportDialog.baseWidth') }}</label>
                <span class="font-mono text-sm text-[hsl(var(--muted-foreground))]">{{ baseWidth }} px</span>
              </div>
              <input
                type="range"
                :min="WORKSPACE_EXPORT_BASE_WIDTH_MIN_PX"
                :max="WORKSPACE_EXPORT_BASE_WIDTH_MAX_PX"
                step="50"
                v-model.number="baseWidth"
                :disabled="isExporting"
                class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div class="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
                <span>{{ WORKSPACE_EXPORT_BASE_WIDTH_MIN_PX }}</span>
                <span>{{ WORKSPACE_EXPORT_BASE_WIDTH_MAX_PX }}</span>
              </div>
              <p class="text-xs text-[hsl(var(--muted-foreground))]">
                {{ t('workspace.exportDialog.baseWidthDesc') }}
              </p>
            </div>

            <div v-if="showsQualitySlider" class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium">{{ t('workspace.exportDialog.quality') }}</label>
                <span class="font-mono text-sm text-[hsl(var(--muted-foreground))]">{{ quality }}</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                v-model.number="quality"
                :disabled="isExporting"
                class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div class="space-y-2">
              <label class="block text-sm font-medium">{{ t('workspace.exportDialog.destination') }}</label>
              <div class="flex gap-2">
                <input
                  v-model="destPath"
                  type="text"
                  :placeholder="t('workspace.exportDialog.destPlaceholder')"
                  :disabled="isExporting"
                  class="min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] disabled:opacity-50"
                />
                <button
                  class="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm hover:bg-[hsl(var(--selection))] disabled:opacity-50"
                  :disabled="isExporting"
                  @click="pickDestination"
                >
                  <FolderOpenIcon class="h-4 w-4" />
                  <span>{{ t('workspace.exportDialog.browse') }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="errorMessage"
              class="rounded-md border border-[hsl(var(--destructive))]/50 bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]"
            >
              {{ errorMessage }}
            </div>
          </div>

          <div class="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
            <button
              class="rounded border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-[hsl(var(--selection))] disabled:opacity-50"
              :disabled="isExporting"
              @click="close"
            >
              {{ t('workspace.exportDialog.cancel') }}
            </button>
            <button
              class="inline-flex items-center gap-2 rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
              :disabled="isExporting || !destPath || !props.source"
              @click="onExport"
            >
              <span
                v-if="isExporting"
                class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[hsl(var(--primary-foreground))] border-t-transparent"
              ></span>
              <span>
                {{ isExporting ? t('workspace.exportDialog.exporting') : t('workspace.exportDialog.export') }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
