import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import type { MediaDescriptor, PageRender, PageRenderBytesRaw } from './types'

export async function analyzeMedia(path: string): Promise<MediaDescriptor> {
  const res = await invoke<MediaDescriptor>('analyze_media', { path })
  return res
}

export async function pdfInfo(path: string): Promise<{ pages: number }> {
  const res = await invoke<{ pages: number }>('pdf_info', { path })
  return res
}

export async function pdfRenderPage(opts: {
  path: string
  pageIndex: number
  scale?: number
  dpi?: number
  rotateDeg?: 0|90|180|270
  format?: 'png'|'webp'
}): Promise<PageRender> {
  // Rust 端以單一參數結構接收，回傳 bytes
  const raw = await invoke<PageRenderBytesRaw>('pdf_render_page', { args: opts })
  const bytes = new Uint8Array(raw.imageBytes)
  const mime = raw.format === 'webp' ? 'image/webp' : 'image/png'
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

export function toContentUrl(p: string) {
  // 明確使用 'asset' 協定，確保不會回傳原始絕對路徑
  return convertFileSrc(p, 'asset')
}

// 已統一為 `pdf_render_page` 回傳 bytes，移除 *Bytes API。
