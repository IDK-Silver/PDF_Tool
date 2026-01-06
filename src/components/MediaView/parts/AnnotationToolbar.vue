<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAnnotationStore } from '@/modules/annotation/store'
import { selectAndPrepareImage } from '@/modules/annotation/tools'
import { useSystemFonts } from '@/modules/annotation/useSystemFonts'
import type { ToolType, StrokeStyle } from '@/modules/annotation/types'
import SignaturePicker, { type SignatureItem } from './SignaturePicker.vue'

const { t } = useI18n()
const annotation = useAnnotationStore()
const { cjkFonts, latinFonts, builtinFonts, loadFonts, loaded: fontsLoaded } = useSystemFonts()

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
const strokeStyles = computed(() => [
  { value: 'solid' as StrokeStyle, label: t('annotation.strokeStyle.solid'), pattern: '' },
  { value: 'dashed' as StrokeStyle, label: t('annotation.strokeStyle.dashed'), pattern: '6 4' },
  { value: 'dotted' as StrokeStyle, label: t('annotation.strokeStyle.dotted'), pattern: '2 6' },
])

// Current stroke style info
const currentStrokeStyle = computed(() => {
  const current = annotation.toolSettings.strokeStyle
  return strokeStyles.value.find((s) => s.value === current) || strokeStyles.value[0]
})

// Pattern for button icon (fixed, not scaled by stroke width)
const currentStrokePattern = computed(() => {
  const style = annotation.toolSettings.strokeStyle
  if (style === 'solid') return ''
  if (style === 'dashed') return '8 6'
  return '3 6' // dotted
})

// Key bindings
const keyBindings: Record<string, ToolType> = {
  'v': 'select',
  'r': 'rect',
  'o': 'ellipse',
  'l': 'line',
  'a': 'arrow',
  't': 'text',
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
const showFontPicker = ref(false)

// Close popovers when clicking outside
function closePopovers() {
  showColorPicker.value = false
  showStrokePicker.value = false
  showCounterPicker.value = false
  showSignaturePicker.value = false
  showFontPicker.value = false
}

// Close counter picker when a counter is placed
watch(() => annotation.nextCounterValue, () => {
  showCounterPicker.value = false
})

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

async function handleSignatureSelect(sig: SignatureItem) {
  showSignaturePicker.value = false
  annotation.setActiveTool('signature')

  // Get signature image dimensions
  const dimensions = await getImageDimensions(sig.dataUrl)

  // Calculate size in PDF points (maintain aspect ratio)
  const DEFAULT_SIGNATURE_WIDTH = 120
  let widthPt = DEFAULT_SIGNATURE_WIDTH
  let heightPt = DEFAULT_SIGNATURE_WIDTH
  if (dimensions.width && dimensions.height) {
    const aspect = dimensions.height / dimensions.width
    heightPt = widthPt * aspect
  }

  // Create pending object for placement
  annotation.setPendingObject({
    id: '',
    type: 'signature',
    pageIndex: -1,
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
    opacity: 1,
    imageData: sig.dataUrl,
  })
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
    }
    img.src = dataUrl
  })
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

function toggleFontPicker() {
  closePopovers()
  showFontPicker.value = !showFontPicker.value
  if (showFontPicker.value && !fontsLoaded.value) {
    loadFonts()
  }
}

function setFontFamily(family: string) {
  annotation.updateToolSettings({ fontFamily: family })
  showFontPicker.value = false
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
      :title="t('annotation.toolbar.select')"
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
      :title="t('annotation.toolbar.rectangle')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    </button>

    <button
      @click="selectTool('ellipse')"
      :class="['tool-btn', { active: isActive('ellipse') }]"
      :title="t('annotation.toolbar.ellipse')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
      </svg>
    </button>

    <button
      @click="selectTool('line')"
      :class="['tool-btn', { active: isActive('line') }]"
      :title="t('annotation.toolbar.line')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <line x1="5" y1="19" x2="19" y2="5" />
      </svg>
    </button>

    <button
      @click="selectTool('arrow')"
      :class="['tool-btn', { active: isActive('arrow') }]"
      :title="t('annotation.toolbar.arrow')"
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
      :title="t('annotation.toolbar.text')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M4 7V4h16v3" />
        <path d="M12 4v16" />
        <path d="M8 20h8" />
      </svg>
    </button>

    <div class="divider"></div>

    <!-- Counter Tool -->
    <button
      @click="selectTool('counter')"
      :class="['tool-btn', { active: isActive('counter') }]"
      :title="t('annotation.toolbar.counter')"
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
      :title="t('annotation.toolbar.pen')"
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
      :title="t('annotation.toolbar.highlighter')"
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
      :title="t('annotation.toolbar.eraser')"
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
      :title="t('annotation.toolbar.insertImage')"
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
        :title="t('annotation.toolbar.signature')"
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
        :title="t('annotation.toolbar.color')"
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
        :title="`${t('annotation.toolbar.strokeWidth')}: ${annotation.toolSettings.strokeWidth} | ${currentStrokeStyle.label}`"
      >
        <svg class="w-10 h-5" viewBox="0 0 40 20" fill="none" stroke="currentColor">
          <line
            x1="2"
            y1="10"
            x2="38"
            y2="10"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="currentStrokePattern"
          />
        </svg>
        <span class="text-xs opacity-70">{{ annotation.toolSettings.strokeWidth }}</span>
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
        <!-- Stroke style - only show for shape tools -->
        <div
          v-if="['rect', 'ellipse', 'line', 'arrow'].includes(activeTool || '')"
          class="p-1.5 pt-1 border-t border-border space-y-0.5"
        >
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

    <!-- Dynamic settings slot: Font (text) or Counter (counter) -->
    <div class="relative dynamic-slot">
      <!-- Placeholder to reserve space when neither text nor counter is active -->
      <button
        v-if="activeTool !== 'text' && activeTool !== 'counter'"
        class="tool-setting-btn invisible w-full"
        aria-hidden="true"
      >
        <span class="text-xs font-mono">#1</span>
      </button>

      <!-- Font Picker (text tool) -->
      <template v-else-if="activeTool === 'text'">
        <button
          @click="toggleFontPicker"
          class="font-dropdown-btn"
          :title="`${t('annotation.toolbar.font')}: ${annotation.toolSettings.fontFamily}`"
        >
          <span class="font-preview" :style="{ fontFamily: annotation.toolSettings.fontFamily }">Aa</span>
          <svg class="w-3 h-3 ml-0.5 opacity-60" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 5l3 3 3-3" />
          </svg>
        </button>

        <div v-if="showFontPicker" class="dropdown-popover font-dropdown">
          <!-- Current font indicator -->
          <div class="px-1.5 py-1 border-b border-border bg-muted/50">
            <div class="text-xs text-muted-foreground">{{ t('annotation.toolbar.font') }}</div>
            <div class="text-sm font-medium truncate" :style="{ fontFamily: annotation.toolSettings.fontFamily }">
              {{ annotation.toolSettings.fontFamily }}
            </div>
          </div>

          <!-- Built-in PDF fonts -->
          <div class="p-1.5 border-b border-border">
            <div class="text-xs text-muted-foreground mb-1">{{ t('annotation.fonts.builtin') }}</div>
            <button
              v-for="font in builtinFonts"
              :key="font.family"
              @click="setFontFamily(font.family)"
              :class="['font-option', { active: annotation.toolSettings.fontFamily === font.family }]"
              :style="{ fontFamily: font.family }"
            >
              {{ font.family }}
            </button>
          </div>

          <!-- CJK fonts -->
          <div v-if="cjkFonts.length > 0" class="p-1.5 border-b border-border">
            <div class="text-xs text-muted-foreground mb-1">{{ t('annotation.fonts.cjk') }}</div>
            <div class="max-h-32 overflow-y-auto">
              <button
                v-for="font in cjkFonts.slice(0, 20)"
                :key="font.family"
                @click="setFontFamily(font.family)"
                :class="['font-option', { active: annotation.toolSettings.fontFamily === font.family }]"
                :style="{ fontFamily: font.family }"
              >
                {{ font.family }}
              </button>
            </div>
          </div>

          <!-- Latin fonts -->
          <div v-if="latinFonts.length > 0" class="p-1.5">
            <div class="text-xs text-muted-foreground mb-1">{{ t('annotation.fonts.latin') }}</div>
            <div class="max-h-32 overflow-y-auto">
              <button
                v-for="font in latinFonts.slice(0, 20)"
                :key="font.family"
                @click="setFontFamily(font.family)"
                :class="['font-option', { active: annotation.toolSettings.fontFamily === font.family }]"
                :style="{ fontFamily: font.family }"
              >
                {{ font.family }}
              </button>
            </div>
          </div>

          <div class="popover-backdrop" @click="closePopovers"></div>
        </div>
      </template>

      <!-- Counter Picker (counter tool) -->
      <template v-else-if="activeTool === 'counter'">
        <button
          @click="toggleCounterPicker"
          class="tool-setting-btn"
          :title="t('annotation.toolbar.startNumber')"
        >
          <span class="text-xs font-mono">#{{ annotation.nextCounterValue }}</span>
        </button>

        <div v-if="showCounterPicker" class="dropdown-popover counter-dropdown">
          <div class="p-1.5 flex items-center gap-1.5">
            <label class="text-xs text-muted-foreground whitespace-nowrap">{{ t('annotation.toolbar.nextCounter') }}</label>
            <input
              type="number"
              min="1"
              :value="annotation.nextCounterValue"
              @change="setCounterStart(Number(($event.target as HTMLInputElement).value))"
              @keydown.stop
              class="w-12 px-1 py-0.5 text-sm border rounded bg-background text-center"
            />
          </div>
          <div class="popover-backdrop" @click="closePopovers"></div>
        </div>
      </template>
    </div>

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
  margin: 0 0.25rem;
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
  min-width: 5rem;
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

/* Tool setting button (for counter) */
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

.counter-dropdown {
  right: 0;
}

/* Font dropdown button */
.font-dropdown-btn {
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

.font-dropdown-btn:hover {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.font-preview {
  font-size: 0.875rem;
  font-weight: 500;
}

/* Font dropdown */
.font-dropdown {
  right: 0;
  min-width: 160px;
  max-width: 200px;
}

/* Font option in dropdown */
.font-option {
  width: 100%;
  display: block;
  text-align: left;
  padding: 0.25rem 0.375rem;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
  color: hsl(var(--foreground));
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-option:hover {
  background-color: hsl(var(--muted));
}

.font-option.active {
  background-color: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

/* Dynamic slot container - fixed width to prevent jumping */
.dynamic-slot {
  min-width: 3rem;
}

</style>
