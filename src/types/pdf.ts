export type Mode = 'view' | 'convert' | 'compose'

export type FileKind = 'pdf' | 'image'

export interface PdfFile {
  id: string
  path: string
  name: string
  kind: FileKind
}
