<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch, type StyleValue } from 'vue'
import { drawWebGpuImage } from '@/modules/render/webgpuImageRenderer'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  src?: string
  imageData?: ImageData
  invert?: boolean
}>(), {
  src: undefined,
  imageData: undefined,
  invert: false,
})

const emit = defineEmits<{
  (e: 'ready', payload: { width: number; height: number }): void
  (e: 'error', message: string): void
}>()

const attrs = useAttrs()
const canvasEl = ref<HTMLCanvasElement | null>(null)
const sourceWidth = ref(0)
const sourceHeight = ref(0)
const renderError = ref<string | null>(null)

let activeSource: ImageBitmap | ImageData | HTMLImageElement | null = null
let activeBitmap: ImageBitmap | null = null
let loadToken = 0
let resizeObs: ResizeObserver | null = null
let renderRaf: number | null = null

function observeCanvas(el: HTMLCanvasElement | null) {
  try { resizeObs?.disconnect() } catch {}
  resizeObs = null
  if (el && 'ResizeObserver' in window) {
    resizeObs = new ResizeObserver(() => scheduleRender())
    resizeObs.observe(el)
  }
  scheduleRender()
}

const passthroughAttrs = computed(() => {
  const rest = { ...attrs }
  delete rest.class
  delete rest.style
  return rest
})

const canvasClass = computed(() => ['webgpu-image-canvas', attrs.class])
const mergedStyle = computed<StyleValue>(() => {
  const style: Record<string, string> = {
    background: 'hsl(var(--muted))',
  }
  if (sourceWidth.value > 0 && sourceHeight.value > 0) {
    style.aspectRatio = `${sourceWidth.value} / ${sourceHeight.value}`
  }
  return [style, attrs.style as StyleValue]
})

function releaseBitmap() {
  if (activeBitmap) {
    try { activeBitmap.close() } catch {}
    activeBitmap = null
  }
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image decode failed'))
    img.src = src
  })
}

async function loadUrlSource(src: string): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      const response = await fetch(src)
      if (!response.ok) throw new Error(`Image request failed: ${response.status}`)
      const blob = await response.blob()
      return await createImageBitmap(blob)
    } catch {
      const img = await loadImageElement(src)
      try {
        return await createImageBitmap(img)
      } catch {
        return img
      }
    }
  }
  return loadImageElement(src)
}

function currentSourceSize(source: ImageBitmap | ImageData | HTMLImageElement) {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth,
      height: source.naturalHeight,
    }
  }
  return {
    width: source.width,
    height: source.height,
  }
}

function isClosableImageBitmap(source: ImageBitmap | ImageData | HTMLImageElement): source is ImageBitmap {
  return !(source instanceof HTMLImageElement) &&
    !(source instanceof ImageData) &&
    typeof (source as ImageBitmap).close === 'function'
}

function scheduleRender() {
  if (renderRaf != null) return
  renderRaf = requestAnimationFrame(() => {
    renderRaf = null
    void renderActiveSource()
  })
}

async function renderActiveSource() {
  const canvas = canvasEl.value
  const source = activeSource
  if (!canvas || !source) return

  try {
    await drawWebGpuImage(canvas, source, { invert: props.invert })
    renderError.value = null
  } catch (e: any) {
    const message = e?.message || String(e)
    renderError.value = message
    emit('error', message)
    console.warn('[WebGpuImageCanvas] render failed', message)
  }
}

async function loadSource() {
  const token = ++loadToken
  renderError.value = null

  try {
    let nextSource: ImageBitmap | ImageData | HTMLImageElement | null = null
    let nextBitmap: ImageBitmap | null = null

    if (props.imageData) {
      nextSource = props.imageData
    } else if (props.src) {
      const loaded = await loadUrlSource(props.src)
      nextSource = loaded
      if (isClosableImageBitmap(loaded)) {
        nextBitmap = loaded
      }
    }

    if (token !== loadToken) {
      if (nextBitmap) {
        try { nextBitmap.close() } catch {}
      }
      return
    }

    releaseBitmap()
    activeSource = nextSource
    activeBitmap = nextBitmap

    if (!activeSource) return

    const size = currentSourceSize(activeSource)
    sourceWidth.value = size.width
    sourceHeight.value = size.height
    emit('ready', size)
    scheduleRender()
  } catch (e: any) {
    if (token !== loadToken) return
    const message = e?.message || String(e)
    renderError.value = message
    emit('error', message)
    console.warn('[WebGpuImageCanvas] load failed', message)
  }
}

watch([() => props.src, () => props.imageData], () => {
  void loadSource()
}, { immediate: true })

watch(() => props.invert, () => {
  scheduleRender()
})

onMounted(() => {
  observeCanvas(canvasEl.value)
})

watch(canvasEl, (el) => {
  observeCanvas(el)
})

onBeforeUnmount(() => {
  loadToken++
  if (renderRaf != null) {
    cancelAnimationFrame(renderRaf)
    renderRaf = null
  }
  try { resizeObs?.disconnect() } catch {}
  releaseBitmap()
  activeSource = null
})
</script>

<template>
  <canvas
    ref="canvasEl"
    v-bind="passthroughAttrs"
    :class="canvasClass"
    :style="mergedStyle"
  />
  <div
    v-if="renderError"
    class="webgpu-image-error"
    role="alert"
  >
    <span>WebGPU render failed</span>
  </div>
</template>

<style scoped>
.webgpu-image-canvas {
  background: hsl(var(--muted));
}

.webgpu-image-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  color: hsl(var(--destructive));
  font-size: 12px;
  text-align: center;
  background:
    repeating-linear-gradient(
      -45deg,
      hsl(var(--muted)) 0,
      hsl(var(--muted)) 10px,
      hsl(var(--destructive) / 0.15) 10px,
      hsl(var(--destructive) / 0.15) 20px
    );
}
</style>
