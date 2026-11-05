import { useState, type FormEvent } from 'react'
import type { Forfeit, Infraction, Theme } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { TrashIcon } from '../icons'

type Props = {
  tripId: string
  infractions: Infraction[]
  forfeits: Forfeit[]
  isOwner: boolean
  onChange: (message?: string) => void
}

const EMOJIS = ['📋', '😴', '🥴', '🕐', '📱', '💸', '🍕', '💤', '🧹', '👀', '🎶', '🤥']
const BOLICHE_EMOJIS = ['🪩', '🧭', '🛋️', '🎟️', '🏃', '📱', '😴', '🧥', '🚫', '🕺']

/** Listas de infracciones y prendas del viaje (las edita el organizador) */
export default function ListsEditor({ tripId, infractions, forfeits, isOwner, onChange }: Props) {
  const api = useApi()
  const [emoji, setEmoji] = useState('📋')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Qué listas se ven y se editan: las de siempre o las de la Hora boliche */
  const [theme, setTheme] = useState<Theme>('normal')
  const ofTheme = <T extends { theme?: Theme }>(rows: T[]) => rows.filter((r) => (r.theme ?? 'normal') === theme)
  const emojis = theme === 'boliche' ? BOLICHE_EMOJIS : EMOJIS

  const run = async (fn: () => Promise<void>, message: string) => {
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

  const addInfraction = async (e: FormEvent) => {
    e.preventDefault()
    if (await run(() => api.saveInfraction(tripId, { name, emoji, theme }), `${emoji} Infracción agregada`)) setName('')
  }

  const addForfeit = async (e: FormEvent) => {
    e.preventDefault()
    if (await run(() => api.saveForfeit(tripId, { text, theme }), '🙈 Prenda agregada')) setText('')
  }

  const themeToggle = (
    <div className="seg seg--lists" role="group" aria-label="¿Qué listas?">
      <button type="button" className={`seg-btn${theme === 'normal' ? ' is-selected' : ''}`} aria-pressed={theme === 'normal'}
        onClick={() => { setTheme('normal'); setEmoji('📋') }}>
        De siempre
      </button>
      <button type="button" className={`seg-btn seg-btn--boliche${theme === 'boliche' ? ' is-selected' : ''}`} aria-pressed={theme === 'boliche'}
        onClick={() => { setTheme('boliche'); setEmoji('🪩') }}>
        🪩 De boliche
      </button>
    </div>
  )

  return (
    <>
      <section className="card-box" aria-labelledby="inf-title">
        <h3 id="inf-title" className="box-title">Infracciones</h3>
        {themeToggle}
        {theme === 'boliche' && <p className="muted small">Se usan mientras está activada la Hora boliche.</p>}
        <ul className="drink-list">
          {ofTheme(infractions).map((i) => (
            <li key={i.id} className="drink-row">
              <span className="drink-emoji" aria-hidden="true">{i.emoji}</span>
              <span className="drink-name">{i.name}</span>
              {isOwner && (
                <button type="button" className="icon-btn icon-btn--sm" aria-label={`Eliminar ${i.name}`}
                  onClick={() => window.confirm(`¿Sacar "${i.name}" de la lista?`) && run(() => api.archiveInfraction(i.id), 'Infracción eliminada')}>
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <form className="drink-form list-form" onSubmit={addInfraction}>
            <div className="emoji-row" role="group" aria-label="Ícono">
              {emojis.map((em) => (
                <button key={em} type="button" className={`emoji-btn${em === emoji ? ' is-selected' : ''}`}
                  onClick={() => setEmoji(em)} aria-pressed={em === emoji}>{em}</button>
              ))}
            </div>
            <div className="add-friend-row">
              <input className="list-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Roncar como un oso" maxLength={60} />
              <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>Agregar</button>
            </div>
          </form>
        )}
      </section>

      <section className="card-box" aria-labelledby="forf-title">
        <h3 id="forf-title" className="box-title">Prendas</h3>
        {themeToggle}
        <p className="muted small">
          {theme === 'boliche'
            ? 'En Hora boliche, la prenda que toca sale de esta lista.'
            : 'Cuando una infracción se valida o la comida sale mala, toca una de estas al azar.'}
        </p>
        <ul className="drink-list">
          {ofTheme(forfeits).map((f) => (
            <li key={f.id} className="drink-row">
              <span className="drink-name drink-name--wrap">{f.text}</span>
              {isOwner && (
                <button type="button" className="icon-btn icon-btn--sm" aria-label="Eliminar prenda"
                  onClick={() => window.confirm('¿Sacar esta prenda de la lista?') && run(() => api.archiveForfeit(f.id), 'Prenda eliminada')}>
                  <TrashIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <form className="add-friend-row list-form" onSubmit={addForfeit}>
            <input className="list-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej: Invitar los helados" maxLength={140} />
            <button type="submit" className="btn btn--primary" disabled={busy || text.trim().length < 3}>Agregar</button>
          </form>
        )}
        {!isOwner && <p className="muted small">Solo el organizador puede cambiar las listas.</p>}
        {error && <p className="notice notice--error" role="alert">{error}</p>}
      </section>
    </>
  )
}
