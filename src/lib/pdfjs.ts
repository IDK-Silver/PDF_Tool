import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist'
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
  RenderParameters,
} from 'pdfjs-dist/types/src/display/api'
import Worker from 'pdfjs-dist/build/pdf.worker?worker'

// Ensure a single worker instance for the entire app.
if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerPort) {
  GlobalWorkerOptions.workerPort = new Worker()
}

export { getDocument, GlobalWorkerOptions, version }
export type { PDFDocumentProxy, PDFPageProxy, RenderTask, RenderParameters }
