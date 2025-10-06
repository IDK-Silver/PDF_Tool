import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import type { MediaDescriptor, PageRender } from './types'

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
  const out = await invoke<PageRender>('pdf_render_page', opts)
  // attach contentUrl for convenience
  const url = toContentUrl(out.imagePath)
  return { ...out, contentUrl: url }
}

export function toContentUrl(p: string) {
  return convertFileSrc(p)
}

