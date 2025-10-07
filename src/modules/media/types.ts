export type MediaType = 'pdf' | 'image' | 'unknown'

export interface MediaDescriptor {
  path: string
  type: MediaType
  name: string
  size?: number
  pages?: number
  width?: number
  height?: number
  orientation?: 1|2|3|4|5|6|7|8
}

export interface PageRender {
  pageIndex: number
  widthPx: number
  heightPx: number
  scale?: number
  dpi?: number
  format: 'png' | 'webp' | 'jpeg'
  imagePath: string
  // helper
  contentUrl?: string
}

export interface PageRenderBytesRaw {
  pageIndex: number
  widthPx: number
  heightPx: number
  scale?: number
  dpi?: number
  format: 'png' | 'webp' | 'jpeg'
  imageBytes: number[]
}

export interface PdfOpenResult {
  docId: number
  pages: number
}
