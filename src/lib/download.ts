/** Guardar y exportar fotos de la galería */

export type PhotoFile = { name: string; blob: Blob }

// ---------- ZIP sin compresión (las fotos ya son JPEG: comprimir no ahorra nada) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/** Arma un .zip con los archivos tal cual (método "store") */
export async function makeZip(files: PhotoFile[], now = new Date()): Promise<Blob> {
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(now)
  const parts: BlobPart[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer())
    const name = encoder.encode(file.name)
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // versión necesaria
    local.setUint16(6, 0x0800, true) // nombres en UTF-8
    local.setUint16(8, 0, true) // sin compresión
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(local.buffer, name, data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint16(10, 0, true)
    entry.setUint16(12, time, true)
    entry.setUint16(14, date, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    const header = new Uint8Array(46 + name.length)
    header.set(new Uint8Array(entry.buffer), 0)
    header.set(name, 46)
    central.push(header)

    offset += 30 + name.length + data.length
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
}

// ---------- Guardar ----------

/** Nombre de archivo sin caracteres raros: "2026-11-04 23.17 Beto - Fernet.jpg" */
export function photoFileName(createdAt: string, who: string, what: string, taken: Set<string>) {
  const d = new Date(createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`
  const clean = (s: string) =>
    s
      .normalize('NFKC')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\p{Extended_Pictographic}|️/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  const base = clean(`${stamp} ${who} - ${what}`).slice(0, 80) || stamp
  let name = `${base}.jpg`
  for (let i = 2; taken.has(name); i++) name = `${base} (${i}).jpg`
  taken.add(name)
  return name
}

export async function fetchPhoto(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('PHOTO_DOWNLOAD_FAILED')
  return res.blob()
}

/** Baja varias fotos de a `parallel` por vez, avisando cuántas van */
export async function fetchPhotos(urls: string[], onProgress?: (done: number) => void, parallel = 4): Promise<Blob[]> {
  const blobs: Blob[] = new Array(urls.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < urls.length) {
      const i = next++
      blobs[i] = await fetchPhoto(urls[i])
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, urls.length) }, worker))
  return blobs
}

function toFile(f: PhotoFile) {
  return new File([f.blob], f.name, { type: f.blob.type || 'image/jpeg' })
}

/** ¿El celular deja compartir/guardar estas fotos con el menú del sistema? */
export function canShareFiles(sample: PhotoFile[] = [{ name: 'foto.jpg', blob: new Blob([], { type: 'image/jpeg' }) }]) {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: sample.map(toFile) })
  } catch {
    return false
  }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Guarda fotos: en el celular abre el menú de compartir (ahí está "Guardar imagen");
 * en la compu, o si se piden como zip, se descargan.
 * Devuelve false si la persona canceló.
 */
export async function savePhotos(files: PhotoFile[], opts: { zipName?: string; preferZip?: boolean } = {}) {
  if (files.length === 0) return true
  if (!opts.preferZip && canShareFiles(files)) {
    try {
      await navigator.share({ files: files.map(toFile) })
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false
      // si falla compartir, seguimos con la descarga
    }
  }
  if (files.length === 1 && !opts.preferZip) downloadBlob(files[0].blob, files[0].name)
  else downloadBlob(await makeZip(files), opts.zipName ?? 'fotos.zip')
  return true
}
