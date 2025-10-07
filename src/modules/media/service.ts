import { invoke } from '@tauri-apps/api/core'
import type { MediaDescriptor, PageRender, PageRenderBytesRaw, PdfOpenResult } from './types'

export async function analyzeMedia(path: string): Promise<MediaDescriptor> {
  const res = await invoke<MediaDescriptor>('analyze_media', { path })
  return res
}

export async function pdfInfo(path: string): Promise<{ pages: number }> {
  const res = await invoke<{ pages: number }>('pdf_info', { path })
  return res
}

export async function pdfRenderPage(opts: {
  docId?: number
  pageIndex: number
  scale?: number
  dpi?: number
  rotateDeg?: 0|90|180|270
  format?: 'png'|'webp'|'jpeg'
  targetWidth?: number
  quality?: number
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
