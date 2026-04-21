<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDoubleRightIcon, PencilSquareIcon, PhotoIcon } from '@heroicons/vue/24/outline'
import WorkspacePane from './parts/WorkspacePane.vue'
import CaptureExportDialog from './parts/CaptureExportDialog.vue'
import { useWorkspaceStore } from '@/modules/workspace/store'
import { useUiStore } from '@/modules/ui/store'

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

const { t } = useI18n()
const workspace = useWorkspaceStore()
const ui = useUiStore()
const captureRoot = ref<HTMLElement | null>(null)
const isRenaming = ref(false)
const renameDraft = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const exportDialogOpen = ref(false)
const exportSource = ref<CaptureSource | null>(null)

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as any).isContentEditable === true
}

async function onKeydown(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (event.shiftKey) {
      workspace.setActivePane('left')
    } else {
      await workspace.navigateActivePane(-1)
    }
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (event.shiftKey) {
      workspace.setActivePane('right')
    } else {
      await workspace.navigateActivePane(1)
    }
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    await workspace.navigateActivePane(-1)
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    await workspace.navigateActivePane(1)
  }
}

function onCapture() {
  const root = captureRoot.value
  const current = workspace.currentWorkspace
  if (!root || !current) return
  const leftPane = root.querySelector('[data-workspace-capture="left"]') as HTMLElement | null
  const rightPane = root.querySelector('[data-workspace-capture="right"]') as HTMLElement | null
  if (!leftPane || !rightPane) return

  try {
    const leftSession = workspace.getPaneSession('left')
    const rightSession = workspace.getPaneSession('right')
    const leftDescriptor = leftSession.descriptor
    const rightDescriptor = rightSession.descriptor
    if (leftDescriptor?.type !== 'image' || rightDescriptor?.type !== 'image') {
      throw new Error(t('workspace.captureImageOnly'))
    }

    const leftCard = leftPane.querySelector('[data-image-card]') as HTMLElement | null
    const rightCard = rightPane.querySelector('[data-image-card]') as HTMLElement | null
    const leftWidth = Math.round(leftCard?.getBoundingClientRect().width || 0)
    const rightWidth = Math.round(rightCard?.getBoundingClientRect().width || 0)
    if (leftWidth <= 0 || rightWidth <= 0) {
      throw new Error(t('workspace.captureImageMissing'))
    }

    const baseDir = workspace.getPaneState('left')?.folderPath
      || workspace.getPaneState('right')?.folderPath
      || null

    exportSource.value = {
      leftPath: leftDescriptor.path,
      rightPath: rightDescriptor.path,
      leftCssWidth: leftWidth,
      rightCssWidth: rightWidth,
      leftImageWidthPx: leftDescriptor.width ?? null,
      rightImageWidthPx: rightDescriptor.width ?? null,
      defaultBaseName: current.name,
      defaultDir: baseDir,
    }
    exportDialogOpen.value = true
  } catch (error) {
    console.error('[workspace] capture failed', error)
    alert(error instanceof Error && error.message ? error.message : t('workspace.captureFailed'))
  }
}

function onRenameWorkspace() {
  const current = workspace.currentWorkspace
  if (!current) return
  renameDraft.value = current.name
  isRenaming.value = true
  void nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function cancelRenameWorkspace() {
  isRenaming.value = false
  renameDraft.value = ''
}

function commitRenameWorkspace() {
  workspace.renameCurrentWorkspace(renameDraft.value)
  const current = workspace.currentWorkspace
  renameDraft.value = current?.name ?? ''
  isRenaming.value = false
}

function onRenameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRenameWorkspace()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelRenameWorkspace()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, { passive: false })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown as any)
})
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="sticky top-0 z-20 border-b border-[hsl(var(--border))] bg-background/90 backdrop-blur">
      <div class="flex items-center gap-3 px-3 py-2">
        <button
          v-if="ui.sidebarCollapsed"
          class="rounded w-7 h-7 flex items-center justify-center transition-colors hover:bg-hover"
          :title="$t('sidebar.expand')"
          @click="ui.setSidebarCollapsed(false)"
        >
          <ChevronDoubleRightIcon class="w-4 h-4" />
        </button>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <input
              v-if="isRenaming"
              ref="renameInput"
              v-model="renameDraft"
              class="h-8 min-w-0 max-w-[320px] rounded border border-[hsl(var(--border))] bg-background px-2 text-sm font-medium text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--ring))]"
              :aria-label="$t('workspace.rename')"
              @blur="commitRenameWorkspace"
              @keydown="onRenameKeydown"
            />
            <div
              v-else
              class="min-w-0 truncate text-sm font-medium text-[hsl(var(--foreground))]"
            >
              {{ workspace.currentWorkspace?.name || t('workspace.title') }}
            </div>
            <button
              v-if="!isRenaming"
              class="rounded w-8 h-8 flex flex-shrink-0 items-center justify-center transition-colors hover:bg-hover"
              :title="$t('workspace.rename')"
              @click="onRenameWorkspace"
            >
              <PencilSquareIcon class="w-4 h-4" />
            </button>
          </div>
        </div>
        <button
          class="inline-flex items-center gap-2 rounded border border-[hsl(var(--border))] px-3 py-1.5 text-sm hover:bg-[hsl(var(--selection))]"
          @click="onCapture"
        >
          <PhotoIcon class="h-4 w-4" />
          <span>{{ t('workspace.capture') }}</span>
        </button>
      </div>
    </div>

    <div ref="captureRoot" class="grid flex-1 min-h-0 grid-cols-2 gap-3 p-3">
      <WorkspacePane pane="left" />
      <WorkspacePane pane="right" />
    </div>

    <CaptureExportDialog
      v-model:open="exportDialogOpen"
      :source="exportSource"
    />
  </div>
</template>
