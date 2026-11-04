import type { Api } from '../../lib/api'
import { compressPhoto } from '../../lib/photos'

/** Comprime y sube las fotos; devuelve las rutas guardadas */
export async function uploadPhotos(api: Api, tripId: string, userId: string, files: File[]) {
  const paths: string[] = []
  for (const file of files) {
    const blob = await compressPhoto(file)
    paths.push(await api.uploadPhoto(tripId, userId, blob))
  }
  return paths
}
