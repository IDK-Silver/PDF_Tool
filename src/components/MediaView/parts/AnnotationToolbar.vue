<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useAnnotationStore } from '@/modules/annotation/store'
import { selectAndPrepareImage } from '@/modules/annotation/tools'
import type { ToolType, StrokeStyle } from '@/modules/annotation/types'
import SignaturePicker, { type SignatureItem } from './SignaturePicker.vue'

const annotation = useAnnotationStore()

const activeTool = computed(() => annotation.activeTool)

// Color palette for quick selection
const colorPalette = [
  '#FF0000', // Red
  '#FF9500', // Orange
  '#FFCC00', // Yellow
  '#34C759', // Green
  '#007AFF', // Blue
  '#5856D6', // Purple
  '#FF2D55', // Pink
  '#000000', // Black
]

// Stroke width options
const strokeWidths = [1, 2, 4, 8]

// Stroke style options
const strokeStyles: { value: StrokeStyle; label: string; pattern: string }[] = [
  { value: 'solid', label: 'Solid', pattern: '' },
  { value: 'dashed', label: 'Dashed', pattern: '8 4' },
  { value: 'dotted', label: 'Dotted', pattern: '2 4' },
]

// Key bindings
const keyBindings: Record<string, ToolType> = {
  'v': 'select',
  'r': 'rect',
  'o': 'ellipse',
  'l': 'line',
  'a': 'arrow',
  't': 'text',
  'm': 'pixelate',
  'n': 'counter',
  'p': 'pen',
  'h': 'highlighter',
  'e': 'eraser',
  'i': 'image',
  's': 'signature',
}

// Show popovers
const showColorPicker = ref(false)
const showStrokePicker = ref(false)
const showCounterPicker = ref(false)
const showSignaturePicker = ref(false)

// Close popovers when clicking outside
function closePopovers() {
  showColorPicker.value = false
  showStrokePicker.value = false
  showCounterPicker.value = false
  showSignaturePicker.value = false
}

function isActive(tool: ToolType): boolean {
  return activeTool.value === tool
}

async function selectTool(tool: ToolType) {
  if (tool === 'image') {
    annotation.setActiveTool('image')
    await selectAndPrepareImage()
  } else if (tool === 'signature') {
    toggleSignaturePicker()
  } else {
    annotation.setActiveTool(tool)
  }
}

function toggleSignaturePicker() {
  closePopovers()
  showSignaturePicker.value = !showSignaturePicker.value
}

function handleSignatureSelect(sig: SignatureItem) {
  showSignaturePicker.value = false
  annotation.setActiveTool('signature')
  // Store signature data for placing
  annotation.updateToolSettings({ signatureDataUrl: sig.dataUrl })
}

function closeSignaturePicker() {
  showSignaturePicker.value = false
}

function closeToolbar() {
  annotation.setActiveTool(null)
  annotation.clearSelection()
  annotation.setPendingObject(null)
}

function setColor(color: string) {
  annotation.updateToolSettings({ color })
  showColorPicker.value = false
}

function toggleColorPicker() {
  showStrokePicker.value = false
  showColorPicker.value = !showColorPicker.value
}

function toggleStrokePicker() {
  showColorPicker.value = false
  showStrokePicker.value = !showStrokePicker.value
}

function setStrokeWidth(width: number) {
  annotation.updateToolSettings({ strokeWidth: width })
}

function setStrokeStyle(style: StrokeStyle) {
  annotation.updateToolSettings({ strokeStyle: style })
}

function toggleCounterPicker() {
  closePopovers()
  showCounterPicker.value = !showCounterPicker.value
}

function setCounterStart(start: number) {
  const value = Math.max(1, start)
  annotation.updateToolSettings({ counterStart: value })
  annotation.resetCounterSequence(value)
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false
  const el = target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

function handleKeyDown(e: KeyboardEvent) {
  // Skip if in text input or editing text annotation
  if (isInputElement(e.target)) return
  if (annotation.editingTextId) return

  const key = e.key.toLowerCase()

  // Tool shortcuts (only when toolbar is open)
  if (annotation.activeTool !== null && key in keyBindings) {
    e.preventDefault()
    selectTool(keyBindings[key])
    return
  }

  // Delete/Backspace to remove selected or pending objects
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (annotation.selectedIds.length > 0) {
      e.preventDefault()
      annotation.deleteSelected()
      return
    }
    if (annotation.pendingObject) {
      e.preventDefault()
      annotation.setPendingObject(null)
      return
    }
  }

  // Escape to exit annotation mode
  if (e.key === 'Escape' && annotation.activeTool) {
    e.preventDefault()
    closeToolbar()
  }

  // Undo/Redo
  if ((e.metaKey || e.ctrlKey) && key === 'z') {
    e.preventDefault()
    if (e.shiftKey) {
      annotation.redo()
    } else {
      annotation.undo()
    }
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
  <!-- Annotation toolbar (shown when activeTool is set) -->
  <div v-if="activeTool" class="annotation-toolbar flex items-center gap-0.5 px-2 py-1.5 bg-background/95 backdrop-blur rounded-lg border shadow-lg">
    <!-- Select Tool -->
    <button
      @click="selectTool('select')"
      :class="['tool-btn', { active: isActive('select') }]"
      title="Select (V)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        <path d="M13 13l6 6" />
      </svg>
    </button>

    <div class="divider"></div>

    <!-- Shape Tools -->
    <button
      @click="selectTool('rect')"
      :class="['tool-btn', { active: isActive('rect') }]"
      title="Rectangle (R)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    </button>

    <button
      @click="selectTool('ellipse')"
      :class="['tool-btn', { active: isActive('ellipse') }]"
      title="Ellipse (O)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
      </svg>
    </button>

    <button
      @click="selectTool('line')"
      :class="['tool-btn', { active: isActive('line') }]"
      title="Line (L)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <line x1="5" y1="19" x2="19" y2="5" />
      </svg>
    </button>

    <button
      @click="selectTool('arrow')"
      :class="['tool-btn', { active: isActive('arrow') }]"
      title="Arrow (A)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <line x1="5" y1="19" x2="19" y2="5" />
        <polyline points="10 5 19 5 19 14" />
      </svg>
    </button>

    <div class="divider"></div>

    <!-- Text Tool -->
    <button
      @click="selectTool('text')"
      :class="['tool-btn', { active: isActive('text') }]"
      title="Text (T)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M4 7V4h16v3" />
        <path d="M12 4v16" />
        <path d="M8 20h8" />
      </svg>
    </button>

    <div class="divider"></div>

    <!-- Effect Tools -->
    <button
      @click="selectTool('pixelate')"
      :class="['tool-btn', { active: isActive('pixelate') }]"
      title="Pixelate (M)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    </button>

    <button
      @click="selectTool('counter')"
      :class="['tool-btn', { active: isActive('counter') }]"
      title="Counter (N)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        <text x="12" y="16" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">1</text>
      </svg>
    </button>

    <div class="divider"></div>

    <!-- Drawing Tools -->
    <button
      @click="selectTool('pen')"
      :class="['tool-btn', { active: isActive('pen') }]"
      title="Pen (P)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
      </svg>
    </button>

    <button
      @click="selectTool('highlighter')"
      :class="['tool-btn', { active: isActive('highlighter') }]"
      title="Highlighter (H)"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24">
        <path d="M3 17l4-4 4 4-4 4-4-4z" fill="currentColor" opacity="0.3" stroke="none" />
        <path d="M7 13l10-10 4 4-10 10" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M11 17l6-6" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </button>

    <button
      @click="selectTool('eraser')"
      :class="['tool-btn', { active: isActive('eraser') }]"
      title="Eraser (E)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1l10-10c.6-.6 1.5-.6 2.1 0l7 7c.6.6.6 1.5 0 2.1L16 19" />
        <line x1="5.5" y1="13.5" x2="10.5" y2="18.5" />
      </svg>
    </button>

    <div class="divider"></div>

    <!-- Insert Tools -->
    <button
      @click="selectTool('image')"
      :class="['tool-btn', { active: isActive('image') }]"
      title="Insert Image (I)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </button>

    <div class="relative">
      <button
        @click="selectTool('signature')"
        :class="['tool-btn', { active: isActive('signature') || showSignaturePicker }]"
        title="Signature (S)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M3 17c1-1 2-3 4-3s2 2 4 2 2-2 4-2 3 2 4 3" />
          <path d="M3 21h18" />
        </svg>
      </button>

      <!-- Signature Picker Popover -->
      <SignaturePicker
        v-if="showSignaturePicker"
        @select="handleSignatureSelect"
        @close="closeSignaturePicker"
      />
    </div>

    <div class="divider"></div>

    <!-- Color Picker Button -->
    <div class="relative">
      <button
        @click="toggleColorPicker"
        class="color-dot-btn"
        :style="{ backgroundColor: annotation.toolSettings.color }"
        title="Color"
      ></button>

      <!-- Color Popover (dropdown) -->
      <div v-if="showColorPicker" class="dropdown-popover color-dropdown">
        <div class="flex flex-wrap gap-1 p-1.5">
          <button
            v-for="color in colorPalette"
            :key="color"
            @click="setColor(color)"
            class="color-swatch"
            :class="{ active: annotation.toolSettings.color === color }"
            :style="{ backgroundColor: color }"
          ></button>
        </div>
        <div class="px-1.5 pb-1.5 pt-1 border-t border-border">
          <input
            type="color"
            :value="annotation.toolSettings.color"
            @input="setColor(($event.target as HTMLInputElement).value)"
            class="w-full h-5 cursor-pointer rounded"
          />
        </div>
        <!-- Click outside to close -->
        <div class="popover-backdrop" @click="closePopovers"></div>
      </div>
    </div>

    <!-- Stroke Width Button with dropdown -->
    <div class="relative">
      <button
        @click="toggleStrokePicker"
        class="stroke-dropdown-btn"
        title="Stroke Width"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="12" x2="16" y2="12" :stroke-width="annotation.toolSettings.strokeWidth" />
        </svg>
        <svg class="w-3 h-3 ml-0.5 opacity-60" viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      <!-- Stroke Popover (dropdown) -->
      <div v-if="showStrokePicker" class="dropdown-popover stroke-dropdown">
        <div class="p-1.5 space-y-0.5">
          <button
            v-for="w in strokeWidths"
            :key="w"
            @click="setStrokeWidth(w); showStrokePicker = false"
            :class="['stroke-option', { active: annotation.toolSettings.strokeWidth === w }]"
          >
            <svg class="w-8 h-3" viewBox="0 0 32 12">
              <line x1="2" y1="6" x2="30" y2="6" stroke="currentColor" :stroke-width="w" stroke-linecap="round" />
            </svg>
            <span class="text-muted-foreground">{{ w }}</span>
          </button>
        </div>
        <div class="p-1.5 pt-1 border-t border-border space-y-0.5">
          <button
            v-for="style in strokeStyles"
            :key="style.value"
            @click="setStrokeStyle(style.value); showStrokePicker = false"
            :class="['stroke-option', { active: annotation.toolSettings.strokeStyle === style.value }]"
          >
            <svg class="w-8 h-3" viewBox="0 0 32 12">
              <line
                x1="2" y1="6" x2="30" y2="6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                :stroke-dasharray="style.pattern"
              />
            </svg>
          </button>
        </div>
        <!-- Click outside to close -->
        <div class="popover-backdrop" @click="closePopovers"></div>
      </div>
    </div>

    <!-- Phase 7: Text and Pixelate use unified size system (strokeWidth) -->

    <!-- Counter Settings (shown when counter tool is active) -->
    <template v-if="activeTool === 'counter'">
      <div class="divider"></div>
      <div class="relative">
        <button
          @click="toggleCounterPicker"
          class="tool-setting-btn"
          title="Start Number"
        >
          <span class="text-xs">#{{ annotation.nextCounterValue }}</span>
        </button>

        <div v-if="showCounterPicker" class="dropdown-popover setting-dropdown">
          <div class="p-2 space-y-2">
            <label class="text-xs text-muted-foreground block">Start Number</label>
            <input
              type="number"
              min="1"
              :value="annotation.toolSettings.counterStart"
              @change="setCounterStart(Number(($event.target as HTMLInputElement).value))"
              @keydown.stop
              class="w-full px-2 py-1 text-sm border rounded bg-background"
            />
          </div>
          <div class="popover-backdrop" @click="closePopovers"></div>
        </div>
      </div>
    </template>

  </div>
</template>

<style scoped>
.tool-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  transition: background-color 0.15s, color 0.15s;
  color: hsl(var(--foreground) / 0.7);
  flex-shrink: 0;
}

.tool-btn:hover {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.tool-btn.active {
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.tool-btn.active:hover {
  background-color: hsl(var(--primary) / 0.9);
}

.divider {
  width: 1px;
  height: 1.25rem;
  background-color: hsl(var(--border));
  margin: 0 0.25rem;
  flex-shrink: 0;
}

/* Color dot button */
.color-dot-btn {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: 2px solid hsl(var(--background));
  box-shadow: 0 0 0 1px hsl(var(--border));
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  flex-shrink: 0;
}

.color-dot-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 0 0 1px hsl(var(--border)), 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Stroke dropdown button */
.stroke-dropdown-btn {
  height: 2rem;
  padding: 0 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
  color: hsl(var(--foreground) / 0.7);
  flex-shrink: 0;
}

.stroke-dropdown-btn:hover {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
}

/* Dropdown popover */
.dropdown-popover {
  position: absolute;
  top: calc(100% + 0.375rem);
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.color-dropdown {
  right: 0;
  min-width: 120px;
}

.stroke-dropdown {
  right: 0;
  min-width: 100px;
}

/* Color swatch in popover */
.color-swatch {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 0.125rem;
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  transition: transform 0.1s;
}

.color-swatch:hover {
  transform: scale(1.1);
}

.color-swatch.active {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}

/* Stroke option in dropdown */
.stroke-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.25rem 0.375rem;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
  color: hsl(var(--foreground));
  font-size: 0.75rem;
}

.stroke-option:hover {
  background-color: hsl(var(--muted));
}

.stroke-option.active {
  background-color: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

/* Color input */
input[type="color"] {
  -webkit-appearance: none;
  appearance: none;
  border: none;
  padding: 0;
}

input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
}

input[type="color"]::-webkit-color-swatch {
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
}

/* Backdrop to close popover when clicking outside */
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
}

/* Tool setting button (for pixelate/counter) */
.tool-setting-btn {
  height: 2rem;
  padding: 0 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
  color: hsl(var(--foreground) / 0.7);
  background-color: hsl(var(--muted) / 0.5);
  flex-shrink: 0;
}

.tool-setting-btn:hover {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.setting-dropdown {
  right: 0;
  min-width: 120px;
}

</style>
