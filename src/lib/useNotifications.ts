import { useEffect } from 'react'
import type { Api } from './api'
import type { AppUser } from './authContext'
import { deliverNotice, notifEnabled, registerServiceWorker, syncPush } from './notifications'

/**
 * Mientras la app está abierta escucha tus avisos personales en vivo. Si estás en otra
 * pestaña u otra app (y no te llegan por Web Push), los muestra el navegador.
 * Los avisos para toda la sala llegan por el canal del viaje (ver TripScreen).
 */
export function useNotificationsBridge(user: AppUser | null | undefined, api: Api) {
  const userId = user?.id
  const isDemo = user?.isDemo ?? false
  useEffect(() => {
    if (!userId) return
    void registerServiceWorker()
    if (isDemo) return
    // Vuelve a guardar la suscripción (por si cambió o se borró)
    if (notifEnabled(userId)) syncPush(api).catch(() => undefined)
    return api.subscribeUser(userId, {
      onChange(change) {
        if (change.t === 'notifications' && change.op === 'INSERT') deliverNotice(change.row, userId)
      },
    })
  }, [userId, isDemo, api])
}
