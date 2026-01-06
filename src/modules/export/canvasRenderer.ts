/**
 * Canvas renderer for annotations.
 * Used for exporting annotations to images and PDF overlay layers.
 */

import type { AnnotationObject, StrokeStyle } from '@/modules/annotation/types'

export interface RenderContext {
  pageWidthPt: number
  pageHeightPt: number
  scale: number  // displayWidth / pageWidthPt
}

const strokeDashArrays: Record<StrokeStyle, number[]> = {
  solid: [],
  dashed: [8, 4],
  dotted: [2, 4],
}

/**
 * Convert PDF coordinates to Canvas coordinates.
 * PDF origin is bottom-left with Y pointing up.
 * Canvas origin is top-left with Y pointing down.
 */
function pdfToCanvas(
  pdfX: number,
  pdfY: number,
  pageHeightPt: number,
  scale: number
): { x: number; y: number } {
  return {
    x: pdfX * scale,
    y: (pageHeightPt - pdfY) * scale,
  }
}

/**
 * Render all annotations to a canvas.
 * The canvas should already be sized appropriately.
 */
export function renderAnnotationsToCanvas(
  ctx: CanvasRenderingContext2D,
  annotations: AnnotationObject[],
  renderCtx: RenderContext
): void {
  const { pageHeightPt, scale } = renderCtx

  for (const obj of annotations) {
    ctx.save()
    ctx.globalAlpha = obj.opacity ?? 1

    switch (obj.type) {
      case 'rect':
        renderRect(ctx, obj, pageHeightPt, scale)
        break
      case 'ellipse':
        renderEllipse(ctx, obj, pageHeightPt, scale)
        break
      case 'line':
        renderLine(ctx, obj, pageHeightPt, scale)
        break
      case 'arrow':
        renderArrow(ctx, obj, pageHeightPt, scale)
        break
      case 'path':
        renderPath(ctx, obj, pageHeightPt, scale)
        break
      case 'text':
        renderText(ctx, obj, pageHeightPt, scale)
        break
      case 'counter':
        renderCounter(ctx, obj, pageHeightPt, scale)
        break
      case 'image':
      case 'signature':
        renderImage(ctx, obj, pageHeightPt, scale)
        break
    }

    ctx.restore()
  }
}

function setStrokeStyle(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  scale: number
): void {
  ctx.strokeStyle = obj.stroke || '#000000'
  ctx.lineWidth = (obj.strokeWidth || 2) * scale
  ctx.setLineDash(strokeDashArrays[obj.strokeStyle || 'solid'].map(v => v * scale))
}

function renderRect(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  const pos = pdfToCanvas(obj.x, obj.y, pageHeightPt, scale)
  const width = obj.width * scale
  const height = obj.height * scale

  // pos.y is already the top-left corner in canvas coordinates
  if (obj.fill && obj.fill !== 'none') {
    ctx.fillStyle = obj.fill
    ctx.fillRect(pos.x, pos.y, width, height)
  }

  if (obj.stroke) {
    setStrokeStyle(ctx, obj, scale)
    ctx.strokeRect(pos.x, pos.y, width, height)
  }
}

function renderEllipse(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  const pos = pdfToCanvas(obj.x, obj.y, pageHeightPt, scale)
  const width = obj.width * scale
  const height = obj.height * scale

  // pos is top-left corner, center is at pos + size/2
  const cx = pos.x + width / 2
  const cy = pos.y + height / 2
  const rx = width / 2
  const ry = height / 2

  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)

  if (obj.fill && obj.fill !== 'none') {
    ctx.fillStyle = obj.fill
    ctx.fill()
  }

  if (obj.stroke) {
    setStrokeStyle(ctx, obj, scale)
    ctx.stroke()
  }
}

function renderLine(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  if (!obj.points || obj.points.length < 4) return

  const [x1, y1, x2, y2] = obj.points
  const p1 = pdfToCanvas(x1, y1, pageHeightPt, scale)
  const p2 = pdfToCanvas(x2, y2, pageHeightPt, scale)

  setStrokeStyle(ctx, obj, scale)
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.stroke()
}

function renderArrow(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  if (!obj.points || obj.points.length < 4) return

  const [x1, y1, x2, y2] = obj.points
  const p1 = pdfToCanvas(x1, y1, pageHeightPt, scale)
  const p2 = pdfToCanvas(x2, y2, pageHeightPt, scale)

  setStrokeStyle(ctx, obj, scale)

  // Draw line
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.stroke()

  // Draw arrowhead
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
  const arrowSize = 10 * scale

  ctx.fillStyle = obj.stroke || '#000000'
  ctx.beginPath()
  ctx.moveTo(p2.x, p2.y)
  ctx.lineTo(
    p2.x - arrowSize * Math.cos(angle - Math.PI / 6),
    p2.y - arrowSize * Math.sin(angle - Math.PI / 6)
  )
  ctx.lineTo(
    p2.x - arrowSize * Math.cos(angle + Math.PI / 6),
    p2.y - arrowSize * Math.sin(angle + Math.PI / 6)
  )
  ctx.closePath()
  ctx.fill()
}

function renderPath(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  if (!obj.pathData) return

  // Parse SVG path data and convert to canvas
  const commands = parseSvgPath(obj.pathData)

  ctx.beginPath()
  ctx.strokeStyle = obj.stroke || '#000000'
  ctx.lineWidth = (obj.strokeWidth || 2) * scale
  ctx.lineCap = obj.lineCap || 'round'
  ctx.lineJoin = obj.lineJoin || 'round'

  for (const cmd of commands) {
    const pos = pdfToCanvas(cmd.x, cmd.y, pageHeightPt, scale)
    if (cmd.type === 'M') {
      ctx.moveTo(pos.x, pos.y)
    } else {
      ctx.lineTo(pos.x, pos.y)
    }
  }

  ctx.stroke()
}

interface PathCommand {
  type: 'M' | 'L'
  x: number
  y: number
}

function parseSvgPath(pathData: string): PathCommand[] {
  const commands: PathCommand[] = []
  const regex = /([ML])\s*([-\d.]+)\s+([-\d.]+)/gi
  let match

  while ((match = regex.exec(pathData)) !== null) {
    commands.push({
      type: match[1].toUpperCase() as 'M' | 'L',
      x: parseFloat(match[2]),
      y: parseFloat(match[3]),
    })
  }

  return commands
}

function renderText(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  if (!obj.text) return

  const pos = pdfToCanvas(obj.x, obj.y, pageHeightPt, scale)
  const fontSize = (obj.fontSize || 14) * scale

  ctx.fillStyle = obj.stroke || '#000000'
  ctx.font = `${fontSize}px ${obj.fontFamily || 'system-ui'}`
  ctx.textBaseline = 'top'

  // pos.y is already the top-left corner
  ctx.fillText(obj.text, pos.x, pos.y)
}

function renderCounter(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  const pos = pdfToCanvas(obj.x, obj.y, pageHeightPt, scale)
  const width = obj.width * scale
  const height = obj.height * scale

  // pos is top-left corner, center is at pos + size/2
  const cx = pos.x + width / 2
  const cy = pos.y + height / 2
  const radius = width / 2

  // Draw circle
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = obj.stroke || '#FF0000'
  ctx.fill()

  // Draw number
  const fontSize = width * 0.6
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${fontSize}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(obj.counterValue || 1), cx, cy)
}

function renderImage(
  ctx: CanvasRenderingContext2D,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  if (!obj.imageData) return
  renderImageData(ctx, obj.imageData, obj, pageHeightPt, scale)
}

function renderImageData(
  ctx: CanvasRenderingContext2D,
  dataUrl: string,
  obj: AnnotationObject,
  pageHeightPt: number,
  scale: number
): void {
  const pos = pdfToCanvas(obj.x, obj.y, pageHeightPt, scale)
  const width = obj.width * scale
  const height = obj.height * scale

  // Create image and draw synchronously if cached, otherwise skip
  // For export, we'll handle this asynchronously
  const img = new Image()
  img.src = dataUrl

  if (img.complete) {
    // pos.y is already the top-left corner
    ctx.drawImage(img, pos.x, pos.y, width, height)
  }
  // Note: For async loading, use renderAnnotationsToCanvasAsync
}

/**
 * Async version that properly loads all images before rendering.
 */
export async function renderAnnotationsToCanvasAsync(
  ctx: CanvasRenderingContext2D,
  annotations: AnnotationObject[],
  renderCtx: RenderContext
): Promise<void> {
  // Pre-load all images
  const imagePromises: Promise<void>[] = []
  const imageCache = new Map<string, HTMLImageElement>()

  for (const obj of annotations) {
    let dataUrl: string | undefined
    if (obj.type === 'image' || obj.type === 'signature') {
      dataUrl = obj.imageData
    }

    if (dataUrl && !imageCache.has(dataUrl)) {
      const promise = loadImage(dataUrl).then(img => {
        imageCache.set(dataUrl!, img)
      })
      imagePromises.push(promise)
    }
  }

  await Promise.all(imagePromises)

  // Now render with cached images
  const { pageHeightPt, scale } = renderCtx

  for (const obj of annotations) {
    ctx.save()
    ctx.globalAlpha = obj.opacity ?? 1

    if (obj.type === 'image' || obj.type === 'signature') {
      if (obj.imageData) {
        const img = imageCache.get(obj.imageData)
        if (img) {
          const pos = pdfToCanvas(obj.x, obj.y, pageHeightPt, scale)
          const width = obj.width * scale
          const height = obj.height * scale
          // pos.y is already the top-left corner
          ctx.drawImage(img, pos.x, pos.y, width, height)
        }
      }
    } else {
      // Render non-image annotations normally
      switch (obj.type) {
        case 'rect':
          renderRect(ctx, obj, pageHeightPt, scale)
          break
        case 'ellipse':
          renderEllipse(ctx, obj, pageHeightPt, scale)
          break
        case 'line':
          renderLine(ctx, obj, pageHeightPt, scale)
          break
        case 'arrow':
          renderArrow(ctx, obj, pageHeightPt, scale)
          break
        case 'path':
          renderPath(ctx, obj, pageHeightPt, scale)
          break
        case 'text':
          renderText(ctx, obj, pageHeightPt, scale)
          break
        case 'counter':
          renderCounter(ctx, obj, pageHeightPt, scale)
          break
      }
    }

    ctx.restore()
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Create a canvas with annotations rendered on transparent background.
 * Used for PDF overlay layer.
 */
export async function createAnnotationOverlay(
  annotations: AnnotationObject[],
  pageWidthPt: number,
  pageHeightPt: number,
  dpi: number = 150
): Promise<{ canvas: HTMLCanvasElement; pngBytes: Uint8Array }> {
  // Calculate canvas size based on DPI
  // 72 pt = 1 inch, so scale = dpi / 72
  const pdfScale = dpi / 72
  const canvasWidth = Math.round(pageWidthPt * pdfScale)
  const canvasHeight = Math.round(pageHeightPt * pdfScale)

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // Transparent background (default)
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  await renderAnnotationsToCanvasAsync(ctx, annotations, {
    pageWidthPt,
    pageHeightPt,
    scale: pdfScale,
  })

  // Convert to PNG bytes
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
      'image/png'
    )
  })

  const arrayBuffer = await blob.arrayBuffer()
  const pngBytes = new Uint8Array(arrayBuffer)

  return { canvas, pngBytes }
}
