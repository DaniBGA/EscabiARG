import { useState, type FormEvent } from 'react'
import type { TripDetail } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { activeCasino, formatTime } from '../../lib/game'
import { formatMoney } from '../../lib/lists'
import Avatar from '../Avatar'
import PhotoPicker from './PhotoPicker'
import { uploadPhotos } from './uploadPhotos'

type Props = {
  detail: TripDetail
  me: string
  now: number
  isDemo: boolean
  onChange: (message?: string) => void
}

const DURATIONS = [30, 60, 90, 120, 180]

function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}

const durationLabel = (min: number) => (min < 60 ? `${min} min` : `${min / 60} h`.replace('.5', ',5'))

/** Casino: temporizador y, al terminar, cada uno carga cuánto ganó (con foto) */
export default function CasinoBox({ detail, me, now, isDemo, onChange }: Props) {
  const api = useApi()
  const [minutes, setMinutes] = useState(60)
  const [won, setWon] = useState(true)
  const [amount, setAmount] = useState('')
  const [photos, setPhotos] = useState<Blob[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const members = detail.trip.members
  const name = (id: string) => (id === me ? 'Vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? '?')

  const session = activeCasino(detail.casinoSessions)
  const lastDone = detail.casinoSessions.find((c) => c.status === 'done')
  const players = session ? detail.casinoPlayers.filter((p) => p.session_id === session.id) : []
  const mine = players.find((p) => p.user_id === me)
  const over = session ? session.status === 'reporting' || Date.parse(session.ends_at) <= now : false
  const eventStatus = (eventId: string | null) => detail.events.find((e) => e.id === eventId)?.status

  const run = async (fn: () => Promise<void>, message?: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChange(message)
      return true
    } catch (err) {
      setError(friendlyError(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const report = async (e: FormEvent) => {
    e.preventDefault()
    if (!session) return
    const value = Math.round(Number(amount.replace(/\./g, '').replace(',', '.'))) * (won ? 1 : -1)
    const ok = await run(async () => {
      const [path] = await uploadPhotos(api, detail.trip.id, me, photos)
      await api.reportCasino(session.id, value, path)
    }, '🎰 Resultado cargado: falta que lo valide el grupo')
    if (ok) {
      setAmount('')
      setPhotos([])
    }
  }

  const durations = isDemo ? [1, ...DURATIONS] : DURATIONS
  const parsedAmount = Number(amount.replace(/\./g, '').replace(',', '.'))
  const amountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount >= 0

  return (
    <section className="card-box card-box--casino" id="casino" aria-labelledby="casino-title">
      <h3 id="casino-title" className="box-title">Casino</h3>

      {!session && (
        <>
          <p className="muted">
            ¿Se van al casino? Pongan un tiempo: al terminar, cada uno carga cuánto ganó o perdió con foto de las fichas o el
            ticket. El que más ganó se lleva <strong>+{detail.trip.casino_points}</strong>.
          </p>
          <div className="gallery-filters" role="group" aria-label="Duración">
            {durations.map((d) => (
              <button key={d} type="button" className="chip-btn" aria-pressed={minutes === d} onClick={() => setMinutes(d)}>
                {d === 1 ? '1 min (demo)' : durationLabel(d)}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--primary btn--block" disabled={busy}
            onClick={() => run(() => api.startCasino(detail.trip.id, minutes), '🎰 ¡Arrancó el casino! Que entren los que juegan')}>
            Arrancar casino ({durationLabel(minutes)})
          </button>
          {lastDone && (
            <p className="muted small">
              Último casino:{' '}
              {(() => {
                const winners = detail.events.filter((e) => e.kind === 'casino' && e.ref_id === lastDone.id && e.points > 0)
                return winners.length
                  ? `ganó ${winners.map((w) => name(w.user_id)).join(' y ')} (${winners[0].detail})`
                  : 'nadie salió ganando 💸'
              })()}
            </p>
          )}
        </>
      )}

      {session && !over && (
        <>
          <p className="casino-clock" aria-live="off">⏱ {clock(Date.parse(session.ends_at) - now)}</p>
          <p className="muted small center">Termina a las {formatTime(session.ends_at)} · Premio +{session.prize}</p>
          <ul className="joined-list">
            {players.map((p) => (
              <li key={p.user_id} className="is-in">
                <Avatar id={p.user_id} name={name(p.user_id)} size={30} />
                <span>{name(p.user_id)}</span>
                <span>🎲</span>
              </li>
            ))}
          </ul>
          <div className="vote-row">
            {!mine && (
              <button type="button" className="btn btn--primary" disabled={busy}
                onClick={() => run(() => api.joinCasino(session.id), '🎲 Entraste al casino')}>
                Entrar al casino
              </button>
            )}
            {(session.started_by === me || detail.trip.owner_id === me) && (
              <button type="button" className="btn btn--ghost" disabled={busy}
                onClick={() => {
                  if (window.confirm('¿Cancelar el casino? Nadie se lleva puntos.')) run(() => api.cancelCasino(session.id), 'Casino cancelado')
                }}>
                Cancelar
              </button>
            )}
          </div>
        </>
      )}

      {session && over && (
        <>
          <p className="chef-result">¡Se terminó el tiempo!</p>
          <p className="muted small center">Tienen hasta las {formatTime(session.report_until)} para cargar el resultado.</p>
          {mine && !mine.reported_at && (
            <form className="sheet-stack casino-form" onSubmit={report}>
              <div className="segmented casino-sign" role="group" aria-label="Resultado">
                <button type="button" aria-pressed={won} onClick={() => setWon(true)}>🤑 Gané</button>
                <button type="button" aria-pressed={!won} onClick={() => setWon(false)}>💸 Perdí</button>
              </div>
              <label className="field">
                <span>¿Cuánto? (en pesos)</span>
                <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Ej: 15000" required />
              </label>
              <PhotoPicker photos={photos} onChange={setPhotos} label="Foto de las fichas o el ticket" />
              <button type="submit" className="btn btn--primary btn--block" disabled={busy || !amountValid || photos.length === 0}>
                Cargar {amountValid ? formatMoney(Math.round(parsedAmount) * (won ? 1 : -1)) : 'resultado'}
              </button>
            </form>
          )}
          <ul className="casino-results">
            {[...players]
              .sort((a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity))
              .map((p) => {
                const st = eventStatus(p.event_id)
                return (
                  <li key={p.user_id}>
                    <Avatar id={p.user_id} name={name(p.user_id)} size={30} />
                    <span className="casino-name">{name(p.user_id)}</span>
                    <span className={`casino-amount${(p.amount ?? 0) < 0 ? ' is-neg' : ''}`}>
                      {p.amount === null ? 'sin cargar' : formatMoney(p.amount)}
                    </span>
                    <span title={st}>{p.amount === null ? '⏳' : st === 'approved' ? '✅' : st === 'rejected' ? '❌' : '🗳️'}</span>
                  </li>
                )
              })}
          </ul>
        </>
      )}

      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </section>
  )
}
