// Annotation types as defined in docs/annotation-system.md

export type AnnotationType = 'image' | 'signature' | 'rect' | 'ellipse' | 'line'

export type ToolType = 'select' | 'image' | 'signature' | 'rect' | 'ellipse' | 'line'

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

  // Shape styles (rect, ellipse, line)
  fill?: string // hex color or 'none'
  stroke?: string // hex color
  strokeWidth?: number // in pt

  // Image/signature specific
  imageData?: string // base64 PNG

  // Line specific: [x1, y1, x2, y2] in PDF pt
  points?: number[]
}

export interface ToolSettings {
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
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
