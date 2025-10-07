import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FileItem } from '@/components/FileList/types'
import type { MediaDescriptor, PageRender } from './types'
import { analyzeMedia, pdfRenderPage, pdfOpen, pdfClose } from './service'
import { useSettingsStore } from '@/modules/settings/store'

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
    return imageObjectUrl.value
  })

  const pdfFirstPage = ref<PageRender | null>(null)
  const pdfPages = ref<Array<PageRender | null>>([])
  const docId = ref<number | null>(null)
  const inflightCount = ref(0)
  const queue = ref<Array<{ index: number; targetWidth?: number; format: 'png'|'jpeg'|'webp' }>>([])
  const settings = useSettingsStore()
  const pdfInflight = new Set<number>()
  const pageGen = ref<Record<number, number>>({})

  function nextGen(idx: number) {
    const g = (pageGen.value[idx] || 0) + 1
    pageGen.value[idx] = g
    return g
  }

  function enqueueJob(index: number, targetWidth: number | undefined, format: 'png'|'jpeg'|'webp') {
    // 若同頁已有較小需求，替換為較大需求；避免同頁重複入隊
    queue.value = queue.value.filter(j => !(j.index === index && (targetWidth || 0) >= (j.targetWidth || 0)))
    queue.value.push({ index, targetWidth, format })
    // 控制隊列上限，避免暴增
    if (queue.value.length > 100) {
      queue.value.splice(0, queue.value.length - 100)
    }
  }

  function cancelQueued(index: number) {
    queue.value = queue.value.filter(j => j.index !== index)
  }

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
    // 關閉上一份文件 session
    if (docId.value != null) {
      try { await pdfClose(docId.value) } catch(_) {}
      docId.value = null
    }
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
        // 開啟 session
        const opened = await pdfOpen(d.path)
        docId.value = opened.docId
        descriptor.value = { ...d, pages: opened.pages }
        // 初始化頁框
        pdfPages.value = Array.from({ length: opened.pages }, () => null)
        // 預先載入第 0 頁（低清→高清依設定）
        const containerWidth = 800 // 粗略預設，實際由 MediaView 觸發懶載入補上高清
        if (settings.s.lowQualityFirst) {
          const low = await pdfRenderPage({ path: d.path, docId: opened.docId, pageIndex: 0, targetWidth: Math.floor(containerWidth * settings.s.lowQualityScale), format: settings.s.lowQualityFormat })
          pdfFirstPage.value = low
          pdfPages.value[0] = low
        } else {
          const full = await pdfRenderPage({ path: d.path, docId: opened.docId, pageIndex: 0, targetWidth: containerWidth, format: settings.s.highQualityFormat })
          pdfFirstPage.value = full
          pdfPages.value[0] = full
        }
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
    // 已在 loadDescriptor 中處理 pdfOpen 與第 0 頁
  }

  async function renderPdfPage(index: number, targetWidth?: number, format: 'png'|'jpeg'|'webp' = 'png', _quality?: number) {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return
    if (index < 0) return
    // 若已有且目標寬度不大於現有寬度則略過
    if (pdfPages.value[index] && targetWidth && (pdfPages.value[index]!.widthPx >= targetWidth)) return
    if (pdfInflight.has(index)) return
    // 進入佇列由 processQueue 控制並行數（去重與較大優先）
    enqueueJob(index, targetWidth, format)
    processQueue()
  }

  async function processQueue() {
    const max = Math.max(1, settings.s.maxConcurrentRenders)
    while (inflightCount.value < max && queue.value.length > 0) {
      const job = queue.value.shift()!
      const idx = job.index
      if (pdfInflight.has(idx)) continue
      const d = descriptor.value
      if (!d || d.type !== 'pdf') return
      pdfInflight.add(idx)
      inflightCount.value++
      const q = (job.format === 'jpeg') ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100)
      const gen = nextGen(idx)
      pdfRenderPage({ path: d.path, docId: docId.value ?? undefined, pageIndex: idx, targetWidth: job.targetWidth, format: job.format, quality: q })
        .then(p => {
          // 只在世代一致時套用，避免過期回應覆蓋
          if (pageGen.value[idx] === gen) {
            // 若已有更大寬度的圖片，避免回退
            if (!pdfPages.value[idx] || (p.widthPx >= (pdfPages.value[idx]!.widthPx || 0))) {
              pdfPages.value[idx] = p
              if (idx === 0) pdfFirstPage.value = p
            } else if (p.contentUrl) {
              URL.revokeObjectURL(p.contentUrl)
            }
          } else if (p.contentUrl) {
            URL.revokeObjectURL(p.contentUrl)
          }
        })
        .catch(e => console.warn('渲染頁面失敗', idx, e))
        .finally(() => {
          pdfInflight.delete(idx)
          inflightCount.value--
          processQueue()
        })
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
    docId,
    inflightCount,
    queue,
    // getters
    imageUrl,
    imageObjectUrl,
    // actions
    select,
    selectPath,
    loadDescriptor,
    ensurePdfFirstPage,
    renderPdfPage,
    cancelQueued,
    processQueue,
    fallbackLoadImageBlob,
    clear,
  }
})
