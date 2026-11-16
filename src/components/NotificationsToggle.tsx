import { useState } from 'react'
import type { Api } from '../lib/api'
import {
  disableNotifications,
  enableNotifications,
  isPushActive,
  notifEnabled,
  notifPermission,
  notifSupport,
  testNotice,
} from '../lib/notifications'
import './Notifications.css'

type Props = { api: Api; userId: string; name: string; isDemo: boolean }

export const IOS_STEPS = 'En iPhone: tocá Compartir (el cuadrado con la flecha) → «Agregar a inicio», abrí EscabiARG desde ese ícono y activalas desde ahí.'
export const UNBLOCK_STEPS = 'Las bloqueaste en este navegador. Tocá el candado 🔒 al lado de la dirección → Notificaciones → Permitir, y volvé a probar.'

/** Prender / apagar las notificaciones (en el perfil) */
export default function NotificationsToggle({ api, userId, name, isDemo }: Props) {
  const support = notifSupport()
  const [on, setOn] = useState(() => notifEnabled(userId))
  const [push, setPush] = useState(() => isPushActive())
  const [blocked, setBlocked] = useState(() => notifPermission() === 'denied')
  const [busy, setBusy] = useState(false)

  const enable = async () => {
    setBusy(true)
    try {
      const r = await enableNotifications(api, userId)
      if (r.ok) {
        setOn(true)
        setPush(r.push)
        await testNotice(name)
      } else {
        setBlocked(r.reason === 'denied')
      }
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      await disableNotifications(api, userId)
      setOn(false)
      setPush(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="notif-box" aria-label="Notificaciones">
      <div className="notif-box-head">
        <span className="notif-box-icon" aria-hidden="true">{on ? '🔔' : '🔕'}</span>
        <div>
          <p className="notif-box-title">Notificaciones</p>
          <p className="notif-box-text">
            {support === 'ios-install'
              ? IOS_STEPS
              : support === 'unsupported'
                ? 'Este navegador no permite notificaciones.'
                : blocked
                  ? UNBLOCK_STEPS
                  : on
                    ? push
                      ? 'Activadas: te avisamos aunque cierres el navegador.'
                      : isDemo
                        ? 'Activadas (en la demo solo podés probarlas).'
                        : 'Activadas: te avisamos mientras la app siga abierta, aunque estés en otra app o pestaña.'
                    : 'Te avisamos cuando te desafían, te queman, hay algo para votar y más.'}
          </p>
        </div>
      </div>
      {support === 'ok' && !blocked && (
        <div className="notif-box-actions">
          {on ? (
            <>
              <button type="button" className="notif-chip" onClick={() => testNotice(name)} disabled={busy}>
                Probar
              </button>
              <button type="button" className="notif-chip notif-chip--off" onClick={disable} disabled={busy}>
                Desactivar
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--primary btn--block" onClick={enable} disabled={busy}>
              🔔 Activar notificaciones
            </button>
          )}
        </div>
      )}
    </section>
  )
}
