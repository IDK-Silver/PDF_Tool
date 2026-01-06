// Annotation types as defined in docs/annotation-toolbar-design.md
// Phase 7: Relative size system - strokeWidth represents visual size, converted to pt at creation time

/**
 * Visual size options for all annotation tools (screen pixels at current zoom)
 * The actual pt value is calculated as: actualPt = visualSize / scale
 */
export const VISUAL_SIZES = [1, 2, 4, 8] as const
export type VisualSize = (typeof VISUAL_SIZES)[number]

/**
 * Base font size for text annotations (pt)
 * Text fontSize = TEXT_BASE_SIZE * sizeMultiplier / scale
 */
export const TEXT_BASE_SIZE = 14

export type AnnotationType =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'pixelate'
  | 'counter'
  | 'path'       // pen/highlighter produce this type
  | 'image'
  | 'signature'

export type ToolType =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'pixelate'
  | 'counter'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'image'
  | 'signature'

// Point for drawing paths
export interface Point {
  x: number
  y: number
}

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export interface AnnotationObject {
  id: string
  type: AnnotationType
  pageIndex: number

  // Position and size in PDF points (origin: bottom-left)
  x: number
  y: number
  width: number
  height: number

  // Common style
  opacity: number // 0-1

  // Shape styles (rect, ellipse, line, arrow)
  fill?: string // hex color or 'none'
  stroke?: string // hex color
  strokeWidth?: number // in pt
  strokeStyle?: StrokeStyle // solid, dashed, dotted

  // Image/signature specific
  imageData?: string // base64 PNG

  // Line specific: [x1, y1, x2, y2] in PDF pt
  points?: number[]

  // Path specific (pen/highlighter)
  pathData?: string // SVG path data: "M x1 y1 L x2 y2 ..."
  lineCap?: 'round' | 'butt' | 'square'
  lineJoin?: 'round' | 'bevel' | 'miter'
  pathSource?: 'pen' | 'highlighter' // track which tool created it

  // Text specific
  text?: string
  fontSize?: number
  fontFamily?: string

  // Counter specific
  counterValue?: number         // The number displayed in badge

  // Pixelate specific
  pixelatedImageData?: string   // Base64 of pixelated region
  pixelateSize?: number         // Block size used for pixelation
}

export interface ToolSettings {
  // Common - Phase 7: strokeWidth is visual size, converted to pt at creation time
  color: string           // Primary color
  strokeWidth: number     // Visual size (1, 2, 4, 8) - converted to pt based on scale
  strokeStyle: StrokeStyle // Line style
  opacity: number         // Opacity

  // Legacy (for backward compatibility)
  fill: string
  stroke: string

  // Counter specific
  counterStart: number

  // Text specific - Phase 7: fontSize is now derived from strokeWidth
  fontSize: number        // Deprecated: use strokeWidth as size multiplier
  fontFamily: string

  // Signature specific
  signatureDataUrl?: string  // Selected signature image data URL
}

export const defaultToolSettings: ToolSettings = {
  color: '#000000',
  strokeWidth: 2,
  strokeStyle: 'solid',
  opacity: 1,
  fill: '#ffff00',
  stroke: '#000000',
  counterStart: 1,
  fontSize: 14,
  fontFamily: 'system-ui',
}

export interface AnnotationState {
  // Annotation objects indexed by page
  objects: Record<number, AnnotationObject[]>

  // Currently selected annotation IDs (array for serialization)
  selectedIds: string[]

  // Active tool
  activeTool: ToolType | null

  // Tool settings
  toolSettings: ToolSettings

  // Pending object (e.g., image waiting to be placed)
  pendingObject: AnnotationObject | null

  // Drawing state (pen/highlighter)
  isDrawing: boolean
  drawingPoints: Point[]
  drawingPageIndex: number | null

  // Text editing state
  editingTextId: string | null
}

export interface SignatureInfo {
  id: string
  name: string
  imageData: string // base64 PNG
  createdAt: number // timestamp
  lastUsedAt: number
}

// System font info from backend
export interface FontInfo {
  family: string
  path?: string
  isCjk: boolean
}

// Coordinate conversion context
export interface CoordinateContext {
  pageWidthPt: number
  pageHeightPt: number
  displayWidth: number
  displayHeight: number
}
