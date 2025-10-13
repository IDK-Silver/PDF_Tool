// Lightweight JSON persistence using browser localStorage

export async function readLocalJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const obj = JSON.parse(raw)
    return obj as T
  } catch {
    return fallback
  }
}

export async function writeLocalJson(key: string, data: unknown): Promise<void> {
  try {
    window.localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // swallow
  }
}

