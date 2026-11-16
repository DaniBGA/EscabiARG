/** Fotos y videos de prueba */

/** Máximo que se puede grabar */
export const MAX_VIDEO_SECONDS = 15
/** Calidad del video: ~1,4 Mbps → un video de 15 s pesa unos 3 MB */
export const VIDEO_BITS_PER_SECOND = 1_400_000
/** Por las dudas: más que esto no se sube (también lo limita Supabase) */
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024

const VIDEO_EXT = /\.(mp4|webm|mov)$/i

export const isVideoPath = (path: string) => VIDEO_EXT.test(path.split('?')[0])
export const isVideoBlob = (blob: Blob) => blob.type.startsWith('video/')

/** Extensión del archivo según el tipo */
export function extensionFor(type: string) {
  if (type.startsWith('video/mp4')) return 'mp4'
  if (type.startsWith('video/webm')) return 'webm'
  if (type.startsWith('video/quicktime')) return 'mov'
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Formato para grabar. Primero MP4 (se ve en iPhone y en Android);
 * si el navegador no lo graba, WebM.
 */
export function pickRecorderType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const options = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return options.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t)
    } catch {
      return false
    }
  }) ?? ''
}

export const canRecordVideo = () => typeof MediaRecorder !== 'undefined'

export const formatSeconds = (ms: number) => {
  const s = Math.min(MAX_VIDEO_SECONDS, Math.floor(ms / 1000))
  return `0:${String(s).padStart(2, '0')}`
}
