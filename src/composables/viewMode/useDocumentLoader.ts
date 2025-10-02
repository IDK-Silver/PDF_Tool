import { markRaw, ref } from 'vue'
import { readFile } from '@tauri-apps/plugin-fs'
import { getDocument, type PDFDocumentProxy } from '../../lib/pdfjs'

export function useDocumentLoader() {
  const pdfDoc = ref<PDFDocumentProxy | null>(null)
  const loading = ref(false)
  const viewerError = ref<string | null>(null)
  const pageCount = ref(0)

  function normalizeError(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }

  async function destroyCurrentDoc() {
    const doc = pdfDoc.value
    if (!doc) return
    pdfDoc.value = null
    pageCount.value = 0
    try {
      await doc.destroy()
    } catch {
      // ignore
    }
  }

  async function loadDocumentFromPath(path: string): Promise<PDFDocumentProxy> {
    const bytes = await readFile(path)
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)
    const loadingTask = getDocument({ data })
    const doc = await loadingTask.promise as unknown as PDFDocumentProxy
    return markRaw(doc) as PDFDocumentProxy
  }

  function setDocument(doc: PDFDocumentProxy | null, count = 0) {
    pdfDoc.value = doc
    pageCount.value = count
  }

  return {
    pdfDoc,
    loading,
    viewerError,
    pageCount,
    normalizeError,
    destroyCurrentDoc,
    loadDocumentFromPath,
    setDocument,
  }
}
