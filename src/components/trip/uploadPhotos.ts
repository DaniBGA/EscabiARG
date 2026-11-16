import type { Api } from '../../lib/api'
import { isVideoBlob, MAX_VIDEO_BYTES } from '../../lib/media'
import { compressPhoto } from '../../lib/photos'

/** Sube las fotos (comprimidas) y los videos (ya vienen livianos); devuelve las rutas guardadas */
export async function uploadPhotos(api: Api, tripId: string, userId: string, photos: Blob[]) {
  const paths: string[] = []
  for (const item of photos) {
    if (isVideoBlob(item)) {
      if (item.size > MAX_VIDEO_BYTES) throw new Error('VIDEO_TOO_BIG')
      paths.push(await api.uploadPhoto(tripId, userId, item))
    } else {
      paths.push(await api.uploadPhoto(tripId, userId, await compressPhoto(item)))
    }
  }
  return paths
}
