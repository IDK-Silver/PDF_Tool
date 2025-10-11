import { BaseDirectory, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

// Store under the app's configuration directory, cross-platform.
// Files are written at the root of AppConfig, e.g. "settings.json".

export async function readJson<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const hasFile = await exists(fileName, { baseDir: BaseDirectory.AppConfig })
    if (!hasFile) return fallback
    const txt = await readTextFile(fileName, { baseDir: BaseDirectory.AppConfig })
    const obj = JSON.parse(txt)
    return { ...fallback, ...obj }
  } catch {
    return fallback
  }
}

export async function writeJson(fileName: string, data: unknown): Promise<void> {
  try {
    await writeTextFile(fileName, JSON.stringify(data), { baseDir: BaseDirectory.AppConfig })
  } catch {
    // swallow
  }
}
