import { useState } from 'react'
import type { PlayerCard, TripMember } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { cardDef } from '../../lib/game'
import Avatar from '../Avatar'
import Sheet from '../Sheet'

type Props = {
  cards: PlayerCard[]
  members: TripMember[]
  userId: string
  onChange: (message?: string) => void
}

export default function CardsSection({ cards, members, userId, onChange }: Props) {
  const api = useApi()
  const [selected, setSelected] = useState<PlayerCard | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mine = cards.filter((c) => c.user_id === userId && c.status !== 'used')
  const def = selected ? cardDef(selected.card_key) : null
  const others = members.filter((m) => m.user_id !== userId)

  const close = () => {
    setSelected(null)
    setTarget(null)
    setError(null)
  }

  const redeem = async () => {
    if (!selected || !def) return
    setBusy(true)
    setError(null)
    try {
      await api.redeemCard(selected.id, def.effect === 'steal' ? target : null)
      close()
      const messages: Record<string, string> = {
        bonus: `${def.emoji} ¡+${def.value} puntos!`,
        steal: `${def.emoji} ¡Le robaste ${def.value} puntos a ${others.find((m) => m.user_id === target)?.profile?.display_name ?? 'alguien'}!`,
        double: `${def.emoji} Activado: tu próximo trago suma el doble`,
        shield: `${def.emoji} Escudo activado`,
        social: `${def.emoji} ¡${def.name}! Ya lo vieron todos`,
      }
      onChange(messages[def.effect])
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card-box" aria-labelledby="cards-title">
      <h3 id="cards-title" className="box-title">Tus comodines</h3>
      {mine.length === 0 ? (
        <p className="muted">Ganá una jornada para girar la ruleta y llevarte un comodín.</p>
      ) : (
        <ul className="wild-list">
          {mine.map((c) => {
            const d = cardDef(c.card_key)
            return (
              <li key={c.id} className={`wild${c.status === 'active' ? ' is-active' : ''}`}>
                <span className="wild-emoji" aria-hidden="true">{d.emoji}</span>
                <span className="wild-text">
                  <strong>{d.name}</strong>
                  <span>{c.status === 'active' ? 'Activo: se aplica solo cuando corresponda.' : d.description}</span>
                </span>
                {c.status === 'available' ? (
                  <button type="button" className="btn btn--primary wild-use" onClick={() => setSelected(c)}>Usar</button>
                ) : (
                  <span className="wild-badge">Activo</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Sheet open={selected !== null} title="Usar comodín" onClose={close}>
        {def && (
          <div className="sheet-stack">
            <div className="won-card">
              <span className="won-emoji" aria-hidden="true">{def.emoji}</span>
              <strong>{def.name}</strong>
              <span>{def.description}</span>
            </div>

            {def.effect === 'steal' && (
              <div>
                <p className="step-label">¿A quién le robás?</p>
                <div className="who-grid">
                  {others.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      className={`who-choice${m.user_id === target ? ' is-selected' : ''}`}
                      onClick={() => setTarget(m.user_id)}
                      aria-pressed={m.user_id === target}
                    >
                      <Avatar id={m.user_id} name={m.profile?.display_name ?? '?'} size={40} />
                      <span>{m.profile?.display_name ?? '?'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="notice notice--error" role="alert">{error}</p>}

            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={busy || (def.effect === 'steal' && !target)}
              onClick={redeem}
            >
              {busy ? 'Usando…' : 'Usar ahora'}
            </button>
          </div>
        )}
      </Sheet>
    </section>
  )
}
