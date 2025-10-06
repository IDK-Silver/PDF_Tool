import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FileItem } from '@/components/FileList/types'
import type { MediaDescriptor, PageRender } from './types'
import { analyzeMedia, pdfInfo, pdfRenderPage, toContentUrl } from './service'

export const useMediaStore = defineStore('media', () => {
  const selected = ref<FileItem | null>(null)
  const descriptor = ref<MediaDescriptor | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Derived helpers
  // 影像顯示 URL：優先使用 in-memory blob，其次 asset 協定
  const imageObjectUrl = ref<string | null>(null)
  const imageUrl = computed(() => {
    const d = descriptor.value
    if (!d || d.type !== 'image') return null
    return imageObjectUrl.value || toContentUrl(d.path)
  })

  const pdfFirstPage = ref<PageRender | null>(null)
  const pdfPages = ref<Array<PageRender | null>>([])

  async function select(item: FileItem) {
    selected.value = item
    await loadDescriptor(item.path)
  }

  async function selectPath(path: string) {
    selected.value = { id: path, name: path.split('/').pop() || path, path }
    await loadDescriptor(path)
  }

  async function loadDescriptor(path: string) {
    loading.value = true
    error.value = null
    descriptor.value = null
    pdfFirstPage.value = null
    pdfPages.value = []
    // 釋放舊 PDF blob URLs
    try {
      for (const p of pdfPages.value) {
        if (p && p.contentUrl) URL.revokeObjectURL(p.contentUrl)
      }
    } catch (_) {}
    // 清除舊的 blob
    if (imageObjectUrl.value) {
      URL.revokeObjectURL(imageObjectUrl.value)
      imageObjectUrl.value = null
    }
    try {
      const d = await analyzeMedia(path)
      descriptor.value = d
      if (d.type === 'image') {
        // 直接以 RAM bytes 建立 blob URL（避免 asset://）
        await fallbackLoadImageBlob()
      } else if (d.type === 'pdf') {
        await ensurePdfFirstPage()
        // 載入所有頁（簡版）：取得頁數後逐頁渲染
        await loadAllPdfPages()
      }
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  function guessMime(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg'
      case 'png':
        return 'image/png'
      case 'webp':
        return 'image/webp'
      case 'gif':
        return 'image/gif'
      case 'bmp':
        return 'image/bmp'
      case 'tif':
      case 'tiff':
        return 'image/tiff'
      default:
        return 'application/octet-stream'
    }
  }

  // 失敗時從檔案系統讀 bytes，建立 blob URL
  async function fallbackLoadImageBlob() {
    const d = descriptor.value
    if (!d || d.type !== 'image') return
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const bytes = await readFile(d.path)
      const mime = guessMime(d.path)
      const blob = new Blob([bytes], { type: mime })
      const url = URL.createObjectURL(blob)
      imageObjectUrl.value = url
    } catch (e: any) {
      error.value = e?.message || String(e)
    }
  }

  async function ensurePdfFirstPage() {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return
    // lazy init & basic fetch
    const info = await pdfInfo(d.path)
    descriptor.value = { ...d, pages: info.pages }
    const page0 = await pdfRenderPage({ path: d.path, pageIndex: 0, scale: 1.0, format: 'png' })
    pdfFirstPage.value = page0
  }

  async function loadAllPdfPages() {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return
    const total = d.pages ?? (await pdfInfo(d.path)).pages
    pdfPages.value = Array.from({ length: total }, () => null)

    // 簡單序列化載入，避免一次性佔用過多記憶體
    for (let i = 0; i < total; i++) {
      try {
        const p = await pdfRenderPage({ path: d.path, pageIndex: i, scale: 1.0, format: 'png' })
        // 仍保持第一頁引用
        if (i === 0) pdfFirstPage.value = p
        // 設定對應索引
        pdfPages.value[i] = p
      } catch (e: any) {
        console.warn('渲染頁面失敗', i, e)
      }
    }
  }

  function clear() {
    selected.value = null
    descriptor.value = null
    // 釋放 blob URLs
    if (imageObjectUrl.value) {
      URL.revokeObjectURL(imageObjectUrl.value)
      imageObjectUrl.value = null
    }
    try {
      for (const p of pdfPages.value) {
        if (p && p.contentUrl) URL.revokeObjectURL(p.contentUrl)
      }
    } catch (_) {}
    pdfFirstPage.value = null
    error.value = null
    loading.value = false
    pdfPages.value = []
  }

  return {
    // state
    selected,
    descriptor,
    loading,
    error,
    pdfFirstPage,
    pdfPages,
    // getters
    imageUrl,
    imageObjectUrl,
    // actions
    select,
    selectPath,
    loadDescriptor,
    ensurePdfFirstPage,
    loadAllPdfPages,
    fallbackLoadImageBlob,
    clear,
  }
})
