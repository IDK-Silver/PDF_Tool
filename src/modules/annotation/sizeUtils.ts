// Size utilities for relative size system (Phase 7)
// Converts visual pixel sizes to actual PDF pt values based on current zoom level
//
// Core concept:
// - User selects visual size (1, 2, 4, 8) representing screen pixels at current zoom
// - System converts to actual pt for storage: actualPt = visualSize / scale
// - Result: drawing looks the same size on screen regardless of zoom level

import type { CoordinateContext } from './types'

/**
 * Available visual size options (in screen pixels at current zoom)
 */
export const VISUAL_SIZES = [1, 2, 4, 8] as const
export type VisualSize = (typeof VISUAL_SIZES)[number]

/**
 * Base font size for text annotations (pt)
 * Text size = baseSize * sizeMultiplier / scale
 */
export const TEXT_BASE_SIZE = 14

/**
 * Calculate the scale factor from coordinate context
 * scale = displayWidth / pageWidthPt
 *
 * Examples:
 * - 100% zoom: displayWidth = pageWidthPt -> scale = 1.0
 * - 200% zoom: displayWidth = 2 * pageWidthPt -> scale = 2.0
 * - 50% zoom: displayWidth = 0.5 * pageWidthPt -> scale = 0.5
 */
export function getScale(ctx: CoordinateContext): number {
  if (ctx.pageWidthPt <= 0) return 1
  return ctx.displayWidth / ctx.pageWidthPt
}

/**
 * Convert visual size (screen pixels) to actual PDF pt value
 * Formula: actualPt = visualSize / scale
 *
 * Example (user selects size 4):
 * - 100% zoom (scale=1): 4 / 1 = 4pt stored
 * - 200% zoom (scale=2): 4 / 2 = 2pt stored
 * - 400% zoom (scale=4): 4 / 4 = 1pt stored
 * - 50% zoom (scale=0.5): 4 / 0.5 = 8pt stored
 *
 * When viewing:
 * - At any zoom, the stored pt * scale gives back the visual size
 * - 4pt at 100%: 4 * 1 = 4px visual
 * - 2pt at 200%: 2 * 2 = 4px visual
 * - 1pt at 400%: 1 * 4 = 4px visual
 */
export function visualSizeToPt(visualSize: number, scale: number): number {
  if (scale <= 0) return visualSize
  return visualSize / scale
}

/**
 * Convert visual size to actual font size in pt
 * Formula: fontSize = baseSize * sizeMultiplier / scale
 *
 * With baseSize=14, sizeMultiplier=1:
 * - 100% zoom: 14 * 1 / 1 = 14pt (looks 14px on screen)
 * - 200% zoom: 14 * 1 / 2 = 7pt (7pt * 2 = 14px on screen)
 * - 400% zoom: 14 * 1 / 4 = 3.5pt (3.5pt * 4 = 14px on screen)
 *
 * With baseSize=14, sizeMultiplier=2:
 * - 100% zoom: 14 * 2 / 1 = 28pt (looks 28px on screen)
 * - 200% zoom: 14 * 2 / 2 = 14pt (14pt * 2 = 28px on screen)
 */
export function visualSizeToFontPt(
  sizeMultiplier: number,
  scale: number,
  baseSize: number = TEXT_BASE_SIZE
): number {
  if (scale <= 0) return baseSize * sizeMultiplier
  const fontSize = (baseSize * sizeMultiplier) / scale
  // Clamp to reasonable range for PDF rendering
  return Math.max(4, Math.min(200, fontSize))
}

/**
 * Helper to calculate actual pt from visual size using CoordinateContext
 */
export function calculateActualPt(visualSize: number, ctx: CoordinateContext): number {
  const scale = getScale(ctx)
  return visualSizeToPt(visualSize, scale)
}

/**
 * Helper to calculate actual font pt from visual size using CoordinateContext
 */
export function calculateActualFontPt(
  sizeMultiplier: number,
  ctx: CoordinateContext,
  baseSize: number = TEXT_BASE_SIZE
): number {
  const scale = getScale(ctx)
  return visualSizeToFontPt(sizeMultiplier, scale, baseSize)
}
