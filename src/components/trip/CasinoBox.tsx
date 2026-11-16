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

/**
 * Casino: temporizador. El que pierde todo toca "Quedé en 0"; si queda uno solo con plata, gana.
 * Si se termina el tiempo y quedan varios, el ganador sube la foto de cuánta plata le quedó.
 */
export default function CasinoBox({ detail, me, now, isDemo, onChange }: Props) {
  const api = useApi()
  const [minutes, setMinutes] = useState(60)
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
  const alive = players.filter((p) => !p.busted_at)
  const iAmAlive = Boolean(mine && !mine.busted_at)
  // Reclamo del ganador (pendiente o validado) y los que el grupo rechazó
  const claimOf = (eventId: string | null) => detail.events.find((e) => e.id === eventId && e.points > 0)
  const claimant = players.find((p) => {
    const e = claimOf(p.event_id)
    return e && (e.status === 'pending' || e.status === 'approved')
  })
  const claim = claimant ? claimOf(claimant.event_id) : undefined
  const canClaim = iAmAlive && !mine?.reported_at && !claimant

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
    const value = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')))
    const ok = await run(async () => {
      const [path] = await uploadPhotos(api, detail.trip.id, me, photos)
      await api.reportCasino(session.id, value, path)
    }, '🎰 ¡Listo! Cuando el grupo lo valide, te llevás los puntos')
    if (ok) {
      setAmount('')
      setPhotos([])
    }
  }

  const durations = isDemo ? [1, ...DURATIONS] : DURATIONS
  const parsedAmount = Number(amount.replace(/\./g, '').replace(',', '.'))
  const amountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0

  return (
    <section className="card-box card-box--casino" id="casino" aria-labelledby="casino-title">
      <h3 id="casino-title" className="box-title">Casino</h3>

      {!session && (
        <>
          <p className="muted">
            ¿Se van al casino? Pongan un tiempo. El que pierde toda la plata toca <strong>"Quedé en 0"</strong>: si queda uno
            solo con plata, gana. Si se termina el tiempo, el que más plata tiene sube la foto y se lleva{' '}
            <strong>+{detail.trip.casino_points}</strong>.
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
              <li key={p.user_id} className={p.busted_at ? 'is-busted' : 'is-in'}>
                <Avatar id={p.user_id} name={name(p.user_id)} size={30} />
                <span>{name(p.user_id)}</span>
                <span>{p.busted_at ? '💀 en 0' : '🎲'}</span>
              </li>
            ))}
          </ul>
          {players.length > 1 && (
            <p className="muted small center">
              Siguen con plata {alive.length} de {players.length}. Si queda uno solo, gana al toque.
            </p>
          )}
          {iAmAlive && (
            <button type="button" className="btn btn--danger-solid btn--block casino-bust" disabled={busy}
              onClick={() => {
                if (window.confirm('¿Quedaste en 0? Perdiste toda la plata y quedás afuera del casino.')) {
                  run(() => api.bustCasino(session.id), '💀 Quedaste en 0. ¡Otra vez será!')
                }
              }}>
              💸 Quedé en 0
            </button>
          )}
          {mine?.busted_at && <p className="chef-result">💀 Quedaste en 0</p>}
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
          {claim && claimant ? (
            <p className="notice">
              ⏳ <strong>{name(claimant.user_id)}</strong> dice que ganó: {claim.detail?.toLowerCase()}. Falta que lo valide el grupo.
            </p>
          ) : (
            <p className="muted small center">
              {alive.length > 0
                ? `Siguen con plata ${alive.map((p) => name(p.user_id)).join(', ')}. El que más tiene sube la foto antes de las ${formatTime(session.report_until)}.`
                : 'Quedaron todos en 0.'}
            </p>
          )}
          {canClaim && (
            <form className="sheet-stack casino-form" onSubmit={report}>
              <p className="step-label">¿Ganaste vos? Subí cuánta plata te quedó</p>
              <label className="field">
                <span>¿Cuánta plata te quedó? (en pesos)</span>
                <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Ej: 25000" required />
              </label>
              <PhotoPicker photos={photos} onChange={setPhotos} label="Foto de las fichas o el ticket" />
              <button type="submit" className="btn btn--primary btn--block" disabled={busy || !amountValid || photos.length === 0}>
                {amountValid ? `Gané: me quedaron ${formatMoney(Math.round(parsedAmount)).replace('+', '')}` : 'Cargar lo que me quedó'}
              </button>
            </form>
          )}
          {mine?.busted_at && <p className="muted small center">💀 Vos quedaste en 0.</p>}
          {mine?.reported_at && !claimant && (
            <p className="muted small center">❌ El grupo no validó tu resultado. Puede reclamarlo otro de los que siguen con plata.</p>
          )}
          <ul className="joined-list">
            {players.map((p) => (
              <li key={p.user_id} className={p.busted_at ? 'is-busted' : 'is-in'}>
                <Avatar id={p.user_id} name={name(p.user_id)} size={30} />
                <span>{name(p.user_id)}</span>
                <span>{p.busted_at ? '💀 en 0' : p.user_id === claimant?.user_id ? '🏆' : '💰'}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </section>
  )
}
