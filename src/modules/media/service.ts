import { invoke } from '@tauri-apps/api/core'
import type { MediaDescriptor, PageRender, PageRenderBytesRaw, PdfOpenResult } from './types'
import type { PdfPageSize } from './types'

export async function analyzeMedia(path: string): Promise<MediaDescriptor> {
  const res = await invoke<MediaDescriptor>('analyze_media', { path })
  return res
}

// 已移除：請改用 pdf_open() 回傳的 pages 或 pdf_page_size()

export async function pdfRenderPage(opts: {
  docId: number
  pageIndex: number
  scale?: number
  dpi?: number
  format?: 'png'|'webp'|'jpeg'
  targetWidth?: number
  quality?: number
  gen?: number
}): Promise<PageRender> {
  // Rust 端以單一參數結構接收，回傳 bytes
  const raw = await invoke<PageRenderBytesRaw>('pdf_render_page', { args: opts })
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
