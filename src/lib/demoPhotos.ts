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

/** Ruta de una foto de ejemplo dibujada al vuelo (emoji + color) */
export const seedPhotoPath = (emoji: string, hue: number) => `demo-seed:${emoji}:${hue}`

async function drawSeedPhoto(path: string): Promise<Blob | null> {
  const [, emoji, hueText] = path.split(':')
  const hue = Number(hueText) || 35
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 800
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const bg = ctx.createLinearGradient(0, 0, 0, 800)
  bg.addColorStop(0, `hsl(${hue}, 45%, 32%)`)
  bg.addColorStop(1, `hsl(${hue + 20}, 55%, 14%)`)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 600, 800)
  const glow = ctx.createRadialGradient(300, 380, 0, 300, 380, 320)
  glow.addColorStop(0, 'rgba(255, 220, 140, 0.45)')
  glow.addColorStop(1, 'rgba(255, 220, 140, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 600, 800)
  ctx.font = '300px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji || '🍺', 300, 390)
  ctx.font = 'bold 30px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.fillText('foto de ejemplo', 300, 730)
  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
}

export async function demoPhotoUrls(paths: string[]) {
  const result: Record<string, string> = {}
  for (const path of new Set(paths)) {
    let url = urls.get(path)
    if (!url) {
      const blob = path.startsWith('demo-seed:')
        ? await drawSeedPhoto(path)
        : memory.get(path) ?? ((await withStore('readonly', (s) => s.get(path))) as Blob | null)
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
