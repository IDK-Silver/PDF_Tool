import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FileItem } from '@/components/FileList/types'
import type { MediaDescriptor, PageRender } from './types'
import { analyzeMedia, imageRead, pdfRenderPage, pdfOpen, pdfClose, pdfPageSize, pdfRenderCancel, pdfSave } from './service'
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
  const inflightCount = ref(0)
  const queue = ref<Array<{ index: number; targetWidth?: number; dpi?: number; format: 'png'|'jpeg'|'webp'|'raw'; isLowRes?: boolean }>>([])
  const settings = useSettingsStore()
  const pdfInflight = new Set<number>()
  const pageGen = ref<Record<number, number>>({})
  const priorityIndex = ref(0)
  // 雙快取策略：追蹤高解析度頁面用於 LRU 淘汰（動態上限）
  const highResPages = new Set<number>()
  const getMaxHiResCache = () => settings.s.renderFormat === 'raw' ? settings.s.rawHighResCacheSize : 50
  let evictCounter = 0  // 批次淘汰計數器
  
  // Batch DOM-reactive updates to next animation frame to reduce jank
  let applyScheduled = false
  const pendingApply: Array<{ idx: number; page: PageRender; isLowRes: boolean }> = []
  function scheduleApplyFrame() {
    if (applyScheduled) return
    applyScheduled = true
    requestAnimationFrame(() => {
      applyScheduled = false
      // apply in order; revoke old blobs to avoid leaks
      while (pendingApply.length) {
        const { idx, page, isLowRes } = pendingApply.shift()!
        const old = pdfPages.value[idx]
        
        if (isLowRes) {
          // 低解析度：只更新 lowResUrl，保留 highResUrl
          if (old) {
            pdfPages.value[idx] = {
              ...old,
              lowResUrl: page.contentUrl,
              isLowRes: !old.highResUrl, // 若無高清則標記為低解析度狀態
            }
          } else {
            pdfPages.value[idx] = {
              ...page,
              lowResUrl: page.contentUrl,
              isLowRes: true,
            }
          }
        } else {
          // 高解析度：更新 highResUrl，保留 lowResUrl
          if (old?.highResUrl && old.highResUrl !== page.contentUrl) {
            try { URL.revokeObjectURL(old.highResUrl) } catch {}
          }
          pdfPages.value[idx] = {
            ...(old || page),
            ...page,
            highResUrl: page.contentUrl,
            lowResUrl: old?.lowResUrl, // 保留原有低解析度
            isLowRes: false,
          }
          highResPages.add(idx)
        }
        
        if (idx === 0) pdfFirstPage.value = pdfPages.value[0]
      }
    })
  }

  function nextGen(idx: number) {
    const g = (pageGen.value[idx] || 0) + 1
    pageGen.value[idx] = g
    return g
  }

  function enqueueJob(index: number, targetWidth: number | undefined, format: 'png'|'jpeg'|'webp'|'raw', dpi?: number, isLowRes = false) {
    // 同頁只保留最新需求（無論寬度或 dpi），避免重複入隊
    queue.value = queue.value.filter(j => j.index !== index || j.isLowRes !== isLowRes)
    queue.value.push({ index, targetWidth, dpi, format, isLowRes })
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
    selected.value = { id: path, name: path.split('/').pop() || path, path }
    await loadDescriptor(path)
  }

  async function loadDescriptor(path: string) {
    loading.value = true
    error.value = null
    descriptor.value = null
    pdfFirstPage.value = null
    pdfPages.value = []
    // 切換或重新載入文件時，未儲存變更不再有效（舊 session 會被關閉）
    dirty.value = false
    // 關閉上一份文件 session
    if (docId.value != null) {
      try { await pdfClose(docId.value) } catch(_) {}
      docId.value = null
    }
    // 釋放舊 PDF blob URLs（雙快取）
    try {
      for (const p of pdfPages.value) {
        if (p?.contentUrl) URL.revokeObjectURL(p.contentUrl)
        if (p?.lowResUrl) URL.revokeObjectURL(p.lowResUrl)
        if (p?.highResUrl) URL.revokeObjectURL(p.highResUrl)
      }
    } catch (_) {}
    highResPages.clear()
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
        
        // 雙階段載入第 0 頁：先低解析度，再高解析度
        const containerWidth = 800
        
        // 低解析度（72dpi，快速）
        const lowRes = await pdfRenderPage({ 
          docId: opened.docId, 
          pageIndex: 0, 
          targetWidth: 600, 
          format: 'jpeg',
          quality: 60
        })
        pdfPages.value[0] = {
          ...lowRes,
          lowResUrl: lowRes.contentUrl,
          isLowRes: true,
        }
        pdfFirstPage.value = pdfPages.value[0]
        
        // 高解析度（異步，不阻塞）
        pdfRenderPage({ 
          docId: opened.docId, 
          pageIndex: 0, 
          targetWidth: containerWidth, 
          format: settings.s.renderFormat 
        }).then(highRes => {
          const existing = pdfPages.value[0]
          pdfPages.value[0] = {
            ...existing,
            ...highRes,
            highResUrl: highRes.contentUrl,
            lowResUrl: existing?.lowResUrl,
            isLowRes: false,
          }
          pdfFirstPage.value = pdfPages.value[0]
          highResPages.add(0)
        }).catch(e => console.warn('第 0 頁高解析度載入失敗', e))
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
    
    // 1. 若無低解析度，立即請求（可選關閉低清，直接高清）
    if (settings.s.enableLowRes && !existing?.lowResUrl && !pdfInflight.has(index)) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      
      // 🔵 從 Settings 讀取低清 DPI（大頁面用專屬設定）
      const isLargePage = size && (size.widthPt > 650 || size.heightPt > 900) // A3: 842×1191pt
      let baseLowResDpi = isLargePage ? settings.s.largePageLowResDpi : settings.s.lowResDpi
      
      // 🔵 可選：低清也考慮 DPR（Retina 螢幕適配）
      if (settings.s.useLowResDpr) {
        const dpr = Math.min(window.devicePixelRatio || 1, settings.s.dprCap)
        const dprMultiplier = settings.s.lowResDprMultiplier || 1.0
        baseLowResDpi = Math.round(baseLowResDpi * Math.min(dpr, dprMultiplier))
      }
      
      const lowResWidth = size ? Math.floor(size.widthPt * baseLowResDpi / 72) : 500
      
      enqueueJob(index, lowResWidth, 'raw', undefined, true)  // ⚡ 低清固定用 raw（零編碼）
    }
    
    // 2. 若已有高解析度且解析度足夠則略過
    let requiredWidth: number | null = null
    if (typeof targetWidth === 'number' && targetWidth > 0) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      if (size) {
        // 🎯 從 targetWidth 反推 DPI，並套用 DPI 上限
        const impliedDpi = (targetWidth * 72) / size.widthPt
        let cappedDpi = Math.min(impliedDpi, settings.s.highResDpiCap)
        
        // ⚡ 大頁面額外限制
        const isLargePage = size.widthPt > 650 || size.heightPt > 900
        if (isLargePage) {
          cappedDpi = Math.min(cappedDpi, 96)
        }
        
        requiredWidth = Math.floor(size.widthPt * cappedDpi / 72)
      } else {
        requiredWidth = targetWidth
      }
    } else if (typeof dpi === 'number' && dpi > 0) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      if (size) {
        // ⚡ 套用高清 DPI 上限（防卡頓）
        let cappedDpi = Math.min(dpi, settings.s.highResDpiCap)
        
        // ⚡ 大頁面額外限制（雙重保險）
        const isLargePage = size && (size.widthPt > 650 || size.heightPt > 900)
        if (isLargePage) {
          cappedDpi = Math.min(cappedDpi, 96)  // 大頁面絕對不超過 96dpi
        }
        
        requiredWidth = Math.max(1, Math.floor(size.widthPt * cappedDpi / 72))
      }
    }
    if (existing?.highResUrl && requiredWidth != null && (existing.widthPx >= requiredWidth)) return
    
    // 3. 請求高解析度（根據設定選擇格式）
    if (!pdfInflight.has(index)) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      const isLargePage = size && (size.widthPt > 650 || size.heightPt > 900)
      
      let finalFormat: 'png'|'jpeg'|'webp'|'raw'
      const userFormat = format ?? settings.s.renderFormat
      if (userFormat === 'raw') {
        finalFormat = 'raw'
      } else if (isLargePage && userFormat !== 'jpeg') {
        finalFormat = 'jpeg'
      } else {
        finalFormat = userFormat
      }
      
      enqueueJob(index, targetWidth, finalFormat, dpi, false)
    }
    
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
      const isLowRes = job.isLowRes ?? false
      if (pdfInflight.has(idx)) continue
      const d = descriptor.value
      if (!d || d.type !== 'pdf') return
      if (docId.value == null) { continue }
      pdfInflight.add(idx)
      inflightCount.value++
      const q = (job.format === 'jpeg') 
        ? (isLowRes ? 65 : 82)  // 低清 JPEG 65（極速），高清 JPEG 82（平衡品質與速度）
        : (job.format === 'webp')
        ? 85  // WebP 統一品質 85
        : (job.format === 'png'
          ? (settings.s.pngCompression === 'fast' ? 25 : settings.s.pngCompression === 'best' ? 100 : 50)
          : undefined)
      const gen = nextGen(idx)
      pdfRenderPage({ docId: docId.value!, pageIndex: idx, targetWidth: job.targetWidth, dpi: job.dpi, format: job.format, quality: q, gen })
        .then(p => {
          // 只在世代一致時套用，避免過期回應覆蓋
          if (pageGen.value[idx] === gen) {
            pendingApply.push({ idx, page: p, isLowRes })
            scheduleApplyFrame()
            
            // 高解析度完成後執行 LRU 淘汰（批次優化：每 3 次執行一次）
            if (!isLowRes) {
              if (++evictCounter % 3 === 0) {
                evictHighResCache()
              }
            }
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
          isLowRes: !!page.lowResUrl, // 若有低解析度則標記回低解析度狀態
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
    try {
      for (const p of pdfPages.value) {
        if (p?.contentUrl) URL.revokeObjectURL(p.contentUrl)
        if (p?.lowResUrl) URL.revokeObjectURL(p.lowResUrl)
        if (p?.highResUrl) URL.revokeObjectURL(p.highResUrl)
      }
    } catch (_) {}
    pdfFirstPage.value = null
    error.value = null
    loading.value = false
    pdfPages.value = []
    pageSizesPt.value = {}
    highResPages.clear()
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
    dirty,
    inflightCount,
    queue,
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
    markDirty,
    clearDirty,
  }
})
