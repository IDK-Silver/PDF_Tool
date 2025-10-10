import { stat } from '@tauri-apps/plugin-fs'

/**
 * 獲取檔案大小（bytes）
 */
export async function getFileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path)
    return info.size
  } catch (err) {
    console.warn('Failed to get file size:', err)
    return null
  }
}

/**
 * 格式化檔案大小為人類可讀格式
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  
  // 小於 1 KB 顯示整數，其他顯示 2 位小數
  const formatted = i === 0 ? size.toString() : size.toFixed(2)
  
  return `${formatted} ${units[i]}`
}
