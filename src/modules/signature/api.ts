import { invoke } from '@tauri-apps/api/core'

/**
 * Signature info returned from the backend.
 * The imageData is converted to a data URL for frontend use.
 */
export interface SignatureInfo {
  id: string
  dataUrl: string
  createdAt: number
}

interface RawSignatureInfo {
  id: string
  imageData: number[]  // PNG bytes from Rust
  createdAt: number
}

/**
 * Convert PNG bytes to a data URL.
 */
function bytesToDataUrl(bytes: number[]): string {
  const uint8 = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i])
  }
  const base64 = btoa(binary)
  return `data:image/png;base64,${base64}`
}

/**
 * Convert a data URL to PNG bytes.
 */
function dataUrlToBytes(dataUrl: string): number[] {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid data URL format')
  }
  const base64 = match[1]
  const binaryString = atob(base64)
  const bytes = new Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * List all saved signatures.
 */
export async function listSignatures(): Promise<SignatureInfo[]> {
  const rawList = await invoke<RawSignatureInfo[]>('signature_list')
  return rawList.map((raw) => ({
    id: raw.id,
    dataUrl: bytesToDataUrl(raw.imageData),
    createdAt: raw.createdAt,
  }))
}

/**
 * Add a new signature.
 * @param dataUrl PNG image as a data URL
 */
export async function addSignature(dataUrl: string): Promise<SignatureInfo> {
  const bytes = dataUrlToBytes(dataUrl)
  const raw = await invoke<RawSignatureInfo>('signature_add', {
    imageData: bytes,
  })
  return {
    id: raw.id,
    dataUrl: bytesToDataUrl(raw.imageData),
    createdAt: raw.createdAt,
  }
}

/**
 * Delete a signature by ID.
 */
export async function deleteSignature(id: string): Promise<void> {
  await invoke('signature_delete', { id })
}
