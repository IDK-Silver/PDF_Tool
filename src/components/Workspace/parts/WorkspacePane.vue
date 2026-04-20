<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, unref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon, ArrowRightCircleIcon, ArrowsPointingOutIcon } from '@heroicons/vue/24/outline'
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog'
import WorkspaceFilmstrip from './WorkspaceFilmstrip.vue'
import PdfViewport from '@/components/MediaView/parts/PdfViewport.vue'
import ImageViewport from '@/components/MediaView/parts/ImageViewport.vue'
import { useWorkspaceStore } from '@/modules/workspace/store'
import type { WorkspaceFileEntry, WorkspacePaneKey } from '@/modules/workspace/types'
import { useUiStore } from '@/modules/ui/store'

const props = defineProps<{
  pane: WorkspacePaneKey
}>()

const { t } = useI18n()
const workspace = useWorkspaceStore()
const ui = useUiStore()

const paneState = computed(() => workspace.getPaneState(props.pane))
const session = computed(() => workspace.getPaneSession(props.pane))
const items = computed(() => workspace.getPaneItems(props.pane))
const isActive = computed(() => workspace.currentWorkspace?.activePane === props.pane)

type MaybeRef<T> = T | Ref<T>

type ViewportExpose = {
  viewMode: MaybeRef<'fit' | 'actual'>
  setFitMode: () => void | Promise<void>
}

const pdfViewportRef = ref<ViewportExpose | null>(null)
const imageViewportRef = ref<ViewportExpose | null>(null)

const activeControls = computed<ViewportExpose | null>(() => {
  if (session.value.descriptor?.type === 'pdf') return pdfViewportRef.value
  if (session.value.descriptor?.type === 'image') return imageViewportRef.value
  return null
})

const canMoveToOther = computed(() => {
  const source = paneState.value
  const target = workspace.getPaneState(props.pane === 'left' ? 'right' : 'left')
  return !!source?.selectedPath && !!target?.folderPath && target.folderPath !== source.folderPath
})

const selectedPath = computed(() => paneState.value?.selectedPath ?? null)

const menu = ref<{ open: boolean; x: number; y: number }>({
  open: false,
  x: 0,
  y: 0,
})

function setActive() {
  workspace.setActivePane(props.pane)
}

function onSelectPath(path: string) {
  setActive()
  void workspace.selectPaneItem(props.pane, path)
}

function onReorder(nextItems: WorkspaceFileEntry[]) {
  workspace.reorderPaneItems(props.pane, nextItems)
}

function closeMenu() {
  menu.value.open = false
}

function onContextMenu(payload: { x: number; y: number }) {
  setActive()
  menu.value = {
    open: true,
    x: payload.x,
    y: payload.y,
  }
}

function onSetFitMode() {
  activeControls.value?.setFitMode()
}

async function reapplyFitIfNeeded() {
  const controls = activeControls.value
  if (!controls) return
  if (unref(controls.viewMode) !== 'fit') return

  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await controls.setFitMode()
}

async function onMoveToOther() {
  closeMenu()
  const result = await workspace.moveSelectedFile(props.pane)
  if (result !== 'needs_overwrite') return

  const ok = await confirmDialog(t('workspace.moveOverwriteConfirm'), {
    title: t('workspace.moveToOther'),
    okLabel: t('common.confirm'),
    cancelLabel: t('common.cancel'),
  })
  if (!ok) return
  await workspace.moveSelectedFile(props.pane, true)
}

async function onDeleteFile() {
  closeMenu()
  await workspace.deleteSelectedFile(props.pane)
}

function onOpenFolder() {
  void workspace.pickFolder(props.pane)
}

function onGlobalClick(event: MouseEvent) {
  if (!menu.value.open) return
  const target = event.target as HTMLElement | null
  if (!target?.closest('[data-workspace-context-menu]')) {
    closeMenu()
  }
}

function onEsc(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenu()
  }
}

onMounted(() => {
  window.addEventListener('click', onGlobalClick, { capture: true })
  window.addEventListener('keydown', onEsc)
})

watch(() => ui.sidebarCollapsed, () => {
  void reapplyFitIfNeeded()
})

onBeforeUnmount(() => {
  window.removeEventListener('click', onGlobalClick, { capture: true })
  window.removeEventListener('keydown', onEsc)
})
</script>

<template>
  <section
    class="flex min-h-0 flex-col overflow-hidden rounded-lg border-[3px] bg-background transition-colors"
    :class="isActive
      ? 'border-[hsl(var(--primary))] shadow-lg'
      : 'border-[hsl(var(--border))]'"
    :data-workspace-pane="props.pane"
    @mousedown="setActive"
  >
    <div class="flex min-h-0 flex-1 flex-col" :data-workspace-capture="props.pane">
      <header class="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
        <div
          class="min-w-0 flex-1 cursor-pointer truncate text-sm font-medium text-[hsl(var(--foreground))]"
          :title="t('workspace.empty')"
          @dblclick="onOpenFolder"
        >
          {{ paneState?.folderName || t('workspace.empty') }}
        </div>
        <button
          class="flex h-8 w-8 items-center justify-center rounded transition-colors"
          :disabled="!session.descriptor"
          :class="!session.descriptor ? 'opacity-40 cursor-not-allowed' : 'hover:bg-hover'"
          :title="t('toolbar.fitWidth')"
          @click="onSetFitMode"
        >
          <ArrowsPointingOutIcon class="h-4 w-4" />
        </button>
        <button
          class="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-hover"
          :title="t('workspace.prev')"
          @click="workspace.navigatePaneByOffset(props.pane, -1)"
        >
          <ChevronLeftIcon class="h-4 w-4" />
        </button>
        <button
          class="flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-hover"
          :title="t('workspace.next')"
          @click="workspace.navigatePaneByOffset(props.pane, 1)"
        >
          <ChevronRightIcon class="h-4 w-4" />
        </button>
      </header>

      <div class="relative min-h-0 flex-1 overflow-hidden isolate">
        <div class="absolute inset-0 flex min-h-0 overflow-hidden">
          <PdfViewport
            ref="pdfViewportRef"
            v-if="session.descriptor?.type === 'pdf'"
            :media="session"
            :annotations-enabled="false"
            context-menu-mode="custom"
            scrollbar-mode="hidden"
            fit-strategy="contain"
            layout-density="compact"
            @context-menu="onContextMenu"
          />
          <ImageViewport
            ref="imageViewportRef"
            v-else-if="session.descriptor?.type === 'image'"
            :media="session"
            :annotations-enabled="false"
            context-menu-mode="custom"
            scrollbar-mode="hidden"
            fit-strategy="contain"
            layout-density="compact"
            @context-menu="onContextMenu"
          />
          <div
            v-else
            class="flex h-full w-full flex-1 cursor-pointer items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]"
            @dblclick="onOpenFolder"
          >
            {{ paneState?.folderPath ? t('workspace.emptyFolder') : t('workspace.empty') }}
          </div>
          <div
            v-if="session.loading"
            class="absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-[hsl(var(--muted-foreground))]"
          >
            {{ t('common.loading') }}
          </div>
        </div>
      </div>
    </div>

    <div class="relative z-10 flex h-[136px] min-h-0 flex-col border-t border-[hsl(var(--border))] bg-background">
      <div class="flex items-center gap-2 px-3 pt-1 text-xs text-[hsl(var(--muted-foreground))]">
        <span>{{ t('workspace.files') }} ({{ items.length }})</span>
      </div>
      <div class="flex-1 min-h-0">
        <WorkspaceFilmstrip
          :items="items"
          :selected-path="selectedPath"
          :draggable="true"
          @select="onSelectPath"
          @reorder="onReorder"
        />
      </div>
    </div>

    <teleport to="body">
      <div
        v-if="menu.open"
        data-workspace-context-menu
        class="fixed z-[2100] min-w-[180px] rounded border border-[hsl(var(--border))] bg-background py-1 shadow-lg"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      >
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--selection))]"
          :disabled="!canMoveToOther"
          :class="!canMoveToOther ? 'opacity-40 cursor-not-allowed' : ''"
          @click="onMoveToOther"
        >
          <ArrowRightCircleIcon class="h-4 w-4" />
          <span>{{ t('workspace.moveToOther') }}</span>
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--selection))]"
          :disabled="!paneState?.selectedPath"
          :class="!paneState?.selectedPath ? 'opacity-40 cursor-not-allowed' : ''"
          @click="onDeleteFile"
        >
          <TrashIcon class="h-4 w-4" />
          <span>{{ t('workspace.trashFile') }}</span>
        </button>
      </div>
    </teleport>
  </section>
</template>
