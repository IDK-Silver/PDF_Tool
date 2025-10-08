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
  // 雙快取策略
  lowResUrl?: string   // 低解析度縮圖（快速載入、常駐）
  highResUrl?: string  // 高解析度版本（按需載入、可 LRU 淘汰）
  isLowRes?: boolean   // 標記當前是否為低解析度狀態
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

export interface PdfPageSize {
  widthPt: number
  heightPt: number
}
