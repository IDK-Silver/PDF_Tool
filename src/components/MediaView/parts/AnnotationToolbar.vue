<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useAnnotationStore } from '@/modules/annotation/store'
import { selectAndPrepareImage, handleSelectToolKeyboard } from '@/modules/annotation/tools'
import type { ToolType } from '@/modules/annotation/types'

// Icons (using simple SVG paths for now)
const icons = {
  select: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z',
  image: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  rect: 'M3 3h18v18H3V3z',
  ellipse: 'M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z',
  line: 'M3 21L21 3',
}

const annotation = useAnnotationStore()

const activeTool = computed(() => annotation.activeTool)

function isActive(tool: ToolType): boolean {
  return activeTool.value === tool
}

async function selectTool(tool: ToolType) {
  if (tool === 'image') {
    annotation.setActiveTool('image')
    await selectAndPrepareImage()
  } else {
    annotation.setActiveTool(tool)
  }
}

function handleKeyDown(e: KeyboardEvent) {
  // Skip if in text input
  const target = e.target as HTMLElement | null
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return

  // Handle select tool keyboard events
  if (handleSelectToolKeyboard(e)) return

  // Escape to exit annotation mode
  if (e.key === 'Escape' && annotation.activeTool) {
    e.preventDefault()
    annotation.setActiveTool(null)
    annotation.clearSelection()
    annotation.setPendingObject(null)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <!-- Collapsed state: single button to open toolbar -->
  <button
    v-if="!activeTool"
    @click="selectTool('select')"
    class="tool-btn-main px-3 py-1.5 bg-background/80 backdrop-blur rounded-lg border shadow-sm flex items-center gap-2 hover:bg-muted"
    title="Open Annotation Tools"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
    <span class="text-sm">Annotate</span>
  </button>

  <!-- Expanded state: full toolbar -->
  <div v-else class="annotation-toolbar flex items-center gap-1 px-2 py-1 bg-background/80 backdrop-blur rounded-lg border shadow-sm">
    <!-- Select Tool -->
    <button
      @click="selectTool('select')"
      :class="['tool-btn', { active: isActive('select') }]"
      title="Select (V)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path :d="icons.select" />
      </svg>
    </button>

    <div class="w-px h-5 bg-border mx-1"></div>

    <!-- Image Tool -->
    <button
      @click="selectTool('image')"
      :class="['tool-btn', { active: isActive('image') }]"
      title="Insert Image"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path :d="icons.image" />
      </svg>
    </button>

    <div class="w-px h-5 bg-border mx-1"></div>

    <!-- Rectangle Tool -->
    <button
      @click="selectTool('rect')"
      :class="['tool-btn', { active: isActive('rect') }]"
      title="Rectangle"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    </button>

    <!-- Ellipse Tool -->
    <button
      @click="selectTool('ellipse')"
      :class="['tool-btn', { active: isActive('ellipse') }]"
      title="Ellipse"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <ellipse cx="12" cy="12" rx="9" ry="9" />
      </svg>
    </button>

    <!-- Line Tool -->
    <button
      @click="selectTool('line')"
      :class="['tool-btn', { active: isActive('line') }]"
      title="Line"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <line x1="3" y1="21" x2="21" y2="3" />
      </svg>
    </button>

    <div class="w-px h-5 bg-border mx-1"></div>

    <!-- Tool Settings (when a tool is active) -->
    <template v-if="activeTool && activeTool !== 'select' && activeTool !== 'image'">
      <!-- Fill Color -->
      <label class="flex items-center gap-1 text-xs" title="Fill Color">
        <input
          type="color"
          :value="annotation.toolSettings.fill"
          @input="annotation.updateToolSettings({ fill: ($event.target as HTMLInputElement).value })"
          class="w-6 h-6 rounded cursor-pointer border-0 p-0"
        />
      </label>

      <!-- Stroke Color -->
      <label class="flex items-center gap-1 text-xs" title="Stroke Color">
        <input
          type="color"
          :value="annotation.toolSettings.stroke"
          @input="annotation.updateToolSettings({ stroke: ($event.target as HTMLInputElement).value })"
          class="w-6 h-6 rounded cursor-pointer border-0 p-0"
        />
      </label>

      <!-- Stroke Width -->
      <label class="flex items-center gap-1 text-xs" title="Stroke Width">
        <input
          type="range"
          min="1"
          max="10"
          :value="annotation.toolSettings.strokeWidth"
          @input="annotation.updateToolSettings({ strokeWidth: Number(($event.target as HTMLInputElement).value) })"
          class="w-16 h-4"
        />
        <span class="w-4 text-center">{{ annotation.toolSettings.strokeWidth }}</span>
      </label>
    </template>

    <!-- Close button -->
    <button
      v-if="activeTool"
      @click="annotation.setActiveTool(null); annotation.clearSelection(); annotation.setPendingObject(null)"
      class="tool-btn ml-1"
      title="Exit Annotation Mode (Esc)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.tool-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  transition: background-color 0.15s, color 0.15s;
  color: hsl(var(--foreground) / 0.7);
}

.tool-btn:hover {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.tool-btn.active {
  background-color: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

input[type="color"] {
  -webkit-appearance: none;
  appearance: none;
}

input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
}

input[type="color"]::-webkit-color-swatch {
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
}
</style>
