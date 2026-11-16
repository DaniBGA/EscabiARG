import { useSyncExternalStore } from 'react'
import type { Api, Profile } from './api'

/**
 * Fotos de perfil conocidas (id → URL). Se llenan solas con lo que trae la API
 * (tu perfil, amigos, viajes y jugadores), así cada <Avatar> muestra la foto
 * sin tener que pasarla a mano por toda la app.
 */
const photos = new Map<string, string | null>()
const listeners = new Set<() => void>()

type WithAvatar = Pick<Profile, 'id'> & { avatar_url?: string | null }

export function rememberAvatars(list: (WithAvatar | null | undefined)[]) {
  let changed = false
  for (const p of list) {
    // Si la base todavía no tiene la columna, no se pisa nada
    if (!p || p.avatar_url === undefined) continue
    const url = p.avatar_url || null
    if (photos.get(p.id) !== url) {
      photos.set(p.id, url)
      changed = true
    }
  }
  if (changed) listeners.forEach((l) => l())
}

export function useAvatarUrl(id: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => photos.get(id) ?? null,
  )
}

/** Envuelve la API para que todo perfil que pase por ella actualice las fotos */
export function withAvatars(api: Api): Api {
  const members = (t: { members?: { profile: WithAvatar | null }[] }) => (t.members ?? []).map((m) => m.profile)
  return {
    ...api,
    async getMyProfile(userId) {
      const me = await api.getMyProfile(userId)
      rememberAvatars([me])
      return me
    },
    async listFriends(userId) {
      const list = await api.listFriends(userId)
      rememberAvatars(list)
      return list
    },
    async addFriendByCode(code) {
      const friend = await api.addFriendByCode(code)
      rememberAvatars([friend])
      return friend
    },
    async listTrips() {
      const trips = await api.listTrips()
      rememberAvatars(trips.flatMap(members))
      return trips
    },
    async getTrip(tripId) {
      const detail = await api.getTrip(tripId)
      rememberAvatars(members(detail.trip))
      return detail
    },
    async setAvatar(userId, photo) {
      const url = await api.setAvatar(userId, photo)
      rememberAvatars([{ id: userId, avatar_url: url }])
      return url
    },
  }
}

/** Recorta la foto al medio, cuadrada, y la achica a JPEG (unos 20-40 KB) */
export async function squareAvatar(source: Blob, size = 320): Promise<Blob> {
  const url = URL.createObjectURL(source)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    if (!side) throw new Error('AVATAR_INVALID')
    const out = Math.min(size, side)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('AVATAR_INVALID')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      out,
      out,
    )
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob) throw new Error('AVATAR_INVALID')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
