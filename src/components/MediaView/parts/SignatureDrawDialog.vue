<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const emit = defineEmits<{
  (e: 'save', dataUrl: string): void
  (e: 'close'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const hasDrawn = ref(false)

// Drawing settings
const strokeColor = ref('#000000')
const strokeWidth = ref(2)

const colorOptions = ['#000000', '#1a1a1a', '#0066cc', '#cc0000']
const widthOptions = [1, 2, 4]

let ctx: CanvasRenderingContext2D | null = null
let lastX = 0
let lastY = 0

onMounted(() => {
  if (!canvasRef.value) return
  ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  // Set canvas size
  const rect = canvasRef.value.getBoundingClientRect()
  canvasRef.value.width = rect.width * 2
  canvasRef.value.height = rect.height * 2
  ctx.scale(2, 2)

  // Initial settings
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = strokeColor.value
  ctx.lineWidth = strokeWidth.value

  // Add event listeners
  canvasRef.value.addEventListener('mousedown', startDrawing)
  canvasRef.value.addEventListener('mousemove', draw)
  canvasRef.value.addEventListener('mouseup', stopDrawing)
  canvasRef.value.addEventListener('mouseleave', stopDrawing)

  // Touch support
  canvasRef.value.addEventListener('touchstart', handleTouchStart)
  canvasRef.value.addEventListener('touchmove', handleTouchMove)
  canvasRef.value.addEventListener('touchend', stopDrawing)
})

onBeforeUnmount(() => {
  if (!canvasRef.value) return
  canvasRef.value.removeEventListener('mousedown', startDrawing)
  canvasRef.value.removeEventListener('mousemove', draw)
  canvasRef.value.removeEventListener('mouseup', stopDrawing)
  canvasRef.value.removeEventListener('mouseleave', stopDrawing)
  canvasRef.value.removeEventListener('touchstart', handleTouchStart)
  canvasRef.value.removeEventListener('touchmove', handleTouchMove)
  canvasRef.value.removeEventListener('touchend', stopDrawing)
})

function getCanvasCoords(e: MouseEvent | Touch): { x: number; y: number } {
  if (!canvasRef.value) return { x: 0, y: 0 }
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

function startDrawing(e: MouseEvent) {
  isDrawing.value = true
  const coords = getCanvasCoords(e)
  lastX = coords.x
  lastY = coords.y
}

function draw(e: MouseEvent) {
  if (!isDrawing.value || !ctx) return

  const coords = getCanvasCoords(e)

  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(coords.x, coords.y)
  ctx.stroke()

  lastX = coords.x
  lastY = coords.y
  hasDrawn.value = true
}

function stopDrawing() {
  isDrawing.value = false
}

function handleTouchStart(e: TouchEvent) {
  e.preventDefault()
  if (e.touches.length !== 1) return
  isDrawing.value = true
  const coords = getCanvasCoords(e.touches[0])
  lastX = coords.x
  lastY = coords.y
}

function handleTouchMove(e: TouchEvent) {
  e.preventDefault()
  if (!isDrawing.value || !ctx || e.touches.length !== 1) return

  const coords = getCanvasCoords(e.touches[0])

  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(coords.x, coords.y)
  ctx.stroke()

  lastX = coords.x
  lastY = coords.y
  hasDrawn.value = true
}

function setColor(color: string) {
  strokeColor.value = color
  if (ctx) {
    ctx.strokeStyle = color
  }
}

function setWidth(width: number) {
  strokeWidth.value = width
  if (ctx) {
    ctx.lineWidth = width
  }
}

function clearCanvas() {
  if (!ctx || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  ctx.clearRect(0, 0, rect.width, rect.height)
  hasDrawn.value = false
}

function handleSave() {
  if (!canvasRef.value || !hasDrawn.value) return

  // Create a trimmed version of the signature
  const dataUrl = trimCanvas(canvasRef.value)
  emit('save', dataUrl)
}

function trimCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')

  const width = canvas.width
  const height = canvas.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0

  // Find bounds of non-transparent pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha > 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  // Add padding
  const padding = 20
  minX = Math.max(0, minX - padding)
  minY = Math.max(0, minY - padding)
  maxX = Math.min(width, maxX + padding)
  maxY = Math.min(height, maxY + padding)

  // Create trimmed canvas
  const trimmedWidth = maxX - minX
  const trimmedHeight = maxY - minY

  if (trimmedWidth <= 0 || trimmedHeight <= 0) {
    return canvas.toDataURL('image/png')
  }

  const trimmedCanvas = document.createElement('canvas')
  trimmedCanvas.width = trimmedWidth
  trimmedCanvas.height = trimmedHeight
  const trimmedCtx = trimmedCanvas.getContext('2d')

  if (trimmedCtx) {
    trimmedCtx.drawImage(
      canvas,
      minX, minY, trimmedWidth, trimmedHeight,
      0, 0, trimmedWidth, trimmedHeight
    )
  }

  return trimmedCanvas.toDataURL('image/png')
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="dialog-overlay" @click="handleBackdropClick">
      <div class="dialog-content">
      <!-- Header -->
      <div class="dialog-header">
        <span class="dialog-title">New Signature</span>
        <button class="close-btn" @click="emit('close')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Canvas area -->
      <div class="canvas-container">
        <canvas ref="canvasRef" class="signature-canvas"></canvas>
        <div v-if="!hasDrawn" class="canvas-hint">
          Draw your signature here
        </div>
      </div>

      <!-- Settings -->
      <div class="settings-row">
        <!-- Stroke width -->
        <div class="setting-group">
          <span class="setting-label">Width</span>
          <div class="width-options">
            <button
              v-for="w in widthOptions"
              :key="w"
              :class="['width-btn', { active: strokeWidth === w }]"
              @click="setWidth(w)"
            >
              <svg class="w-6 h-3" viewBox="0 0 24 12">
                <line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" :stroke-width="w" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Color -->
        <div class="setting-group">
          <span class="setting-label">Color</span>
          <div class="color-options">
            <button
              v-for="color in colorOptions"
              :key="color"
              :class="['color-btn', { active: strokeColor === color }]"
              :style="{ backgroundColor: color }"
              @click="setColor(color)"
            ></button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="dialog-actions">
        <button class="action-btn secondary" @click="clearCanvas">
          Clear
        </button>
        <div class="action-spacer"></div>
        <button class="action-btn secondary" @click="emit('close')">
          Cancel
        </button>
        <button
          class="action-btn primary"
          :disabled="!hasDrawn"
          @click="handleSave"
        >
          Save
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 2rem;
}

.dialog-content {
  background: hsl(var(--background));
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 420px;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid hsl(var(--border));
}

.dialog-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.close-btn {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  color: hsl(var(--muted-foreground));
  transition: background-color 0.15s, color 0.15s;
}

.close-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.canvas-container {
  position: relative;
  margin: 1rem;
  border: 2px dashed hsl(var(--border));
  border-radius: 0.5rem;
  background: white;
  overflow: hidden;
}

.signature-canvas {
  width: 100%;
  height: 150px;
  display: block;
  cursor: crosshair;
  touch-action: none;
}

.canvas-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
  pointer-events: none;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0 1rem 1rem;
}

.setting-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.setting-label {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
}

.width-options {
  display: flex;
  gap: 0.25rem;
}

.width-btn {
  padding: 0.25rem 0.375rem;
  border-radius: 0.25rem;
  color: hsl(var(--foreground) / 0.6);
  transition: background-color 0.15s, color 0.15s;
}

.width-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.width-btn.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.color-options {
  display: flex;
  gap: 0.375rem;
}

.color-btn {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: transform 0.15s, border-color 0.15s;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: hsl(var(--primary));
}

.dialog-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.3);
}

.action-spacer {
  flex: 1;
}

.action-btn {
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 0.375rem;
  transition: background-color 0.15s, opacity 0.15s;
}

.action-btn.secondary {
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
}

.action-btn.secondary:hover {
  background: hsl(var(--muted));
}

.action-btn.primary {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
}

.action-btn.primary:hover:not(:disabled) {
  background: hsl(var(--primary) / 0.9);
}

.action-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
