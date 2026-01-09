export interface FileItem {
  id: string
  name: string
  path: string
  // 1-based last viewed page for PDFs (optional)
  lastPage?: number
  // File type hint: 'pdf' | 'image' | 'unknown'
  type?: 'pdf' | 'image' | 'unknown'
  // Base64-encoded security-scoped bookmark data (macOS only)
  bookmark?: string
}
