// Annotation types as defined in docs/annotation-toolbar-design.md

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
}

export interface ToolSettings {
  // Common
  color: string           // Primary color
  strokeWidth: number     // Line width (pt)
  strokeStyle: StrokeStyle // Line style
  opacity: number         // Opacity

  // Legacy (for backward compatibility)
  fill: string
  stroke: string

  // Pixelate specific
  pixelateSize: number
  pixelateStrength: number

  // Counter specific
  counterStart: number

  // Text specific
  fontSize: number
  fontFamily: string
}

export const defaultToolSettings: ToolSettings = {
  color: '#FF0000',
  strokeWidth: 2,
  strokeStyle: 'solid',
  opacity: 1,
  fill: '#ffff00',
  stroke: '#000000',
  pixelateSize: 10,
  pixelateStrength: 8,
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

// Coordinate conversion context
export interface CoordinateContext {
  pageWidthPt: number
  pageHeightPt: number
  displayWidth: number
  displayHeight: number
}
