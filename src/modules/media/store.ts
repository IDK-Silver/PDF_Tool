import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FileItem } from '@/components/FileList/types'
import type { MediaDescriptor, PageRender, PageTextContent } from './types'
import { analyzeMedia, imageRead, pdfRenderPage, pdfOpen, pdfClose, pdfPageSize, pdfRenderCancel, pdfSave, pdfGetPageText } from './service'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import { save as saveDialog, confirm as confirmDialog } from '@tauri-apps/plugin-dialog'
import { dirname, join } from '@tauri-apps/api/path'

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
  const dirty = ref(false)
  const pageSizesPt = ref<Record<number, { widthPt: number; heightPt: number }>>({})
  const pageText = ref<Record<number, PageTextContent | null>>({})
  const inflightCount = ref(0)
  const queue = ref<Array<{ index: number; targetWidth?: number; dpi?: number; format: 'png'|'jpeg'|'webp'|'raw' }>>([])
  const settings = useSettingsStore()
  const pdfInflight = new Set<number>()
  const pageGen = ref<Record<number, number>>({})
  const renderSessionId = ref(0)
  const priorityIndex = ref(0)
  // 雙快取策略：追蹤高解析度頁面用於 LRU 淘汰（動態上限）
  const highResPages = new Set<number>()
  const getMaxHiResCache = () => settings.s.renderFormat === 'raw' ? settings.s.rawHighResCacheSize : 50
  let evictCounter = 0  // 批次淘汰計數器
  
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
        if (page.format === 'raw') {
          // 高解析度 raw：直接以 raw 畫布呈現
          pdfPages.value[idx] = {
            ...(old || page),
            ...page,
            rawImageData: page.rawImageData,
          }
          highResPages.add(idx)
        } else {
          if (old?.highResUrl && old.highResUrl !== page.contentUrl) {
            try { URL.revokeObjectURL(old.highResUrl) } catch {}
          }
          pdfPages.value[idx] = {
            ...(old || page),
            ...page,
            highResUrl: page.contentUrl,
          }
          highResPages.add(idx)
        }
        if (idx === 0) pdfFirstPage.value = pdfPages.value[0]
      }
    })
  }

  function resetRenderPipeline() {
    renderSessionId.value += 1
    queue.value = []
    inflightCount.value = 0
    pdfInflight.clear()
    pageGen.value = {}
    pendingApply.length = 0
    applyScheduled = false
    evictCounter = 0
    priorityIndex.value = 0
  }

  function releasePdfPages() {
    try {
      for (const p of pdfPages.value) {
        if (p?.contentUrl) URL.revokeObjectURL(p.contentUrl)
        if (p?.highResUrl) URL.revokeObjectURL(p.highResUrl)
        if (p) (p as any).rawImageData = undefined
      }
    } catch (_) {}
  }

  function resetPdfState() {
    releasePdfPages()
    pdfFirstPage.value = null
    pdfPages.value = []
    pageSizesPt.value = {}
    pageText.value = {}
    highResPages.clear()
  }

  function nextGen(idx: number) {
    const g = (pageGen.value[idx] || 0) + 1
    pageGen.value[idx] = g
    return g
  }

  function enqueueJob(index: number, targetWidth: number | undefined, format: 'png'|'jpeg'|'webp'|'raw', dpi?: number) {
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
    const path = item.path
    if (!(await ensureCanSwitch(path))) return
    selected.value = item
    await loadDescriptor(path)
  }

  async function selectPath(path: string) {
    if (!(await ensureCanSwitch(path))) return
    try { useFileListStore().add(path) } catch {}
    selected.value = { id: path, name: path.split('/').pop() || path, path }
    await loadDescriptor(path)
  }

  async function loadDescriptor(path: string) {
    loading.value = true
    error.value = null
    resetRenderPipeline()
    resetPdfState()
    descriptor.value = null
    // 切換或重新載入文件時，未儲存變更不再有效（舊 session 會被關閉）
    dirty.value = false
    // 關閉上一份文件 session
    if (docId.value != null) {
      try { await pdfClose(docId.value) } catch(_) {}
      docId.value = null
    }
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
        highResPages.clear()
        // 預先載入第 0 頁的 pt 尺寸，確保頁面能正確計算寬高
        try {
          const size0 = await pdfPageSize(opened.docId, 0)
          pageSizesPt.value[0] = { widthPt: size0.widthPt, heightPt: size0.heightPt }
        } catch (_) { /* 容錯：若失敗，後續會再嘗試 */ }
        // 直接載入第 0 頁高清內容（RAW 預設足夠快速）
        const containerWidth = 800
        const fmt = settings.s.renderFormat
        const q = fmt === 'jpeg' ? 82 : (fmt === 'webp' ? 85 : (fmt === 'png' ? (settings.s.pngCompression === 'fast' ? 25 : settings.s.pngCompression === 'best' ? 100 : 50) : undefined))
        const hi = await pdfRenderPage({ docId: opened.docId, pageIndex: 0, targetWidth: containerWidth, format: fmt, quality: q })
        if (hi.format === 'raw') {
          pdfPages.value[0] = { ...hi, rawImageData: hi.rawImageData }
        } else {
          pdfPages.value[0] = { ...hi, highResUrl: hi.contentUrl }
        }
        pdfFirstPage.value = pdfPages.value[0]
        highResPages.add(0)
      }
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function closeDoc() {
    if (docId.value != null) {
      try { await pdfClose(docId.value) } catch (_) {}
      docId.value = null
    }
  }

  function markDirty() { dirty.value = true }
  function clearDirty() { dirty.value = false }

  // 儲存目前文件（若是 PDF 且有變更）。拋出例外代表使用者取消或失敗。
  async function saveCurrentIfNeeded(): Promise<void> {
    const d = descriptor.value
    const id = docId.value
    if (!dirty.value) return
    if (!d || d.type !== 'pdf' || id == null) return
    const filelist = useFileListStore()
    const del = settings.s.deleteBehavior
    if (del === 'saveAsNew') {
      const base = (d.name?.replace(/\.pdf$/i, '') || 'output') + ' (edited).pdf'
      const dir = await dirname(d.path)
      const suggested = await join(dir, base)
      const picked = await saveDialog({ defaultPath: suggested, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!picked) throw new Error('SAVE_CANCELLED')
      const res = await pdfSave({ docId: id, destPath: picked, overwrite: true })
      try { filelist.add(res.path) } catch {}
      descriptor.value = { ...d, path: res.path, pages: res.pages } as any
      dirty.value = false
    } else {
      const res = await pdfSave({ docId: id, overwrite: true })
      descriptor.value = { ...d, path: res.path, pages: res.pages } as any
      dirty.value = false
    }
  }

  // 確認是否允許切換到另一個檔案/路徑。會處理儲存/放棄/取消三態。
  async function ensureCanSwitch(nextPath: string): Promise<boolean> {
    if (!dirty.value) return true
    if (selected.value?.path === nextPath) return true
    // Step 1: 詢問是否先儲存
    const wantsSave = await confirmDialog('此文件有未儲存變更，是否先儲存？', {
      title: '未儲存的變更',
      okLabel: '儲存',
      cancelLabel: '不儲存',
    })
    if (wantsSave) {
      try {
        await saveCurrentIfNeeded()
        return true
      } catch (e: any) {
        // 使用者取消了存檔
        return false
      }
    }
    // Step 2: 不儲存 → 再次確認是否放棄變更
    const discard = await confirmDialog('放棄變更並繼續切換？', {
      title: '放棄變更',
      okLabel: '放棄',
      cancelLabel: '取消',
    })
    if (discard) {
      // 放棄變更：直接清除 dirty
      dirty.value = false
      return true
    }
    return false
  }

  // 從後端讀取圖片 bytes 並建立 blob URL
  async function fallbackLoadImageBlob() {
    const d = descriptor.value
    if (!d || d.type !== 'image') return
    try {
      const result = await imageRead(d.path)
      const bytes = new Uint8Array(result.imageBytes)
      const blob = new Blob([bytes], { type: result.mimeType })
      const url = URL.createObjectURL(blob)
      imageObjectUrl.value = url
      
      // 更新 descriptor 的寬高資訊
      if (descriptor.value) {
        descriptor.value = {
          ...descriptor.value,
          width: result.width,
          height: result.height,
        }
      }
    } catch (e: any) {
      error.value = e?.message || String(e)
    }
  }

  async function ensurePdfFirstPage() {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return
    // 已在 loadDescriptor 中處理 pdfOpen 與第 0 頁
  }

  async function renderPdfPage(index: number, targetWidth?: number, format?: 'png'|'jpeg'|'webp'|'raw', _quality?: number, dpi?: number) {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return
    if (index < 0) return
    
    const existing = pdfPages.value[index]
    
    // 若已有高解析度且解析度足夠則略過
    let requiredWidth: number | null = null
    if (typeof targetWidth === 'number' && targetWidth > 0) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      if (size) {
        // 🎯 從 targetWidth 反推 DPI，僅套用使用者設定的上限
        const impliedDpi = (targetWidth * 72) / size.widthPt
        const cappedDpi = Math.min(impliedDpi, settings.s.highResDpiCap)
        requiredWidth = Math.floor(size.widthPt * cappedDpi / 72)
      } else {
        requiredWidth = targetWidth
      }
    } else if (typeof dpi === 'number' && dpi > 0) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      if (size) {
        // ⚡ 套用高清 DPI 上限（防卡頓），不再有大頁面 96dpi 限制
        const cappedDpi = Math.min(dpi, settings.s.highResDpiCap)
        requiredWidth = Math.max(1, Math.floor(size.widthPt * cappedDpi / 72))
      }
    }
    if (requiredWidth != null) {
      const hasHiResUrl = !!(existing?.highResUrl) && (existing!.widthPx >= requiredWidth)
      const hasHiResRaw = (existing?.format === 'raw') && !!(existing as any)?.rawImageData && (existing!.widthPx >= requiredWidth)
      if (hasHiResUrl || hasHiResRaw) return
    }
    
    // 請求高解析度（根據設定選擇格式）
    if (!pdfInflight.has(index)) {
      let finalFormat: 'png'|'jpeg'|'webp'|'raw'
      const userFormat = format ?? settings.s.renderFormat
      finalFormat = userFormat
      enqueueJob(index, targetWidth, finalFormat, dpi)
    }
    
    processQueue()
  }

  async function processQueue() {
    const sessionId = renderSessionId.value
    const max = Math.max(1, settings.s.maxConcurrentRenders)
    while (renderSessionId.value === sessionId && inflightCount.value < max && queue.value.length > 0) {
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
      if (docId.value == null) { continue }
      pdfInflight.add(idx)
      inflightCount.value++
      const q = (job.format === 'jpeg') 
        ? 82  // 高清 JPEG 82（平衡品質與速度）
        : (job.format === 'webp')
        ? 85  // WebP 統一品質 85
        : (job.format === 'png'
          ? (settings.s.pngCompression === 'fast' ? 25 : settings.s.pngCompression === 'best' ? 100 : 50)
          : undefined)
      const gen = nextGen(idx)
      pdfRenderPage({ docId: docId.value!, pageIndex: idx, targetWidth: job.targetWidth, dpi: job.dpi, format: job.format, quality: q, gen })
        .then(p => {
          if (renderSessionId.value !== sessionId) {
            if (p.contentUrl) {
              try { URL.revokeObjectURL(p.contentUrl) } catch {}
            }
            return
          }
          // 只在世代一致時套用，避免過期回應覆蓋
          if (pageGen.value[idx] === gen) {
            pendingApply.push({ idx, page: p })
            scheduleApplyFrame()
            // 完成後執行 LRU 淘汰（批次優化：每 3 次執行一次）
            if (++evictCounter % 3 === 0) {
              evictHighResCache()
            }
          } else if (p.contentUrl) {
            // 過期回應，釋放本次 blob
            try { URL.revokeObjectURL(p.contentUrl) } catch {}
          }
        })
        .catch(e => {
          if (renderSessionId.value === sessionId) {
            console.warn('渲染頁面失敗', idx, e)
          }
        })
        .finally(() => {
          if (renderSessionId.value !== sessionId) return
          pdfInflight.delete(idx)
          inflightCount.value--
          processQueue()
        })
    }
  }
  
  // LRU 淘汰高解析度快取
  function evictHighResCache() {
    const maxCache = getMaxHiResCache()
    if (highResPages.size <= maxCache) return
    
    // 計算每頁與優先索引的距離
    const sorted = Array.from(highResPages).sort((a, b) => {
      const distA = Math.abs(a - priorityIndex.value)
      const distB = Math.abs(b - priorityIndex.value)
      return distB - distA // 距離遠的排前面
    })
    
    // 移除距離最遠的頁面，直到符合快取上限
    const toRemove = sorted.slice(0, sorted.length - maxCache)
    for (const idx of toRemove) {
      const page = pdfPages.value[idx]
      if (page?.highResUrl) {
        try { URL.revokeObjectURL(page.highResUrl) } catch {}
        pdfPages.value[idx] = {
          ...page,
          highResUrl: undefined,
        }
      } else if (page?.format === 'raw' && page.rawImageData) {
        // 釋放 raw 參照
        pdfPages.value[idx] = {
          ...page,
          rawImageData: undefined,
        }
      }
      highResPages.delete(idx)
    }
  }

  function setPriorityIndex(i: number) {
    priorityIndex.value = Math.max(0, Math.floor(i))
  }

  function clear() {
    selected.value = null
    descriptor.value = null
    dirty.value = false
    // 釋放 blob URLs（雙快取）
    if (imageObjectUrl.value) {
      URL.revokeObjectURL(imageObjectUrl.value)
      imageObjectUrl.value = null
    }
    resetRenderPipeline()
    resetPdfState()
    error.value = null
    loading.value = false
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

  async function getPageTextContent(index: number): Promise<PageTextContent | null> {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return null
    if (index < 0) return null
    const cached = pageText.value[index]
    if (cached) return cached
    if (docId.value == null) return null

    // Get text layer settings from settings store
    const settingsStore = useSettingsStore()
    const textLayerSettings = {
      overlapThreshold: settingsStore.s.textLayerOverlapThreshold,
      minSpacing: settingsStore.s.textLayerMinSpacing,
      smallGapThreshold: settingsStore.s.textLayerSmallGapThreshold,
      smallGapSpacing: settingsStore.s.textLayerSmallGapSpacing,
      globalOffsetX: settingsStore.s.textLayerGlobalOffsetX,
      globalOffsetY: settingsStore.s.textLayerGlobalOffsetY,
    }

    try {
      const res = await pdfGetPageText(docId.value, index, textLayerSettings)
      pageText.value = { ...pageText.value, [index]: res }
      return res
    } catch (_) {
      return null
    }
  }

  function getCachedPageText(index: number): PageTextContent | null {
    return pageText.value[index] || null
  }

  function resetPageTextCache() {
    pageText.value = {}
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
    dirty,
    inflightCount,
    queue,
    pageText,
    // getters
    imageUrl,
    imageObjectUrl,
    // actions
    select,
    selectPath,
    ensureCanSwitch,
    saveCurrentIfNeeded,
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
    closeDoc,
    pageSizesPt,
    getPageSizePt,
    baseCssWidthAt100,
    getPageTextContent,
    getCachedPageText,
    resetPageTextCache,
    markDirty,
    clearDirty,
  }
})
