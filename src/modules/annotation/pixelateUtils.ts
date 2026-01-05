/**
 * Pixelate utility functions - generates noise overlay for redaction
 */

export interface PixelateCaptureParams {
  pageIndex: number
  x: number              // Left edge in PDF points
  y: number              // Top edge in PDF points (Y increases upward)
  width: number          // Width in PDF points
  height: number         // Height in PDF points
  pageWidthPt: number    // Full page width in PDF points
  pageHeightPt: number   // Full page height in PDF points
  blockSize: number      // Noise block size (visual pixels, will be scaled)
  scale: number          // Current display scale (displayWidth / pageWidthPt)
}

/**
 * Generate a noise image for the specified region.
 * Instead of capturing and pixelating background, this creates random noise blocks.
 *
 * @param params - Parameters including dimensions and block size
 * @returns Base64 data URL of noise image, or null if generation fails
 */
export async function captureAndPixelateRegion(
  params: PixelateCaptureParams
): Promise<string | null> {
  const { width, height, blockSize, scale } = params

  // Convert PDF pt dimensions to display pixels for the output image
  const displayWidth = Math.ceil(width * scale)
  const displayHeight = Math.ceil(height * scale)

  if (displayWidth <= 0 || displayHeight <= 0) {
    console.warn('Invalid region dimensions', { width, height, scale })
    return null
  }

  try {
    // Generate noise image
    const noiseDataUrl = generateNoiseImage(displayWidth, displayHeight, blockSize)
    return noiseDataUrl
  } catch (e) {
    console.warn('Failed to generate noise:', e)
    return null
  }
}

/**
 * Generate a noise image with random colored blocks.
 * @param width - Output width in pixels
 * @param height - Output height in pixels
 * @param blockSize - Size of each noise block in pixels
 */
function generateNoiseImage(width: number, height: number, blockSize: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Ensure minimum block size of 1
  const effectiveBlockSize = Math.max(1, Math.floor(blockSize))

  // Calculate number of blocks
  const cols = Math.ceil(width / effectiveBlockSize)
  const rows = Math.ceil(height / effectiveBlockSize)

  // Fill with random colored blocks
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Generate random grayscale color (noise effect)
      const gray = Math.floor(Math.random() * 256)
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`

      const x = col * effectiveBlockSize
      const y = row * effectiveBlockSize
      const w = Math.min(effectiveBlockSize, width - x)
      const h = Math.min(effectiveBlockSize, height - y)

      ctx.fillRect(x, y, w, h)
    }
  }

  return canvas.toDataURL('image/png')
}
