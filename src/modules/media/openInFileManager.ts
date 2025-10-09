import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'

/**
 * 在系統檔案管理器中顯示檔案。
 * 若顯示失敗則退回以預設程式開啟路徑。
 */
export async function openInFileManager(targetPath: string): Promise<void> {
  if (!targetPath) {
    throw new Error('Path is empty')
  }

  try {
    await revealItemInDir(targetPath)
  } catch (err) {
    console.warn('revealItemInDir 失敗，改為直接開啟路徑', err)
    try {
      await openPath(targetPath)
    } catch (fallbackErr) {
      console.error('開啟檔案管理器失敗', fallbackErr)
      throw fallbackErr
    }
  }
}
