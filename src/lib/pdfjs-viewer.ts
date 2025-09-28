// Lazy-load pdfjs viewer after ensuring pdfjsLib is set on globalThis.
// This avoids runtime errors in pdf_viewer that destructure from globalThis.pdfjsLib.

let viewerPromise: Promise<any> | null = null

export async function loadPdfViewer() {
  if (!viewerPromise) {
    const pdfjsLib = await import('pdfjs-dist/build/pdf')
    ;(globalThis as any).pdfjsLib = pdfjsLib
    viewerPromise = import('pdfjs-dist/web/pdf_viewer')
  }
  return viewerPromise
}

