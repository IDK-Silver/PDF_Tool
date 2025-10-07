export interface FileItem {
  id: string
  name: string
  path: string
  // 1-based last viewed page for PDFs (optional)
  lastPage?: number
}
