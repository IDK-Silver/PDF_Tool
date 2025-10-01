import { computed, ref, type Ref } from 'vue'
import type { PdfFile } from '../../types/pdf'
import type { ContextMenuItem, PagePointerContext } from '../../types/viewer'

interface UsePageContextMenuOptions {
  activeFile: Ref<PdfFile | null>
  exporting: Ref<boolean>
  isPdfFile: Ref<boolean>
  isImageFile: Ref<boolean>
  onOpenFolder: () => Promise<void>
  onExportPdfPage: (context: PagePointerContext) => Promise<void>
  onExportPdfPageAsPdf: (context: PagePointerContext) => Promise<void>
  onExportImageAsPng: (context: PagePointerContext) => Promise<void>
  onExportImageAsPdf: (context: PagePointerContext) => Promise<void>
}

export function usePageContextMenu(options: UsePageContextMenuOptions) {
  const visible = ref(false)
  const position = ref({ x: 0, y: 0 })
  const lastPageContext = ref<PagePointerContext | null>(null)

  const menuItems = computed<ContextMenuItem[]>(() => {
    if (!options.activeFile.value) return []
    const items: ContextMenuItem[] = []
    items.push({ id: 'open-folder', label: '開啟於資料夾', disabled: !options.activeFile.value.path })
    if (lastPageContext.value) {
      const fmtLabel = 'PNG'
      items.push({ id: 'export-page', label: `匯出本頁為圖片 (${fmtLabel})`, disabled: options.exporting.value })
      items.push({ id: 'export-page-pdf', label: '匯出本頁為 PDF 檔案', disabled: options.exporting.value })
    }
    return items
  })

  function open(context: PagePointerContext) {
    lastPageContext.value = context
    position.value = { x: context.clientX, y: context.clientY }
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  function reset() {
    visible.value = false
    lastPageContext.value = null
  }

  async function onSelect(id: string) {
    const context = lastPageContext.value
    close()
    if (id === 'open-folder') {
      await options.onOpenFolder()
      return
    }
    if (!context) return
    if (id === 'export-page') {
      if (options.isPdfFile.value) await options.onExportPdfPage(context)
      else if (options.isImageFile.value) await options.onExportImageAsPng(context)
    } else if (id === 'export-page-pdf') {
      if (options.isPdfFile.value) await options.onExportPdfPageAsPdf(context)
      else if (options.isImageFile.value) await options.onExportImageAsPdf(context)
    }
  }

  return {
    visible,
    position,
    menuItems,
    lastPageContext,
    open,
    close,
    reset,
    onSelect,
  }
}
