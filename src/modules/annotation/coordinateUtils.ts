import type { CoordinateContext } from './types'

/**
 * Convert screen coordinates to PDF coordinates.
 * PDF coordinate system: origin at bottom-left, Y-axis pointing up.
 */
export function screenToPdf(
  screenX: number,
  screenY: number,
  element: HTMLElement,
  ctx: CoordinateContext
): { x: number; y: number } {
  const rect = element.getBoundingClientRect()

  // Convert to element-local coordinates
  const localX = screenX - rect.left
  const localY = screenY - rect.top

  // Calculate scale factor (display pixels to PDF points)
  const scale = ctx.pageWidthPt / ctx.displayWidth

  // Convert to PDF coordinates (flip Y-axis)
  const pdfX = localX * scale
  const pdfY = ctx.pageHeightPt - (localY * scale)

  return { x: pdfX, y: pdfY }
}

/**
 * Convert PDF coordinates to SVG/display coordinates.
 * SVG coordinate system: origin at top-left, Y-axis pointing down.
 */
export function pdfToSvg(
  pdfX: number,
  pdfY: number,
  ctx: CoordinateContext
): { x: number; y: number } {
  const scale = ctx.displayWidth / ctx.pageWidthPt

  const svgX = pdfX * scale
  const svgY = (ctx.pageHeightPt - pdfY) * scale

  return { x: svgX, y: svgY }
}

/**
 * Convert PDF dimensions to SVG dimensions.
 */
export function pdfSizeToSvg(
  widthPt: number,
  heightPt: number,
  ctx: CoordinateContext
): { width: number; height: number } {
  const scale = ctx.displayWidth / ctx.pageWidthPt
  return {
    width: widthPt * scale,
    height: heightPt * scale,
  }
}

/**
 * Convert SVG coordinates to PDF coordinates.
 */
export function svgToPdf(
  svgX: number,
  svgY: number,
  ctx: CoordinateContext
): { x: number; y: number } {
  const scale = ctx.pageWidthPt / ctx.displayWidth

  const pdfX = svgX * scale
  const pdfY = ctx.pageHeightPt - (svgY * scale)

  return { x: pdfX, y: pdfY }
}

/**
 * Convert SVG dimensions to PDF dimensions.
 */
export function svgSizeToPdf(
  width: number,
  height: number,
  ctx: CoordinateContext
): { width: number; height: number } {
  const scale = ctx.pageWidthPt / ctx.displayWidth
  return {
    width: width * scale,
    height: height * scale,
  }
}

/**
 * Calculate bounding box from line points.
 */
export function lineToBoundingBox(points: number[]): {
  x: number
  y: number
  width: number
  height: number
} {
  if (points.length < 4) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const [x1, y1, x2, y2] = points
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  const maxX = Math.max(x1, x2)
  const maxY = Math.max(y1, y2)
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Check if a point is inside a rectangle.
 */
export function pointInRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh
}

/**
 * Create coordinate context from page info.
 */
export function createCoordinateContext(
  pageWidthPt: number,
  pageHeightPt: number,
  displayWidth: number,
  displayHeight: number
): CoordinateContext {
  return {
    pageWidthPt,
    pageHeightPt,
    displayWidth,
    displayHeight,
  }
}
