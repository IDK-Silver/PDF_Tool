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
  format: 'png' | 'webp' | 'jpeg' | 'raw'
  imagePath: string
  // helper
  contentUrl?: string
  // raw 渲染的像素資料（避免於前端再編碼）
  rawImageData?: ImageData
  // 高解析度內容（按需載入、可 LRU 淘汰）
  highResUrl?: string
}

export interface PageRenderBytesRaw {
  pageIndex: number
  widthPx: number
  heightPx: number
  scale?: number
  dpi?: number
  format: 'png' | 'webp' | 'jpeg' | 'raw'
  imageBytes: number[]
}

export interface PdfOpenResult {
  docId: number
  pages: number
}

export interface PdfPageSize {
  widthPt: number
  heightPt: number
}
