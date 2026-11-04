import { useEffect, useRef, useState } from 'react'
import type { Duel, TripDetail } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { DUEL_MAX_SHOTS } from '../../lib/game'

type Props = {
  duel: Duel
  detail: TripDetail
  me: string
  /** Diferencia (ms) entre el reloj del servidor y el del celular */
  clockOffset: number
  onChange: (message?: string) => void
  onClose: () => void
}

function stopwatch(ms: number) {
  const t = Math.max(0, ms)
  const s = Math.floor(t / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},${Math.floor((t % 1000) / 100)}`
}

const seconds1 = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

/** Pantalla completa del duelo en vivo para los dos que juegan */
export default function DuelOverlay({ duel: d, detail, me, clockOffset, onChange, onClose }: Props) {
  const api = useApi()
  const ref = useRef<HTMLDialogElement>(null)
  const [now, setNow] = useState(() => Date.now() + clockOffset)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optimisticShots, setOptimisticShots] = useState<number | null>(null)
  const [myFinish, setMyFinish] = useState<number | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // Reloj fluido sincronizado con el servidor
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (t: number) => {
      if (t - last > 50) {
        last = t
        setNow(Date.now() + clockOffset)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [clockOffset])

  const members = detail.trip.members
  const name = (id: string) => (id === me ? 'Vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? '?')
  const rival = d.challenger_id === me ? d.opponent_id : d.challenger_id
  const mine = detail.duelResults.find((r) => r.duel_id === d.id && r.user_id === me)
  const theirs = detail.duelResults.find((r) => r.duel_id === d.id && r.user_id === rival)
  const start = d.starts_at ? Date.parse(d.starts_at) : now
  const end = d.ends_at ? Date.parse(d.ends_at) : now
  const toStart = start - now
  const myShots = Math.max(mine?.shots ?? 0, optimisticShots ?? 0)
  const iFinished = Boolean(mine?.finished_at) || myFinish !== null
  const iGaveUp = Boolean(mine?.gave_up)
  const done = d.status === 'done'
  const event = detail.events.find((e) => e.id === d.event_id)

  const act = async (action: 'finish' | 'shot' | 'give_up') => {
    setError(null)
    if (action === 'shot') setOptimisticShots(myShots + 1)
    if (action === 'finish') setMyFinish(now)
    setBusy(true)
    try {
      await api.duelAction(d.id, action)
      onChange()
    } catch (err) {
      setError(friendlyError(err))
      if (action === 'shot') setOptimisticShots(null)
      if (action === 'finish') setMyFinish(null)
    } finally {
      setBusy(false)
    }
  }

  const rivalStatus = () => {
    if (!theirs) return ''
    if (theirs.gave_up) return `${name(rival)} se bajó`
    if (d.kind === 'fondo') {
      return theirs.finished_at ? `${name(rival)} terminó en ${seconds1(Date.parse(theirs.finished_at) - start)}` : `${name(rival)} sigue tomando…`
    }
    return `${name(rival)}: ${theirs.shots} de ${DUEL_MAX_SHOTS} shots`
  }

  return (
    <dialog ref={ref} className="duel" aria-label="Duelo" onCancel={(e) => { e.preventDefault(); if (done) onClose() }}>
      <div className="duel-body">
        <p className="duel-title">
          {d.kind === 'fondo' ? '🍺 Fondo blanco' : '🥃 Shots'} · vos vs {name(rival)}
        </p>

        {done ? (
          <div className="duel-result">
            <span className="duel-big-emoji" aria-hidden="true">{d.winner_id === me ? '🏆' : d.winner_id ? '🥈' : '🤝'}</span>
            <p className="duel-headline">
              {d.winner_id === me ? '¡Ganaste!' : d.winner_id ? `Ganó ${name(d.winner_id)}` : 'Nadie ganó'}
            </p>
            {event?.detail && <p className="duel-sub">{event.detail}</p>}
            {d.winner_id && <p className="duel-sub small">El resultado lo valida el resto del grupo · +{detail.trip.duel_points} al ganador</p>}
            <button type="button" className="btn btn--primary btn--block" onClick={onClose}>Cerrar</button>
          </div>
        ) : toStart > 0 ? (
          <div className="duel-countdown" aria-live="assertive">
            <span>{Math.ceil(toStart / 1000)}</span>
            <p>Preparate…</p>
          </div>
        ) : d.kind === 'fondo' ? (
          <>
            <p className="duel-clock">{stopwatch((myFinish ?? (mine?.finished_at ? Date.parse(mine.finished_at) : Math.min(now, end))) - start)}</p>
            <p className="duel-sub">Máximo {Math.round((end - start) / 1000)} s · {rivalStatus()}</p>
            {iFinished || iGaveUp ? (
              <p className="duel-wait">{iGaveUp ? 'Te bajaste.' : '¡Listo! Esperando al otro…'}</p>
            ) : (
              <button type="button" className="duel-action" onClick={() => act('finish')} disabled={busy}>
                ¡Terminé!
              </button>
            )}
          </>
        ) : (
          <>
            <p className="duel-clock">{stopwatch(end - now)}</p>
            <p className="duel-shots">
              <strong>{myShots}</strong> / {DUEL_MAX_SHOTS} <span>tus shots</span>
            </p>
            <p className="duel-sub">{rivalStatus()}</p>
            {iGaveUp ? (
              <p className="duel-wait">Te bajaste.</p>
            ) : myShots >= DUEL_MAX_SHOTS ? (
              <p className="duel-wait">¡Llegaste al máximo! Esperando al otro…</p>
            ) : (
              <button type="button" className="duel-action" onClick={() => act('shot')} disabled={busy}>
                +1 shot 🥃
              </button>
            )}
          </>
        )}

        {error && <p className="notice notice--error" role="alert">{error}</p>}
        {!done && !iGaveUp && !(d.kind === 'fondo' && iFinished) && (
          <button type="button" className="btn btn--ghost duel-giveup" disabled={busy}
            onClick={() => window.confirm('¿Te bajás del duelo? Gana el otro, pero no perdés puntos.') && act('give_up')}>
            Me bajo
          </button>
        )}
      </div>
    </dialog>
  )
}
