export interface PagePointerContext {
  pageNumber: number
  pageIndex: number
  scale: number
  width: number
  height: number
  offsetX: number
  offsetY: number
  clientX: number
  clientY: number
  pdfX: number
  pdfY: number
}

export interface ContextMenuItem {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
}
