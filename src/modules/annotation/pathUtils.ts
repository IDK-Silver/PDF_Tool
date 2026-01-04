// Path utilities for pen/highlighter drawing tools
import type { Point } from './types'

/**
 * Simplify a path using Ramer-Douglas-Peucker algorithm.
 * Removes redundant points while preserving the shape.
 * @param points Original points
 * @param epsilon Tolerance in PDF points (0.5-2.0 recommended)
 */
export function simplifyPath(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points

  // Find point with maximum distance from line between start and end
  const start = points[0]
  const end = points[points.length - 1]
  let maxDist = 0
  let maxIndex = 0

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end)
    if (dist > maxDist) {
      maxDist = dist
      maxIndex = i
    }
  }

  // If max distance > epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon)
    const right = simplifyPath(points.slice(maxIndex), epsilon)
    // Avoid duplicate point at junction
    return [...left.slice(0, -1), ...right]
  }

  return [start, end]
}

/**
 * Calculate perpendicular distance from point to line segment.
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y

  // Handle degenerate case: line segment is a point
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y)
  }

  // Calculate perpendicular distance
  // |((y2-y1)*x0 - (x2-x1)*y0 + x2*y1 - y2*x1)| / sqrt((y2-y1)^2 + (x2-x1)^2)
  const numerator = Math.abs(
    dy * point.x - dx * point.y +
    lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  )
  return numerator / Math.sqrt(lengthSq)
}

/**
 * Convert points array to SVG path data string.
 * Uses relative coordinates stored in PDF coordinate system.
 */
export function pointsToPathData(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`]
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${points[i].x} ${points[i].y}`)
  }
  return parts.join(' ')
}

/**
 * Parse SVG path data string to points array.
 */
export function pathDataToPoints(pathData: string): Point[] {
  const points: Point[] = []
  const regex = /([ML])\s*([\d.-]+)\s+([\d.-]+)/g
  let match

  while ((match = regex.exec(pathData)) !== null) {
    points.push({
      x: parseFloat(match[2]),
      y: parseFloat(match[3]),
    })
  }

  return points
}

/**
 * Calculate bounding box for points array.
 */
export function calculateBoundingBox(points: Point[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y

  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  return {
    x: minX,
    y: maxY, // PDF coordinates: y is top edge
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Transform path data from PDF to SVG coordinates.
 * PDF: origin bottom-left, Y up
 * SVG: origin top-left, Y down
 */
export function pdfPathToSvgPath(
  pathData: string,
  pageHeightPt: number,
  scale: number
): string {
  return pathData.replace(
    /([ML])\s*([\d.-]+)\s+([\d.-]+)/g,
    (_, cmd: string, x: string, y: string) => {
      const svgX = parseFloat(x) * scale
      const svgY = (pageHeightPt - parseFloat(y)) * scale
      return `${cmd} ${svgX} ${svgY}`
    }
  )
}

/**
 * Check if a point is near a path (for eraser tool).
 * @param point Point to check
 * @param pathPoints Points of the path
 * @param threshold Distance threshold
 */
export function isPointNearPath(point: Point, pathPoints: Point[], threshold: number): boolean {
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const dist = pointToSegmentDistance(point, pathPoints[i], pathPoints[i + 1])
    if (dist < threshold) {
      return true
    }
  }

  // Also check if near any point
  for (const p of pathPoints) {
    const dist = Math.hypot(point.x - p.x, point.y - p.y)
    if (dist < threshold) {
      return true
    }
  }

  return false
}

/**
 * Distance from point to line segment.
 */
function pointToSegmentDistance(point: Point, segStart: Point, segEnd: Point): number {
  const dx = segEnd.x - segStart.x
  const dy = segEnd.y - segStart.y
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) {
    return Math.hypot(point.x - segStart.x, point.y - segStart.y)
  }

  // Project point onto line, clamped to segment
  let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))

  const projX = segStart.x + t * dx
  const projY = segStart.y + t * dy

  return Math.hypot(point.x - projX, point.y - projY)
}
