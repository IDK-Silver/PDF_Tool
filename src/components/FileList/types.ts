export interface FileItem {
  id: string
  name: string
  path: string
  // 1-based last viewed page for PDFs (optional)
  lastPage?: number
  // File type hint
  type?: 'pdf' | 'image' | 'unknown' | 'workspace'
  // Base64-encoded security-scoped bookmark data (macOS only)
  bookmark?: string
}
