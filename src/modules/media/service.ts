import { invoke } from '@tauri-apps/api/core'
import type { MediaDescriptor, PageRender, PageRenderBytesRaw, PdfOpenResult } from './types'
import type { PdfPageSize } from './types'

export async function analyzeMedia(path: string): Promise<MediaDescriptor> {
  const res = await invoke<MediaDescriptor>('analyze_media', { path })
  return res
}

export interface ImageReadResult {
  width: number
  height: number
  imageBytes: number[]
  mimeType: string
}

export async function imageRead(path: string): Promise<ImageReadResult> {
  const res = await invoke<ImageReadResult>('image_read', { path })
  return res
}

// 已移除：請改用 pdf_open() 回傳的 pages 或 pdf_page_size()

export async function pdfRenderPage(opts: {
  docId: number
  pageIndex: number
  scale?: number
  dpi?: number
  format?: 'png'|'webp'|'jpeg'|'raw'
  targetWidth?: number
  quality?: number
  gen?: number
}): Promise<PageRender> {
  // ⚡ 使用異步命令（真正並行渲染）
  const raw = await invoke<PageRenderBytesRaw>('pdf_render_page_async', { args: opts })
  
  // ⚡ Raw bitmap 模式：直接繪製到 Canvas（零解碼開銷）
  if (raw.format === 'raw') {
    const canvas = document.createElement('canvas')
    canvas.width = raw.widthPx
    canvas.height = raw.heightPx
    const ctx = canvas.getContext('2d')!
    
    const imageData = new ImageData(
      new Uint8ClampedArray(raw.imageBytes),
      raw.widthPx,
      raw.heightPx
    )
    ctx.putImageData(imageData, 0, 0)
    
    const url = canvas.toDataURL('image/png', 0.9)  // 快速 PNG 編碼（可選）
    return {
      pageIndex: raw.pageIndex,
      widthPx: raw.widthPx,
      heightPx: raw.heightPx,
      scale: raw.scale,
      dpi: raw.dpi,
      format: 'raw',
      imagePath: '',
      contentUrl: url,
    }
  }
  
  // 原有格式（WebP/JPEG/PNG）
  const bytes = new Uint8Array(raw.imageBytes)
  const mime = raw.format === 'webp' ? 'image/webp' : (raw.format === 'jpeg' ? 'image/jpeg' : 'image/png')
  const blob = new Blob([bytes], { type: mime })
  const url = URL.createObjectURL(blob)
  return {
    pageIndex: raw.pageIndex,
    widthPx: raw.widthPx,
    heightPx: raw.heightPx,
    scale: raw.scale,
    dpi: raw.dpi,
    format: raw.format,
    imagePath: '',
    contentUrl: url,
  }
}

export async function pdfOpen(path: string): Promise<PdfOpenResult> {
  return invoke<PdfOpenResult>('pdf_open', { path })
}

export async function pdfClose(docId: number): Promise<void> {
  await invoke('pdf_close', { docId })
}

// 已統一為 `pdf_render_page` 回傳 bytes，移除 *Bytes API。

export async function pdfPageSize(docId: number, pageIndex: number): Promise<PdfPageSize> {
  return invoke<PdfPageSize>('pdf_page_size', { docId, pageIndex })
}

export async function pdfRenderCancel(docId: number, pageIndex: number, minGen: number): Promise<void> {
  await invoke('pdf_render_cancel', { docId, pageIndex, minGen })
}

// 舊的以路徑直接刪頁 API 已移除

// New docId-based API for immediate, stateful deletion.
export async function pdfDeletePagesDoc(opts: { docId: number, indices: number[] }): Promise<{ pages: number }> {
  const { docId, indices } = opts
  return invoke<{ pages: number }>('pdf_delete_pages', { docId, indices })
}

// Save current document to path (overwrite when destPath omitted and overwrite=true)
export async function pdfSave(opts: { docId: number, destPath?: string, overwrite?: boolean }): Promise<{ path: string, pages: number }> {
  const { docId, destPath, overwrite } = opts
  return invoke<{ path: string, pages: number }>('pdf_save', { docId, destPath, overwrite })
}

export async function pdfExportPageImage(opts: {
  docId: number
  pageIndex: number
  destPath: string
  format?: 'png'|'jpeg'
  targetWidth?: number
  dpi?: number
  quality?: number
}): Promise<{ path: string, widthPx: number, heightPx: number, format: string }> {
  const { docId, pageIndex, destPath, format, targetWidth, dpi, quality } = opts
  return invoke<{ path: string, widthPx: number, heightPx: number, format: string }>('pdf_export_page_image', {
    docId, pageIndex, destPath, format, targetWidth, dpi, quality
  })
}

export async function pdfExportPagePdf(opts: { docId: number, pageIndex: number, destPath: string }): Promise<{ path: string }> {
  const { docId, pageIndex, destPath } = opts
  return invoke<{ path: string }>('pdf_export_page_pdf', { docId, pageIndex, destPath })
}

export async function pdfInsertBlank(opts: { docId: number, index: number, widthPt: number, heightPt: number}): Promise<{ pages: number }> {
  const { docId, index, widthPt, heightPt } = opts
  return invoke<{ pages: number }>('pdf_insert_blank', { docId, index, widthPt, heightPt })
}

export async function pdfRotatePage(opts: { docId: number, index: number, rotateDeg: 0|90|180|270 }): Promise<void> {
  const { docId, index, rotateDeg } = opts
  await invoke('pdf_rotate_page', { docId, index, rotateDeg })
}

export async function pdfRotatePageRelative(opts: { docId: number, index: number, deltaDeg: number }): Promise<number> {
  const { docId, index, deltaDeg } = opts
  return invoke<number>('pdf_rotate_page_relative', { docId, index, deltaDeg })
}
