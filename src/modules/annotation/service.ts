import { invoke } from '@tauri-apps/api/core'
import type { AnnotationObject } from './types'
import { createAnnotationOverlay } from '@/modules/export/canvasRenderer'

export interface AddImageResult {
  success: boolean
  page_index: number
}

export interface PageSize {
  widthPt: number
  heightPt: number
}

/**
 * Embed all annotations into the PDF document as overlay layers.
 * Renders annotations to transparent PNG and embeds as full-page images.
 * Should be called before saving.
 */
export async function embedAllAnnotations(
  docId: number,
  annotations: AnnotationObject[],
  pageSizes: Map<number, PageSize>
): Promise<void> {
  if (annotations.length === 0) return

  // Group by page
  const byPage = new Map<number, AnnotationObject[]>()
  for (const ann of annotations) {
    const list = byPage.get(ann.pageIndex) || []
    list.push(ann)
    byPage.set(ann.pageIndex, list)
  }

  // Render each page's annotations as a single overlay layer
  for (const [pageIndex, pageAnnotations] of byPage) {
    const pageSize = pageSizes.get(pageIndex)
    if (!pageSize) {
      console.warn(`Page size not found for page ${pageIndex}, skipping annotations`)
      continue
    }

    // Render all annotations on this page to a transparent PNG
    const { pngBytes } = await createAnnotationOverlay(
      pageAnnotations,
      pageSize.widthPt,
      pageSize.heightPt,
      150 // DPI for overlay
    )

    // Embed as full-page overlay
    await invoke<AddImageResult>('pdf_add_image_to_page', {
      docId,
      pageIndex,
      imageBytes: Array.from(pngBytes),
      xPt: 0,
      yPt: 0,
      widthPt: pageSize.widthPt,
      heightPt: pageSize.heightPt,
    })
  }
}

/**
 * Legacy function: Embed a single image annotation into a PDF page.
 * Kept for backward compatibility but embedAllAnnotations is preferred.
 */
export async function embedImageAnnotation(
  docId: number,
  annotation: AnnotationObject
): Promise<AddImageResult> {
  if (annotation.type !== 'image' && annotation.type !== 'signature') {
    throw new Error(`Unsupported annotation type for embedding: ${annotation.type}`)
  }

  if (!annotation.imageData) {
    throw new Error('Image annotation missing imageData')
  }

  // Extract base64 data from data URL
  const base64Match = annotation.imageData.match(/^data:[^;]+;base64,(.+)$/)
  if (!base64Match) {
    throw new Error('Invalid imageData format')
  }

  const base64 = base64Match[1]
  const bytes = base64ToBytes(base64)

  return invoke<AddImageResult>('pdf_add_image_to_page', {
    docId,
    pageIndex: annotation.pageIndex,
    imageBytes: Array.from(bytes),
    xPt: annotation.x,
    yPt: annotation.y - annotation.height, // PDF origin is bottom-left, adjust for top-left placement
    widthPt: annotation.width,
    heightPt: annotation.height,
  })
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}
