/** Fotos del modo demo: se guardan en IndexedDB (o en memoria si no hay) */

const DB_NAME = 'escabiarg-demo'
const STORE = 'photos'

const memory = new Map<string, Blob>()
const urls = new Map<string, string>()

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb()
  if (!db) return null
  return new Promise<T | null>((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function saveDemoPhoto(path: string, blob: Blob) {
  memory.set(path, blob)
  await withStore('readwrite', (s) => s.put(blob, path))
}

export async function demoPhotoUrls(paths: string[]) {
  const result: Record<string, string> = {}
  for (const path of new Set(paths)) {
    let url = urls.get(path)
    if (!url) {
      const blob = memory.get(path) ?? ((await withStore('readonly', (s) => s.get(path))) as Blob | null)
      if (!blob) continue
      url = URL.createObjectURL(blob)
      urls.set(path, url)
    }
    result[path] = url
  }
  return result
}

export async function clearDemoPhotos() {
  memory.clear()
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  await withStore('readwrite', (s) => s.clear())
}
