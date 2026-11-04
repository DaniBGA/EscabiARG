import type { Api } from '../../lib/api'
import { compressPhoto } from '../../lib/photos'

/** Comprime y sube las fotos; devuelve las rutas guardadas */
export async function uploadPhotos(api: Api, tripId: string, userId: string, photos: Blob[]) {
  const paths: string[] = []
  for (const photo of photos) {
    const blob = await compressPhoto(photo)
    paths.push(await api.uploadPhoto(tripId, userId, blob))
  }
  return paths
}
