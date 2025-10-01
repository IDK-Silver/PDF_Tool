import { onBeforeUnmount, ref, type Ref } from 'vue'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { PDFDocument } from 'pdf-lib'
import type { PdfFile } from '../../types/pdf'
import type { AppSettings } from '../persistence'
import type { PDFDocumentProxy } from '../../lib/pdfjs'
import type { PagePointerContext } from '../../types/viewer'

interface UseExportToolsOptions {
  activeFile: Ref<PdfFile | null>
  settings: Ref<AppSettings>
  pdfDoc: Ref<unknown>
  normalizeError: (error: unknown) => string
}

type Banner = { kind: 'success' | 'error'; text: string }

export function useExportTools(options: UseExportToolsOptions) {
  const exporting = ref(false)
  const exportBanner = ref<Banner | null>(null)
  let bannerTimer: ReturnType<typeof setTimeout> | null = null

  function resetExportState() {
    exporting.value = false
    exportBanner.value = null
    if (bannerTimer) {
      clearTimeout(bannerTimer)
      bannerTimer = null
    }
  }

  function showBanner(kind: Banner['kind'], text: string, durationMs = 2000) {
    if (bannerTimer) {
      clearTimeout(bannerTimer)
      bannerTimer = null
    }
    exportBanner.value = { kind, text }
    bannerTimer = setTimeout(() => {
      exportBanner.value = null
      bannerTimer = null
    }, durationMs)
  }

  function stripExtension(name: string) {
    const lastDot = name.lastIndexOf('.')
    return lastDot > 0 ? name.slice(0, lastDot) : name
  }

  async function openActiveFileInFolder() {
    const path = options.activeFile.value?.path
    if (!path) return
    try {
      await revealItemInDir(path)
    } catch (error) {
      console.error('[useExportTools] Failed to reveal file in folder:', error)
      showBanner('error', '無法開啟資料夾，請稍後再試')
    }
  }

  async function getImageAsCanvas(path: string): Promise<HTMLCanvasElement> {
    const bytes = await readFile(path)
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)
    const blob = new Blob([data])
    const url = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('圖片載入失敗'))
        el.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('無法建立 Canvas')
      ctx.drawImage(img, 0, 0)
      return canvas
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  function getPdfDoc(): PDFDocumentProxy | null {
    return (options.pdfDoc.value as PDFDocumentProxy | null) ?? null
  }

  async function exportCurrentImageAsPng(_context: PagePointerContext) {
    const file = options.activeFile.value
    if (!file?.path) return
    exporting.value = true
    exportBanner.value = null
    try {
      const canvas = await getImageAsCanvas(file.path)
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 轉換失敗'))), 'image/png')
      })
      const array = new Uint8Array(await blob.arrayBuffer())
      const defaultName = `${stripExtension(file.name)}-page001.png`
      const targetPath = await save({ defaultPath: defaultName, filters: [{ name: 'PNG', extensions: ['png'] }] })
      if (!targetPath) return
      await writeFile(targetPath, array)
      showBanner('success', `已匯出 ${defaultName}`)
    } catch (error) {
      showBanner('error', options.normalizeError(error))
    } finally {
      exporting.value = false
    }
  }

  async function exportCurrentImageAsPdf(_context: PagePointerContext) {
    const file = options.activeFile.value
    if (!file?.path) return
    exporting.value = true
    exportBanner.value = null
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      const bytes = await readFile(file.path)
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer)
      const pdf = await PDFDocument.create()
      let embedded
      if (ext === 'jpg' || ext === 'jpeg') embedded = await pdf.embedJpg(data)
      else if (ext === 'png') embedded = await pdf.embedPng(data)
      else {
        const canvas = await getImageAsCanvas(file.path)
        const blob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 轉換失敗'))), 'image/png')
        })
        embedded = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()))
      }
      const page = pdf.addPage([embedded.width, embedded.height])
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
      const pdfBytes = await pdf.save()
      const defaultName = `${stripExtension(file.name)}-page001.pdf`
      const targetPath = await save({ defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!targetPath) return
      await writeFile(targetPath, new Uint8Array(pdfBytes))
      showBanner('success', `已匯出 ${defaultName}`)
    } catch (error) {
      showBanner('error', options.normalizeError(error))
    } finally {
      exporting.value = false
    }
  }

  async function exportCurrentPage(context: PagePointerContext) {
    const doc = getPdfDoc()
    if (!doc || !options.activeFile.value) return
    exporting.value = true
    exportBanner.value = null
    try {
      const page = await doc.getPage(context.pageNumber)
      const DPI = options.settings.value.exportDpi || 300
      const viewport = page.getViewport({ scale: DPI / 72 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('無法建立 Canvas 以匯出圖片')
      await page.render({ canvas, canvasContext: ctx, viewport }).promise

      const type = options.settings.value.exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
      const quality = options.settings.value.exportFormat === 'jpeg' ? options.settings.value.jpegQuality ?? 0.9 : undefined
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
      if (!blob) throw new Error('圖片轉換失敗')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const ext = options.settings.value.exportFormat === 'jpeg' ? 'jpg' : 'png'
      const defaultName = `${stripExtension(options.activeFile.value.name)}-page${String(context.pageNumber).padStart(3, '0')}.${ext}`
      const targetPath = await save({
        defaultPath: defaultName,
        filters: [
          options.settings.value.exportFormat === 'jpeg'
            ? { name: 'JPEG', extensions: ['jpg', 'jpeg'] }
            : { name: 'PNG', extensions: ['png'] },
        ],
      })
      if (!targetPath) return
      await writeFile(targetPath, bytes)
      showBanner('success', `已匯出 ${defaultName}`)
    } catch (error) {
      showBanner('error', options.normalizeError(error))
    } finally {
      exporting.value = false
    }
  }

  async function exportCurrentPageAsPdf(context: PagePointerContext) {
    const file = options.activeFile.value
    if (!file?.path) return
    exporting.value = true
    exportBanner.value = null
    try {
      const srcBytes = await readFile(file.path)
      const srcPdf = await PDFDocument.load(srcBytes as ArrayBuffer | Uint8Array)
      const dstPdf = await PDFDocument.create()
      const [copied] = await dstPdf.copyPages(srcPdf, [Math.max(0, context.pageNumber - 1)])
      dstPdf.addPage(copied)
      const outBytes = await dstPdf.save()
      const defaultName = `${stripExtension(file.name)}-page${String(context.pageNumber).padStart(3, '0')}.pdf`
      const targetPath = await save({ defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!targetPath) return
      await writeFile(targetPath, new Uint8Array(outBytes))
      showBanner('success', `已匯出 ${defaultName}`)
    } catch (error) {
      showBanner('error', options.normalizeError(error))
    } finally {
      exporting.value = false
    }
  }

  onBeforeUnmount(() => {
    if (bannerTimer) {
      clearTimeout(bannerTimer)
      bannerTimer = null
    }
  })

  return {
    exporting,
    exportBanner,
    showBanner,
    resetExportState,
    openActiveFileInFolder,
    exportCurrentPage,
    exportCurrentPageAsPdf,
    exportCurrentImageAsPng,
    exportCurrentImageAsPdf,
  }
}
