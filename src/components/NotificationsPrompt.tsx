import { useState } from 'react'
import type { Api } from '../lib/api'
import { enableNotifications, markNotifAsked, notifAsked, notifPermission, notifSupport, testNotice } from '../lib/notifications'
import { IOS_STEPS } from './NotificationsToggle'
import './Notifications.css'

type Props = { api: Api; userId: string; name: string }

/** Cartel (una sola vez) dentro del viaje para activar los avisos */
export default function NotificationsPrompt({ api, userId, name }: Props) {
  const support = notifSupport()
  const [show, setShow] = useState(
    () => !notifAsked(userId) && (support === 'ios-install' || (support === 'ok' && notifPermission() === 'default')),
  )
  const [busy, setBusy] = useState(false)
  if (!show) return null

  const close = () => {
    markNotifAsked(userId)
    setShow(false)
  }

  const enable = async () => {
    setBusy(true)
    const r = await enableNotifications(api, userId).catch(() => null)
    if (r?.ok) await testNotice(name).catch(() => undefined)
    setBusy(false)
    setShow(false)
  }

  return (
    <div className="notif-prompt" role="region" aria-label="Activar notificaciones">
      <span className="notif-prompt-bell" aria-hidden="true">🔔</span>
      <div className="notif-prompt-body">
        <p className="notif-prompt-title">¿Te avisamos cuando pasa algo?</p>
        <p className="notif-prompt-text">
          {support === 'ios-install' ? IOS_STEPS : 'Duelos, quemadas, cosas para votar, la Hora boliche… aunque no estés mirando la app.'}
        </p>
        <div className="notif-prompt-actions">
          {support === 'ok' && (
            <button type="button" className="btn btn--primary" onClick={enable} disabled={busy}>
              Activar
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={close} disabled={busy}>
            {support === 'ok' ? 'Ahora no' : 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  )
}
