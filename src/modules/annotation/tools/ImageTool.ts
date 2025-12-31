import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useAnnotationStore } from '../store'
import type { AnnotationObject } from '../types'

interface ImageReadResult {
  imageBytes: number[]
  mimeType: string
  width: number
  height: number
}

const DEFAULT_IMAGE_SIZE_PT = 150 // Default size in PDF points

/**
 * Open file picker, load image, and prepare for placement.
 */
export async function selectAndPrepareImage(): Promise<boolean> {
  const annotation = useAnnotationStore()

  const picked = await openDialog({
    multiple: false,
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
    ],
  })

  if (!picked) {
    annotation.setActiveTool(null)
    return false
  }

  const path = Array.isArray(picked) ? picked[0] : picked

  try {
    // Read file using backend command
    const result = await invoke<ImageReadResult>('image_read', { path })
    const bytes = new Uint8Array(result.imageBytes)

    // Convert to base64
    const base64 = arrayBufferToBase64(bytes)
    const dataUrl = `data:${result.mimeType};base64,${base64}`

    // Get image dimensions
    const dimensions = await getImageDimensions(dataUrl)

    // Calculate size in PDF points (maintain aspect ratio)
    let widthPt = DEFAULT_IMAGE_SIZE_PT
    let heightPt = DEFAULT_IMAGE_SIZE_PT
    if (dimensions.width && dimensions.height) {
      const aspect = dimensions.height / dimensions.width
      heightPt = widthPt * aspect
    }

    // Create pending object
    const pendingObj: AnnotationObject = {
      id: '', // Will be assigned when added
      type: 'image',
      pageIndex: -1, // Will be set on placement
      x: 0,
      y: 0,
      width: widthPt,
      height: heightPt,
      opacity: 1,
      imageData: dataUrl,
    }

    annotation.setPendingObject(pendingObj)
    return true
  } catch (err) {
    console.error('[ImageTool] Failed to load image:', err)
    annotation.setActiveTool(null)
    return false
  }
}

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = ''
  const len = buffer.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  return btoa(binary)
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
    }
    img.src = dataUrl
  })
}

/**
 * Cancel pending image placement and reset tool.
 */
export function cancelImagePlacement() {
  const annotation = useAnnotationStore()
  annotation.setPendingObject(null)
  annotation.setActiveTool(null)
}
