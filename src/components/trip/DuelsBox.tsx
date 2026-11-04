import { useState } from 'react'
import type { DuelKind, TripDetail } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { DUEL_MAX_SHOTS, DUELS_PER_DAY, FONDO_SECONDS, SHOTS_SECONDS, formatDuelTime } from '../../lib/game'
import Avatar from '../Avatar'
import Sheet from '../Sheet'

type Props = {
  detail: TripDetail
  me: string
  today: string
  onChange: (message?: string) => void
}

const KINDS: { key: DuelKind; emoji: string; label: string; rule: string }[] = [
  { key: 'fondo', emoji: '🍺', label: 'Fondo blanco', rule: 'Arranca el reloj: gana el que aprieta "¡Terminé!" en menos tiempo.' },
  { key: 'shots', emoji: '🥃', label: 'Shots', rule: `Cuenta regresiva: gana el que toma más shots (máx. ${DUEL_MAX_SHOTS}); si empatan, el que llegó primero.` },
]

/** Retar a alguien del viaje a un duelo de tragos */
export default function DuelsBox({ detail, me, today, onChange }: Props) {
  const api = useApi()
  const members = detail.trip.members
  const name = (id: string | null) => (id === me ? 'Vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? '?')
  const [open, setOpen] = useState(false)
  const [opponent, setOpponent] = useState<string | null>(null)
  const [kind, setKind] = useState<DuelKind>('fondo')
  const [seconds, setSeconds] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sent = detail.duels.find((d) => d.status === 'invited' && d.challenger_id === me)
  const live = detail.duels.filter((d) => d.status === 'live')
  const recent = detail.duels.filter((d) => d.status === 'done').slice(0, 5)
  const playedToday = detail.duels.filter(
    (d) => d.day === today && (d.status === 'live' || d.status === 'done') && (d.challenger_id === me || d.opponent_id === me),
  ).length
  const times = kind === 'fondo' ? FONDO_SECONDS : SHOTS_SECONDS
  const kindInfo = KINDS.find((k) => k.key === kind)!

  const close = () => {
    setOpen(false)
    setOpponent(null)
    setError(null)
  }

  const challenge = async () => {
    if (!opponent) return
    setBusy(true)
    setError(null)
    try {
      await api.challengeDuel(detail.trip.id, opponent, kind, seconds)
      close()
      onChange(`⚔️ Retaste a ${name(opponent)}: falta que acepte`)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const resultText = (d: (typeof recent)[number]) => {
    const ev = detail.events.find((e) => e.id === d.event_id)
    if (!d.winner_id) return 'Nadie ganó'
    const loser = d.winner_id === d.challenger_id ? d.opponent_id : d.challenger_id
    const state = ev?.status === 'pending' ? ' · ⏳ validando' : ev?.status === 'rejected' ? ' · ❌ no validado' : ''
    return `${name(d.winner_id)} le ganó a ${name(loser)}${ev?.detail ? ` (${ev.detail})` : ''}${state}`
  }

  return (
    <section className="card-box card-box--duel" id="duelos" aria-labelledby="duels-title">
      <h3 id="duels-title" className="box-title">Duelos</h3>
      <p className="muted">
        Retá a alguien del viaje a fondo blanco o shots. El ganador suma +{detail.trip.duel_points}.
      </p>

      {sent ? (
        <div className="duel-waiting">
          <span>⏳ Esperando que {name(sent.opponent_id)} acepte tu duelo de {sent.kind === 'fondo' ? 'fondo blanco' : 'shots'}…</span>
          <button type="button" className="btn btn--ghost" disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.cancelDuel(sent.id)
                onChange('Duelo cancelado')
              } catch (err) {
                setError(friendlyError(err))
              } finally {
                setBusy(false)
              }
            }}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--primary btn--block" onClick={() => setOpen(true)} disabled={playedToday >= DUELS_PER_DAY}>
          Retar a un duelo
        </button>
      )}
      <p className="muted small">
        Jugaste {playedToday} de {DUELS_PER_DAY} duelos hoy. El otro tiene que aceptar y cualquiera se puede bajar cuando quiera.
      </p>

      {live.map((d) => {
        const r = (id: string) => detail.duelResults.find((x) => x.duel_id === d.id && x.user_id === id)
        return (
          <p key={d.id} className="duel-live">
            🔴 En vivo: {name(d.challenger_id)} vs {name(d.opponent_id)} · {d.kind === 'fondo' ? 'fondo blanco' : `shots ${r(d.challenger_id)?.shots ?? 0} a ${r(d.opponent_id)?.shots ?? 0}`}
          </p>
        )
      })}

      {recent.length > 0 && (
        <>
          <h4 className="sub-title">Últimos duelos</h4>
          <ul className="duel-list">
            {recent.map((d) => (
              <li key={d.id}>
                <span aria-hidden="true">{d.kind === 'fondo' ? '🍺' : '🥃'}</span> {resultText(d)}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && !open && <p className="notice notice--error" role="alert">{error}</p>}

      <Sheet open={open} title="Retar a un duelo" onClose={close}>
        <div className="sheet-stack">
          <div>
            <p className="step-label">1. ¿A quién retás?</p>
            <div className="who-grid">
              {members.filter((m) => m.user_id !== me).map((m) => (
                <button key={m.user_id} type="button" className={`who-choice${m.user_id === opponent ? ' is-selected' : ''}`}
                  onClick={() => setOpponent(m.user_id)} aria-pressed={m.user_id === opponent}>
                  <Avatar id={m.user_id} name={m.profile?.display_name ?? '?'} size={40} />
                  <span>{m.profile?.display_name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="step-label">2. ¿Qué duelo?</p>
            <div className="duel-kinds">
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={`drink-choice${kind === k.key ? ' is-selected' : ''}`}
                  onClick={() => { setKind(k.key); setSeconds(k.key === 'fondo' ? 30 : 60) }} aria-pressed={kind === k.key}>
                  <span className="drink-choice-emoji" aria-hidden="true">{k.emoji}</span>
                  <span className="drink-choice-name">{k.label}</span>
                </button>
              ))}
            </div>
            <p className="muted small">{kindInfo.rule}</p>
          </div>
          <div>
            <p className="step-label">3. {kind === 'fondo' ? 'Tiempo máximo para terminar' : 'Duración de la cuenta regresiva'}</p>
            <div className="gallery-filters" role="group" aria-label="Tiempo">
              {times.map((t) => (
                <button key={t} type="button" className="chip-btn" aria-pressed={seconds === t} onClick={() => setSeconds(t)}>
                  {formatDuelTime(t)}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">🧠 Tomá con cabeza: perder o bajarse no resta puntos.</p>
          {error && <p className="notice notice--error" role="alert">{error}</p>}
          <button type="button" className="btn btn--primary btn--block" disabled={busy || !opponent} onClick={challenge}>
            {busy ? 'Retando…' : opponent ? `Retar a ${name(opponent)}` : 'Elegí a quién retar'}
          </button>
        </div>
      </Sheet>
    </section>
  )
}
