<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { VueDraggable } from 'vue-draggable-plus'
import { DocumentTextIcon, PhotoIcon } from '@heroicons/vue/24/outline'
import { imageRead } from '@/modules/media/service'
import type { WorkspaceFileEntry } from '@/modules/workspace/types'

const props = defineProps<{
  items: WorkspaceFileEntry[]
  selectedPath: string | null
  draggable?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', path: string): void
  (e: 'reorder', items: WorkspaceFileEntry[]): void
}>()

const { t } = useI18n()

const containerRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)

// Blob URL cache for paths whose asset:// URL fails to load (e.g. outside the
// configured assetProtocol scope). Keyed by absolute file path.
const blobUrls = reactive<Record<string, string>>({})
const blobInflight = new Set<string>()

async function loadBlobFallback(path: string) {
  if (blobUrls[path] || blobInflight.has(path)) return
  blobInflight.add(path)
  try {
    const result = await imageRead(path)
    const bytes = new Uint8Array(result.imageBytes)
    const blob = new Blob([bytes], { type: result.mimeType })
    blobUrls[path] = URL.createObjectURL(blob)
  } catch (err) {
    console.warn('[filmstrip] blob fallback failed for', path, err)
  } finally {
    blobInflight.delete(path)
  }
}

function onImgError(item: WorkspaceFileEntry) {
  if (item.type !== 'image') return
  void loadBlobFallback(item.path)
}

// VueDraggable mutates the bound array in place. We forward those mutations to
// the parent through reorder so the store is the single source of truth.
const dragModel = computed({
  get: () => props.items,
  set: (val: WorkspaceFileEntry[]) => {
    const arr = props.items as WorkspaceFileEntry[]
    arr.splice(0, arr.length, ...val)
  },
})

function thumbnailSrc(item: WorkspaceFileEntry): string | null {
  if (item.type !== 'image') return null
  const cached = blobUrls[item.path]
  if (cached) return cached
  if (!isTauri()) return null
  return convertFileSrc(item.path)
}

function onSelect(item: WorkspaceFileEntry) {
  emit('select', item.path)
}

let styleInjected = false
function ensureHideFallback() {
  if (styleInjected) return
  styleInjected = true
  const s = document.createElement('style')
  s.textContent = '.filmstrip-fallback { opacity: 0 !important; pointer-events: none !important; }'
  document.head.appendChild(s)
}

function onDragStart() {
  isDragging.value = true
  ensureHideFallback()
}

function onDragEnd() {
  isDragging.value = false
  emit('reorder', props.items.slice())
}

async function scrollSelectedIntoView(smooth = true) {
  await nextTick()
  const root = containerRef.value
  if (!root) return
  const target = root.querySelector('[data-filmstrip-selected="true"]') as HTMLElement | null
  if (!target) return
  // Centre the selected item; the browser clamps to scroll bounds, so items
  // near the two ends naturally stop at the edge instead of overshooting.
  const targetLeft = target.offsetLeft - (root.clientWidth - target.offsetWidth) / 2
  const maxLeft = root.scrollWidth - root.clientWidth
  const left = Math.max(0, Math.min(maxLeft, targetLeft))
  root.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' })
}

watch(() => props.selectedPath, () => {
  void scrollSelectedIntoView()
})

onMounted(() => {
  void scrollSelectedIntoView(false)
})

// Drop blob URLs for paths that are no longer in the items list, so removed
// files do not retain memory.
watch(() => props.items.map(i => i.path), (paths) => {
  const known = new Set(paths)
  for (const path of Object.keys(blobUrls)) {
    if (!known.has(path)) {
      try { URL.revokeObjectURL(blobUrls[path]) } catch {}
      delete blobUrls[path]
    }
  }
})

onBeforeUnmount(() => {
  for (const url of Object.values(blobUrls)) {
    try { URL.revokeObjectURL(url) } catch {}
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="filmstrip-scroll h-full w-full overflow-x-auto overflow-y-hidden"
  >
    <VueDraggable
      v-if="items.length > 0"
      v-model="dragModel"
      tag="div"
      :disabled="!draggable"
      :animation="150"
      :force-fallback="true"
      :fallback-tolerance="4"
      ghost-class="filmstrip-drag-ghost"
      class="flex h-full items-stretch gap-2 px-2 py-2"
      :class="[
        draggable ? 'drag-enabled' : '',
        isDragging ? 'is-dragging' : '',
      ]"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <div
        v-for="item in items"
        :key="item.path"
        :data-filmstrip-selected="item.path === selectedPath ? 'true' : 'false'"
        :class="[
          'group relative flex h-full w-[110px] flex-shrink-0 cursor-pointer flex-col rounded-md border p-1 transition-colors',
          item.path === selectedPath
            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--selection))] shadow-sm'
            : 'border-transparent bg-[hsl(var(--muted))]/30 hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]',
        ]"
        :title="item.name"
        @click="onSelect(item)"
      >
        <div
          class="relative flex flex-1 min-h-0 items-center justify-center overflow-hidden rounded-sm bg-black/5"
        >
          <img
            v-if="thumbnailSrc(item)"
            :src="thumbnailSrc(item) || ''"
            :alt="item.name"
            class="max-h-full max-w-full object-contain"
            loading="lazy"
            draggable="false"
            @error="onImgError(item)"
          />
          <PhotoIcon
            v-else-if="item.type === 'image'"
            class="h-8 w-8 text-[hsl(var(--muted-foreground))]"
          />
          <DocumentTextIcon
            v-else
            class="h-8 w-8 text-[hsl(var(--muted-foreground))]"
          />
          <div
            v-if="item.path === selectedPath"
            class="pointer-events-none absolute inset-0 ring-2 ring-inset ring-[hsl(var(--primary))]"
          />
        </div>
        <div
          class="mt-1 line-clamp-2 break-all text-[10px] leading-tight"
          :class="item.path === selectedPath
            ? 'text-[hsl(var(--foreground))] font-medium'
            : 'text-[hsl(var(--muted-foreground))]'"
        >
          {{ item.name }}
        </div>
      </div>
    </VueDraggable>
    <div
      v-else
      class="flex h-full items-center justify-center text-xs text-[hsl(var(--muted-foreground))]"
    >
      {{ t('fileList.noFiles') }}
    </div>
  </div>
</template>

<style scoped>
.filmstrip-scroll {
  scrollbar-width: thin;
}
.filmstrip-scroll::-webkit-scrollbar {
  height: 6px;
}
.filmstrip-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.4);
  border-radius: 3px;
}
:deep(.filmstrip-drag-ghost) {
  opacity: 0.3;
}
:deep(.is-dragging > div) {
  pointer-events: none;
}
:deep(.drag-enabled > div) {
  cursor: grab;
}
:deep(.drag-enabled > div:active) {
  cursor: grabbing;
}
</style>
