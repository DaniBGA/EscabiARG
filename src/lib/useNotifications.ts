import { useEffect } from 'react'
import type { Api } from './api'
import type { AppUser } from './authContext'
import { isPushActive, notifEnabled, registerServiceWorker, showNotice, syncPush } from './notifications'

/**
 * Mientras la app está abierta escucha tus avisos en vivo. Si estás en otra
 * pestaña u otra app (y no te llegan por Web Push), los muestra el navegador.
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
        if (change.t !== 'notifications' || change.op !== 'INSERT') return
        if (!notifEnabled(userId) || isPushActive() || document.visibilityState === 'visible') return
        const r = change.row
        void showNotice({
          title: String(r.title ?? 'EscabiARG'),
          body: String(r.body ?? ''),
          tag: String(r.tag ?? 'escabiarg'),
          url: String(r.url ?? ''),
        })
      },
    })
  }, [userId, isDemo, api])
}
