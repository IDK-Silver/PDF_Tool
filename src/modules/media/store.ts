import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FileItem } from '@/components/FileList/types'
import type { MediaDescriptor, PageRender } from './types'
import { analyzeMedia, pdfRenderPage, pdfOpen, pdfClose, pdfPageSize, pdfRenderCancel } from './service'
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
  const pageSizesPt = ref<Record<number, { widthPt: number; heightPt: number }>>({})
  const inflightCount = ref(0)
  const queue = ref<Array<{ index: number; targetWidth?: number; dpi?: number; format: 'png'|'jpeg'|'webp' }>>([])
  const settings = useSettingsStore()
  const pdfInflight = new Set<number>()
  const pageGen = ref<Record<number, number>>({})
  const priorityIndex = ref(0)
  // Batch DOM-reactive updates to next animation frame to reduce jank
  let applyScheduled = false
  const pendingApply: Array<{ idx: number; page: PageRender }> = []
  function scheduleApplyFrame() {
    if (applyScheduled) return
    applyScheduled = true
    requestAnimationFrame(() => {
      applyScheduled = false
      // apply in order; revoke old blobs to avoid leaks
      while (pendingApply.length) {
        const { idx, page } = pendingApply.shift()!
        const old = pdfPages.value[idx]
        if (old?.contentUrl && old.contentUrl !== page.contentUrl) {
          try { URL.revokeObjectURL(old.contentUrl) } catch {}
        }
        pdfPages.value[idx] = page
        if (idx === 0) pdfFirstPage.value = page
      }
    })
  }

  function nextGen(idx: number) {
    const g = (pageGen.value[idx] || 0) + 1
    pageGen.value[idx] = g
    return g
  }

  function enqueueJob(index: number, targetWidth: number | undefined, format: 'png'|'jpeg'|'webp', dpi?: number) {
    // 同頁只保留最新需求（無論寬度或 dpi），避免重複入隊
    queue.value = queue.value.filter(j => j.index !== index)
    queue.value.push({ index, targetWidth, dpi, format })
    // 控制隊列上限，避免暴增
    if (queue.value.length > 100) {
      queue.value.splice(0, queue.value.length - 100)
    }
  }

  function cancelQueued(index: number) {
    queue.value = queue.value.filter(j => j.index !== index)
  }

  // Best-effort 取消：提升該頁 generation 並通知後端忽略較舊請求
  async function cancelInflight(index: number) {
    const newGen = nextGen(index)
    try { if (docId.value != null) await pdfRenderCancel(docId.value, index, newGen) } catch (_) {}
  }

  // Enforce strict visible range: drop queued jobs outside [start, end]
  // and invalidate inflight outside by bumping generation so results are ignored.
  function enforceVisibleRange(start: number, end: number) {
    queue.value = queue.value.filter(j => j.index >= start && j.index <= end)
    for (const i of pdfInflight) {
      if (i < start || i > end) {
        const g = nextGen(i)
        try { if (docId.value != null) { pdfRenderCancel(docId.value, i, g) } } catch(_) {}
      }
    }
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
        // 預先載入第 0 頁（單階段高品質）
        const containerWidth = 800 // 粗略預設，實際由 MediaView 觸發懶載入補上
        const full = await pdfRenderPage({ docId: opened.docId, pageIndex: 0, targetWidth: containerWidth, format: settings.s.highQualityFormat })
        pdfFirstPage.value = full
        pdfPages.value[0] = full
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

  async function renderPdfPage(index: number, targetWidth?: number, format: 'png'|'jpeg'|'webp' = 'png', _quality?: number, dpi?: number) {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return
    if (index < 0) return
    // 若已有且解析度已足夠則略過（targetWidth 或由 dpi 推算寬度）
    let requiredWidth: number | null = null
    if (typeof targetWidth === 'number' && targetWidth > 0) {
      requiredWidth = targetWidth
    } else if (typeof dpi === 'number' && dpi > 0) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      if (size) {
        requiredWidth = Math.max(1, Math.floor(size.widthPt * dpi / 72))
      }
    }
    if (pdfPages.value[index] && requiredWidth != null && (pdfPages.value[index]!.widthPx >= requiredWidth)) return
    if (pdfInflight.has(index)) return
    // 進入佇列由 processQueue 控制並行數（去重與較大優先）
    enqueueJob(index, targetWidth, format, dpi)
    processQueue()
  }

  async function processQueue() {
    const max = Math.max(1, settings.s.maxConcurrentRenders)
    while (inflightCount.value < max && queue.value.length > 0) {
      // Pick the job closest to current priority index (center page)
      let pickAt = 0
      if (queue.value.length > 1) {
        let best = Number.POSITIVE_INFINITY
        for (let i = 0; i < queue.value.length; i++) {
          const d = Math.abs(queue.value[i].index - priorityIndex.value)
          if (d < best) { best = d; pickAt = i }
        }
      }
      const job = queue.value.splice(pickAt, 1)[0]
      const idx = job.index
      if (pdfInflight.has(idx)) continue
      const d = descriptor.value
      if (!d || d.type !== 'pdf') return
      pdfInflight.add(idx)
      inflightCount.value++
      const q = (job.format === 'jpeg') ? settings.s.jpegQuality : (settings.s.pngFast ? 25 : 100)
      const gen = nextGen(idx)
      pdfRenderPage({ docId: docId.value ?? undefined, pageIndex: idx, targetWidth: job.targetWidth, dpi: job.dpi, format: job.format, quality: q, gen })
        .then(p => {
          // 只在世代一致時套用，避免過期回應覆蓋
          if (pageGen.value[idx] === gen) {
            pendingApply.push({ idx, page: p })
            scheduleApplyFrame()
          } else if (p.contentUrl) {
            // 過期回應，釋放本次 blob
            try { URL.revokeObjectURL(p.contentUrl) } catch {}
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

  function setPriorityIndex(i: number) {
    priorityIndex.value = Math.max(0, Math.floor(i))
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
    pageSizesPt.value = {}
  }

  async function getPageSizePt(index: number): Promise<{ widthPt: number; heightPt: number } | null> {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return null
    if (index < 0) return null
    const cached = pageSizesPt.value[index]
    if (cached) return cached
    if (docId.value == null) return null
    try {
      const res = await pdfPageSize(docId.value, index)
      pageSizesPt.value[index] = { widthPt: res.widthPt, heightPt: res.heightPt }
      return pageSizesPt.value[index]
    } catch (_) {
      return null
    }
  }

  function baseCssWidthAt100(index: number): number | null {
    const size = pageSizesPt.value[index]
    if (!size) return null
    // 96 dpi CSS width = points * 96 / 72
    return size.widthPt * (96 / 72)
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
    cancelInflight,
    enforceVisibleRange,
    processQueue,
    setPriorityIndex,
    fallbackLoadImageBlob,
    clear,
    pageSizesPt,
    getPageSizePt,
    baseCssWidthAt100,
  }
})
