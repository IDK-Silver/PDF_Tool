import { computed, proxyRefs, ref, watch, type ShallowUnwrapRef } from 'vue'
import type { FileItem } from '@/components/FileList/types'
import type { MediaDescriptor, PageRender, PageTextContent } from './types'
import {
  analyzeMedia,
  imageProbe,
  imageRead,
  pdfRenderPage,
  pdfOpen,
  pdfClose,
  pdfPageSize,
  pdfRenderCancel,
  pdfSave,
  pdfGetPageText,
  pdfUndo,
  pdfRedo,
} from './service'
import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { useSettingsStore } from '@/modules/settings/store'
import { useFileListStore } from '@/modules/filelist/store'
import { save as saveDialog, confirm as confirmDialog } from '@tauri-apps/plugin-dialog'
import { dirname, join } from '@tauri-apps/api/path'

const BYTES_PER_MB = 1024 * 1024
const MIN_RAW_CACHE_MB = 64
const MAX_RAW_CACHE_MB = 512

export function createMediaSessionController() {
  const selected = ref<FileItem | null>(null)
  const descriptor = ref<MediaDescriptor | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

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
  const revision = ref(0)
  const pageSizesPt = ref<Record<number, { widthPt: number; heightPt: number }>>({})
  const pageText = ref<Record<number, PageTextContent | null>>({})
  const inflightCount = ref(0)
  const queue = ref<Array<{ index: number; targetWidth?: number; dpi?: number; format: 'png' | 'jpeg' | 'webp' | 'raw' }>>([])
  const settings = useSettingsStore()
  const pdfInflight = new Set<number>()
  const pageGen = ref<Record<number, number>>({})
  const renderSessionId = ref(0)
  const priorityIndex = ref(0)
  const highResPages = new Set<number>()

  let applyScheduled = false
  const pendingApply: Array<{ idx: number; page: PageRender }> = []

  watch(() => settings.s.rawCacheMaxMb, () => {
    evictHighResCache()
  })

  function scheduleApplyFrame() {
    if (applyScheduled) return
    applyScheduled = true
    requestAnimationFrame(() => {
      applyScheduled = false
      while (pendingApply.length) {
        const { idx, page } = pendingApply.shift()!
        const old = pdfPages.value[idx]
        if (page.format === 'raw') {
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
      evictHighResCache()
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

  function clearImageUrl() {
    if (imageObjectUrl.value?.startsWith('blob:')) {
      try { URL.revokeObjectURL(imageObjectUrl.value) } catch {}
    }
    imageObjectUrl.value = null
  }

  async function loadImageSource(path: string) {
    const result = await imageProbe(path)
    imageObjectUrl.value = isTauri() ? convertFileSrc(path) : null
    if (!imageObjectUrl.value) {
      await fallbackLoadImageBlob(result)
      return
    }

    if (descriptor.value) {
      descriptor.value = {
        ...descriptor.value,
        width: result.width,
        height: result.height,
      }
    }
  }

  function nextGen(idx: number) {
    const g = (pageGen.value[idx] || 0) + 1
    pageGen.value[idx] = g
    return g
  }

  function enqueueJob(index: number, targetWidth: number | undefined, format: 'png' | 'jpeg' | 'webp' | 'raw', dpi?: number) {
    queue.value = queue.value.filter(j => j.index !== index)
    queue.value.push({ index, targetWidth, dpi, format })
    if (queue.value.length > 100) {
      queue.value.splice(0, queue.value.length - 100)
    }
  }

  function cancelQueued(index: number) {
    queue.value = queue.value.filter(j => j.index !== index)
  }

  async function cancelInflight(index: number) {
    const newGen = nextGen(index)
    try { if (docId.value != null) await pdfRenderCancel(docId.value, index, newGen) } catch (_) {}
  }

  function enforceVisibleRange(start: number, end: number) {
    queue.value = queue.value.filter(j => j.index >= start && j.index <= end)
    for (const i of pdfInflight) {
      if (i < start || i > end) {
        const g = nextGen(i)
        try { if (docId.value != null) { pdfRenderCancel(docId.value, i, g) } } catch (_) {}
      }
    }
  }

  async function select(item: FileItem) {
    if (!(await ensureCanSwitch(item.path))) return
    const filelist = useFileListStore()
    const previousPath = selected.value?.path
    const accessPath = await filelist.ensureAccess(item)
    if (previousPath && previousPath !== accessPath) {
      void filelist.stopAccess(previousPath)
    }
    selected.value = item
    const result = await loadDescriptor(accessPath)
    if (result === 'permission_error') {
      filelist.remove(item.path)
      void filelist.stopAccess(accessPath)
      selected.value = null
      error.value = null
      return
    }
    if (result === 'success') {
      await filelist.createBookmarkFor(item)
    }
  }

  async function selectPath(path: string) {
    if (!(await ensureCanSwitch(path))) return
    const filelist = useFileListStore()
    const previousPath = selected.value?.path
    filelist.add(path)
    const item = filelist.items.find(i => i.path === path)
    if (item) {
      const accessPath = await filelist.ensureAccess(item)
      if (previousPath && previousPath !== accessPath) {
        void filelist.stopAccess(previousPath)
      }
      selected.value = item
      const result = await loadDescriptor(accessPath)
      if (result === 'permission_error') {
        filelist.remove(item.path)
        void filelist.stopAccess(accessPath)
        selected.value = null
        error.value = null
        return
      }
      if (result === 'success') {
        await filelist.createBookmarkFor(item)
      }
    } else {
      if (previousPath && previousPath !== path) {
        void filelist.stopAccess(previousPath)
      }
      selected.value = { id: path, name: path.split('/').pop() || path, path }
      await loadDescriptor(path)
    }
  }

  type LoadResult = 'success' | 'permission_error' | 'error'

  function isPermissionError(err: unknown): boolean {
    const anyErr = err as { code?: unknown; message?: unknown }
    const code = typeof anyErr?.code === 'string' ? anyErr.code.toLowerCase() : ''
    const msgRaw = typeof anyErr?.message === 'string' ? anyErr.message : String(err)
    const message = msgRaw.toLowerCase()
    if (code === 'permission_denied') return true
    if (code === 'access_denied') return true
    if (code === 'permission') return true
    if (message.includes('permission denied')) return true
    if (message.includes('permission')) return true
    if (message.includes('not permitted')) return true
    if (message.includes('operation not permitted')) return true
    if (message.includes('access denied')) return true
    if (message.includes('operation not allowed')) return true
    return false
  }

  async function loadDescriptor(path: string): Promise<LoadResult> {
    loading.value = true
    error.value = null
    resetRenderPipeline()
    resetPdfState()
    descriptor.value = null
    setDirtyState(false, 0)
    if (docId.value != null) {
      try { await pdfClose(docId.value) } catch (_) {}
      docId.value = null
    }
    clearImageUrl()
    try {
      const d = await analyzeMedia(path)
      descriptor.value = d
      if (d.type === 'image') {
        await loadImageSource(d.path)
      } else if (d.type === 'pdf') {
        const opened = await pdfOpen(d.path)
        docId.value = opened.docId
        descriptor.value = { ...d, pages: opened.pages }
        setDirtyState(opened.dirty ?? false, opened.revision ?? 0)
        pdfPages.value = Array.from({ length: opened.pages }, () => null)
        highResPages.clear()
        // Pre-fetch page 0 size so PdfViewport can compute layout immediately
        try {
          const size0 = await pdfPageSize(opened.docId, 0)
          pageSizesPt.value[0] = { widthPt: size0.widthPt, heightPt: size0.heightPt }
        } catch (_) {}
        // Skip first-page pre-render; PdfViewport renders at correct viewport width on mount
      }
      return 'success'
    } catch (e: any) {
      const msg = e?.message || String(e)
      error.value = msg
      return isPermissionError(e) ? 'permission_error' : 'error'
    } finally {
      loading.value = false
    }
  }

  async function closeDoc() {
    if (docId.value != null) {
      try { await pdfClose(docId.value) } catch (_) {}
      docId.value = null
    }
    const activePath = selected.value?.path
    if (activePath) {
      const filelist = useFileListStore()
      await filelist.stopAccess(activePath)
    }
  }

  async function undo(): Promise<{ pages: number; dirty: boolean; revision: number } | null> {
    const d = descriptor.value
    if (!d || d.type !== 'pdf' || docId.value == null) return null
    const res = await pdfUndo(docId.value)
    descriptor.value = { ...d, pages: res.pages } as any
    resetRenderPipeline()
    resetPdfState()
    pdfPages.value = Array.from({ length: res.pages }, () => null)
    setDirtyState(res.dirty, res.revision)
    return res
  }

  async function redo(): Promise<{ pages: number; dirty: boolean; revision: number } | null> {
    const d = descriptor.value
    if (!d || d.type !== 'pdf' || docId.value == null) return null
    const res = await pdfRedo(docId.value)
    descriptor.value = { ...d, pages: res.pages } as any
    resetRenderPipeline()
    resetPdfState()
    pdfPages.value = Array.from({ length: res.pages }, () => null)
    setDirtyState(res.dirty, res.revision)
    return res
  }

  function setDirtyState(next: boolean, nextRevision?: number) {
    dirty.value = next
    if (typeof nextRevision === 'number') {
      revision.value = nextRevision
    }
  }

  function markDirty() { setDirtyState(true) }
  function clearDirty() { setDirtyState(false) }

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
      setDirtyState(res.dirty, res.revision)
    } else {
      const res = await pdfSave({ docId: id, overwrite: true })
      descriptor.value = { ...d, path: res.path, pages: res.pages } as any
      setDirtyState(res.dirty, res.revision)
    }
  }

  async function ensureCanSwitch(nextPath: string): Promise<boolean> {
    if (!dirty.value) return true
    if (selected.value?.path === nextPath) return true
    const wantsSave = await confirmDialog('此文件有未儲存變更，是否先儲存？', {
      title: '未儲存的變更',
      okLabel: '儲存',
      cancelLabel: '不儲存',
    })
    if (wantsSave) {
      try {
        await saveCurrentIfNeeded()
        return true
      } catch (_) {
        return false
      }
    }
    setDirtyState(false, revision.value)
    return true
  }

  async function fallbackLoadImageBlob(probed?: { width: number; height: number }) {
    const d = descriptor.value
    if (!d || d.type !== 'image') return
    if (imageObjectUrl.value?.startsWith('blob:')) return
    try {
      const result = await imageRead(d.path)
      const bytes = new Uint8Array(result.imageBytes)
      const blob = new Blob([bytes], { type: result.mimeType })
      const url = URL.createObjectURL(blob)
      clearImageUrl()
      imageObjectUrl.value = url

      if (descriptor.value) {
        descriptor.value = {
          ...descriptor.value,
          width: probed?.width ?? result.width,
          height: probed?.height ?? result.height,
        }
      }
    } catch (e: any) {
      error.value = e?.message || String(e)
    }
  }

  async function ensurePdfFirstPage() {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return
  }

  async function renderPdfPage(index: number, targetWidth?: number, format?: 'png' | 'jpeg' | 'webp' | 'raw', dpi?: number) {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return
    if (index < 0) return

    const existing = pdfPages.value[index]
    let requiredWidth: number | null = null
    if (typeof targetWidth === 'number' && targetWidth > 0) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      if (size) {
        const impliedDpi = (targetWidth * 72) / size.widthPt
        const cappedDpi = Math.min(impliedDpi, settings.s.pdfRenderDpi)
        requiredWidth = Math.floor(size.widthPt * cappedDpi / 72)
      } else {
        requiredWidth = targetWidth
      }
    } else if (typeof dpi === 'number' && dpi > 0) {
      const size = pageSizesPt.value[index] || await getPageSizePt(index)
      if (size) {
        const cappedDpi = Math.min(dpi, settings.s.pdfRenderDpi)
        requiredWidth = Math.max(1, Math.floor(size.widthPt * cappedDpi / 72))
      }
    }
    if (requiredWidth != null) {
      const hasHiResUrl = !!(existing?.highResUrl) && (existing!.widthPx >= requiredWidth)
      const hasHiResRaw = (existing?.format === 'raw') && !!(existing as any)?.rawImageData && (existing!.widthPx >= requiredWidth)
      if (hasHiResUrl || hasHiResRaw) return
    }

    if (!pdfInflight.has(index)) {
      const finalFormat = format ?? 'raw'
      enqueueJob(index, targetWidth, finalFormat, dpi)
    }

    processQueue()
  }

  async function processQueue() {
    const sessionId = renderSessionId.value
    const max = Math.max(1, settings.s.maxConcurrentRenders)
    while (renderSessionId.value === sessionId && inflightCount.value < max && queue.value.length > 0) {
      let pickAt = 0
      if (queue.value.length > 1) {
        let best = Number.POSITIVE_INFINITY
        for (let i = 0; i < queue.value.length; i++) {
          const dist = Math.abs(queue.value[i].index - priorityIndex.value)
          if (dist < best) {
            best = dist
            pickAt = i
          }
        }
      }
      const job = queue.value.splice(pickAt, 1)[0]
      const idx = job.index
      if (pdfInflight.has(idx)) continue
      const d = descriptor.value
      if (!d || d.type !== 'pdf') return
      if (docId.value == null) continue
      pdfInflight.add(idx)
      inflightCount.value++
      const q = (job.format === 'jpeg')
        ? 82
        : (job.format === 'webp')
          ? 85
          : (job.format === 'png' ? 50 : undefined)
      const gen = nextGen(idx)
      pdfRenderPage({ docId: docId.value!, pageIndex: idx, targetWidth: job.targetWidth, dpi: job.dpi, format: job.format, quality: q, gen })
        .then(page => {
          if (renderSessionId.value !== sessionId) {
            if (page.contentUrl) {
              try { URL.revokeObjectURL(page.contentUrl) } catch {}
            }
            return
          }
          if (pageGen.value[idx] === gen) {
            pendingApply.push({ idx, page })
            scheduleApplyFrame()
          } else if (page.contentUrl) {
            try { URL.revokeObjectURL(page.contentUrl) } catch {}
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

  function getRawCacheMaxBytes() {
    const rawValue = Number(settings.s.rawCacheMaxMb)
    const mb = Number.isFinite(rawValue) ? rawValue : MAX_RAW_CACHE_MB
    return Math.min(MAX_RAW_CACHE_MB, Math.max(MIN_RAW_CACHE_MB, Math.round(mb))) * BYTES_PER_MB
  }

  function pageCacheBytes(page: PageRender | null | undefined) {
    if (!page) return 0
    if (page.format === 'raw' && page.rawImageData) {
      return page.rawImageData.data.byteLength
    }
    if (page.highResUrl) {
      return page.widthPx * page.heightPx * 4
    }
    return 0
  }

  function evictHighResCache() {
    const maxBytes = getRawCacheMaxBytes()
    let totalBytes = 0
    for (const idx of highResPages) {
      totalBytes += pageCacheBytes(pdfPages.value[idx])
    }
    if (totalBytes <= maxBytes) return

    const sorted = Array.from(highResPages).sort((a, b) => {
      const distA = Math.abs(a - priorityIndex.value)
      const distB = Math.abs(b - priorityIndex.value)
      return distB - distA
    })

    for (const idx of sorted) {
      if (totalBytes <= maxBytes) break
      const page = pdfPages.value[idx]
      const bytes = pageCacheBytes(page)
      if (page?.highResUrl) {
        try { URL.revokeObjectURL(page.highResUrl) } catch {}
        pdfPages.value[idx] = {
          ...page,
          highResUrl: undefined,
        }
      } else if (page?.format === 'raw' && page.rawImageData) {
        pdfPages.value[idx] = {
          ...page,
          rawImageData: undefined,
        }
      }
      totalBytes -= bytes
      highResPages.delete(idx)
    }
  }

  function setPriorityIndex(i: number) {
    priorityIndex.value = Math.max(0, Math.floor(i))
  }

  function clear() {
    const activePath = selected.value?.path
    if (activePath) {
      const filelist = useFileListStore()
      void filelist.stopAccess(activePath)
    }
    selected.value = null
    descriptor.value = null
    setDirtyState(false, 0)
    clearImageUrl()
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
    return size.widthPt * (96 / 72)
  }

  async function getPageTextContent(index: number): Promise<PageTextContent | null> {
    const d = descriptor.value
    if (!d || d.type !== 'pdf') return null
    if (index < 0) return null
    const cached = pageText.value[index]
    if (cached) return cached
    if (docId.value == null) return null

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

  function clearPageText(index: number) {
    if (pageText.value[index] !== undefined) {
      const next = { ...pageText.value }
      delete next[index]
      pageText.value = next
    }
  }

  return {
    selected,
    descriptor,
    loading,
    error,
    pdfFirstPage,
    pdfPages,
    docId,
    dirty,
    revision,
    inflightCount,
    queue,
    pageText,
    imageUrl,
    imageObjectUrl,
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
    undo,
    redo,
    pageSizesPt,
    getPageSizePt,
    baseCssWidthAt100,
    getPageTextContent,
    getCachedPageText,
    resetPageTextCache,
    clearPageText,
    setDirtyState,
    markDirty,
    clearDirty,
  }
}

export type MediaSessionController = ReturnType<typeof createMediaSessionController>
export type MediaSession = ShallowUnwrapRef<MediaSessionController>

export function createMediaSession(): MediaSession {
  return proxyRefs(createMediaSessionController()) as MediaSession
}
