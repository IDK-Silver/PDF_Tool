import { invoke } from '@tauri-apps/api/core'
import type { AnnotationObject } from './types'

export interface AddImageResult {
  success: boolean
  page_index: number
}

/**
 * Embed an image annotation into a PDF page.
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

/**
 * Embed all annotations into the PDF document.
 * Should be called before saving.
 */
export async function embedAllAnnotations(
  docId: number,
  annotations: AnnotationObject[]
): Promise<void> {
  // Group by page for potential optimization
  const byPage = new Map<number, AnnotationObject[]>()
  for (const ann of annotations) {
    const list = byPage.get(ann.pageIndex) || []
    list.push(ann)
    byPage.set(ann.pageIndex, list)
  }

  // Embed each annotation
  for (const [_pageIndex, pageAnnotations] of byPage) {
    for (const ann of pageAnnotations) {
      if (ann.type === 'image' || ann.type === 'signature') {
        await embedImageAnnotation(docId, ann)
      }
      // TODO: Add shape embedding when backend supports it (Phase 3)
    }
  }
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
