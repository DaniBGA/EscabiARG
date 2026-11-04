/** Fotos: control de que sean "de ahora" y compresión antes de subir */

/** La foto tiene que haberse sacado hace menos de esto */
export const MAX_PHOTO_AGE_MS = 15 * 60_000

export function isFreshPhoto(file: File, now = Date.now()) {
  // Si el navegador no informa la fecha, no podemos chequear: la dejamos pasar
  if (!file.lastModified) return true
  return now - file.lastModified < MAX_PHOTO_AGE_MS
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // seguimos con <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Achica la foto (lado mayor máx. 1280px) y la pasa a JPEG */
export async function compressPhoto(file: Blob, maxSide = 1280, quality = 0.8): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await loadBitmap(file)
  } catch {
    throw new Error('PHOTO_INVALID')
  }
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('PHOTO_INVALID')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source) source.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
  if (!blob) throw new Error('PHOTO_INVALID')
  return blob
}
