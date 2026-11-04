import { useState, type FormEvent } from 'react'
import type { MissionChallenge, TripDetail } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { formatCountdown, phaseDeadline, secondsLeft } from '../../lib/game'

type Props = {
  challenge: MissionChallenge
  detail: TripDetail
  me: string
  now: number
  onChange: (message?: string) => void
}

/** Una votación de misión "mala" en cualquiera de sus etapas */
export default function ChallengeCard({ challenge: c, detail, me, now, onChange }: Props) {
  const api = useApi()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const members = detail.trip.members
  const name = (id: string) =>
    id === me ? 'vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? 'alguien'
  const mission = detail.missions.find((m) => m.id === c.mission_id)
  const isTarget = c.target_user_id === me
  const eligible = members.filter((m) => m.user_id !== c.target_user_id).length
  const needed = Math.floor(eligible / 2) + 1
  const left = secondsLeft(phaseDeadline(c), now)

  const badVotes = detail.badVotes.filter((v) => v.challenge_id === c.id)
  const myBad = badVotes.find((v) => v.voter_id === me)
  const options = detail.options.filter((o) => o.challenge_id === c.id)
  const myOption = options.find((o) => o.author_id === me)
  const optionVotes = detail.optionVotes.filter((v) => v.challenge_id === c.id)
  const myOptionVote = optionVotes.find((v) => v.voter_id === me)
  const winner = options.find((o) => o.id === c.winner_option_id)

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

  const propose = async (e: FormEvent) => {
    e.preventDefault()
    if (await run(() => api.proposeMissionOption(c.id, text), '✍️ Opción enviada')) setText('')
  }

  const target = name(c.target_user_id)
  const targetCap = target.charAt(0).toUpperCase() + target.slice(1)

  return (
    <article className={`challenge challenge--${c.phase}`}>
      <header className="challenge-head">
        <span className="challenge-icon" aria-hidden="true">🗳️</span>
        <div>
          <p className="challenge-title">
            {isTarget ? (
              <>
                {c.phase === 'vote_bad' && 'Están votando si tu misión es mala'}
                {c.phase === 'proposals' && 'Tus amigos están escribiendo tu nueva misión'}
                {c.phase === 'vote_option' && 'Tus amigos están eligiendo tu nueva misión'}
                {c.phase === 'replaced' && 'Tenés misión nueva'}
                {c.phase === 'kept' && 'Tu misión quedó como estaba'}
              </>
            ) : (
              <>
                {c.phase === 'vote_bad' && `¿La misión de ${target} es mala?`}
                {c.phase === 'proposals' && `Escribí opciones para la misión de ${target}`}
                {c.phase === 'vote_option' && `Elegí la nueva misión de ${target}`}
                {c.phase === 'replaced' && `${targetCap} tiene misión nueva`}
                {c.phase === 'kept' && `La misión de ${target} quedó como estaba`}
              </>
            )}
          </p>
          <p className="challenge-sub">Votación que abrió {name(c.started_by)}</p>
        </div>
        {(c.phase === 'vote_bad' || c.phase === 'proposals' || c.phase === 'vote_option') && (
          <span className={`countdown${c.phase === 'vote_option' ? ' countdown--big' : ''}${left <= 10 ? ' is-urgent' : ''}`}>
            ⏱ {formatCountdown(left)}
          </span>
        )}
      </header>

      {mission && c.phase !== 'replaced' && (
        <p className="challenge-mission">“{mission.mission}”</p>
      )}

      {c.phase === 'vote_bad' && (
        <>
          <div className="tally">
            <span style={{ width: `${Math.min(100, (badVotes.filter((v) => v.bad).length / needed) * 100)}%` }} />
          </div>
          <p className="muted small">
            {badVotes.filter((v) => v.bad).length} de {needed} votos "mala" para cambiarla
          </p>
          {isTarget ? (
            <p className="muted">Es tu misión: esta vez te toca mirar 👀</p>
          ) : (
            <div className="vote-row">
              <button
                type="button"
                className={`btn ${myBad?.bad ? 'btn--primary' : 'btn--ghost'}`}
                disabled={busy}
                onClick={() => run(() => api.voteMissionBad(c.id, true), '👎 Votaste que es mala')}
              >
                👎 Es mala
              </button>
              <button
                type="button"
                className={`btn ${myBad && !myBad.bad ? 'btn--primary' : 'btn--ghost'}`}
                disabled={busy}
                onClick={() => run(() => api.voteMissionBad(c.id, false), '👍 Votaste que está bien')}
              >
                👍 Está bien
              </button>
            </div>
          )}
        </>
      )}

      {c.phase === 'proposals' && (
        <>
          <p className="muted small">
            {options.length} de {eligible} ya mandaron su opción.{' '}
            {options.length >= 2 ? 'Pueden votar ya o esperar al resto.' : ''}
          </p>
          {isTarget ? (
            <p className="muted">Tus amigos están escribiendo tu nueva misión 😬</p>
          ) : (
            <form className="propose" onSubmit={propose}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={myOption ? `Tu opción: "${myOption.text}". Escribí otra para cambiarla.` : 'Ej: Bailá una cumbia con alguien que no conocés'}
                maxLength={140}
                rows={2}
              />
              <div className="vote-row">
                <button type="submit" className="btn btn--primary" disabled={busy || text.trim().length < 5}>
                  {myOption ? 'Cambiar mi opción' : 'Enviar opción'}
                </button>
                {options.length >= 2 && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => run(() => api.startOptionVote(c.id), '🗳️ ¡A votar! Tienen 60 segundos')}
                  >
                    Votar ya
                  </button>
                )}
              </div>
            </form>
          )}
        </>
      )}

      {c.phase === 'vote_option' && (
        <ul className="options">
          {options.map((o) => {
            const votes = optionVotes.filter((v) => v.option_id === o.id).length
            const own = o.author_id === me
            const chosen = myOptionVote?.option_id === o.id
            return (
              <li key={o.id}>
                <button
                  type="button"
                  className={`option${chosen ? ' is-chosen' : ''}`}
                  disabled={busy || own || isTarget}
                  onClick={() => run(() => api.voteMissionOption(c.id, o.id), '🗳️ Voto guardado')}
                >
                  <span className="option-text">{o.text}</span>
                  <span className="option-meta">
                    {own ? 'Tuya' : `de ${name(o.author_id)}`} · {votes} {votes === 1 ? 'voto' : 'votos'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {c.phase === 'replaced' && winner && (
        <p className="challenge-mission challenge-mission--new">🆕 “{winner.text}” <small>(la propuso {name(winner.author_id)})</small></p>
      )}

      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </article>
  )
}
