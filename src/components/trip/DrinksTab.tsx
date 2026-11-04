import { useState, type FormEvent } from 'react'
import type { Drink, DrinkInput, TripRules } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { EditIcon, TrashIcon } from '../icons'

type Props = {
  tripId: string
  drinks: Drink[]
  rules: TripRules
  isOwner: boolean
  onChange: (message?: string) => void
}

const EMOJIS = ['🍺', '🥃', '🍸', '🍷', '🍹', '🥂', '🍾', '🧉', '🔥', '💧']

const SUGGESTED: DrinkInput[] = [
  { name: 'Birra', emoji: '🍺', points: 5 },
  { name: 'Vino', emoji: '🍷', points: 6 },
  { name: 'Gin tonic', emoji: '🍸', points: 8 },
  { name: 'Fernet con coca', emoji: '🥃', points: 10 },
  { name: 'Shot', emoji: '🔥', points: 12 },
  { name: 'Vaso de agua', emoji: '💧', points: 2 },
]

const RULE_FIELDS: { key: keyof TripRules; label: string }[] = [
  { key: 'mission_points_easy', label: '🎯 Misión fácil' },
  { key: 'mission_points_medium', label: '🔥 Misión intermedia' },
  { key: 'mission_points_extreme', label: '💀 Misión extrema' },
  { key: 'quiebre_penalty', label: '😵 Descuento por quebrar' },
]

function DrinkForm({ initial, onSave, onCancel }: {
  initial: DrinkInput
  onSave: (d: DrinkInput) => Promise<void>
  onCancel?: () => void
}) {
  const [emoji, setEmoji] = useState(initial.emoji)
  const [name, setName] = useState(initial.name)
  const [points, setPoints] = useState(String(initial.points || ''))
  const [busy, setBusy] = useState(false)

  const pts = Number(points)
  const valid = name.trim().length > 0 && Number.isInteger(pts) && pts >= 1 && pts <= 500

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      await onSave({ id: initial.id, emoji, name: name.trim(), points: pts })
      if (!initial.id) {
        setName('')
        setPoints('')
      }
    } catch {
      // el error ya se muestra arriba; dejamos los datos para reintentar
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="drink-form" onSubmit={submit}>
      <div className="emoji-row" role="group" aria-label="Ícono">
        {EMOJIS.map((em) => (
          <button
            key={em}
            type="button"
            className={`emoji-btn${em === emoji ? ' is-selected' : ''}`}
            onClick={() => setEmoji(em)}
            aria-pressed={em === emoji}
          >
            {em}
          </button>
        ))}
      </div>
      <div className="drink-form-row">
        <label className="field">
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Fernet con coca" maxLength={40} required />
        </label>
        <label className="field field--pts">
          <span>Puntos</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="10"
            required
          />
        </label>
      </div>
      <div className="drink-form-actions">
        {onCancel && <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>}
        <button type="submit" className="btn btn--primary" disabled={busy || !valid}>
          {initial.id ? 'Guardar' : 'Agregar trago'}
        </button>
      </div>
    </form>
  )
}

export default function DrinksTab({ tripId, drinks, rules, isOwner, onChange }: Props) {
  const api = useApi()
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ruleDraft, setRuleDraft] = useState<Record<keyof TripRules, string>>(() => ({
    mission_points_easy: String(rules.mission_points_easy),
    mission_points_medium: String(rules.mission_points_medium),
    mission_points_extreme: String(rules.mission_points_extreme),
    quiebre_penalty: String(rules.quiebre_penalty),
  }))
  const [savingRules, setSavingRules] = useState(false)

  const run = async (fn: () => Promise<void>, message?: string) => {
    setError(null)
    try {
      await fn()
      onChange(message)
    } catch (err) {
      setError(friendlyError(err))
      throw err
    }
  }

  const save = async (d: DrinkInput) => {
    await run(() => api.saveDrink(tripId, d), d.id ? 'Trago actualizado' : `${d.emoji} ${d.name} agregado a la carta`)
    setEditing(null)
  }

  const remove = (d: Drink) => {
    if (!window.confirm(`¿Sacar "${d.name}" de la carta? Los puntos ya cargados se mantienen.`)) return
    run(() => api.archiveDrink(d.id), 'Trago eliminado').catch(() => undefined)
  }

  const addSuggested = () =>
    run(async () => {
      for (const d of SUGGESTED) await api.saveDrink(tripId, d)
    }, 'Carta sugerida cargada 🍻').catch(() => undefined)

  const parsedRules = Object.fromEntries(
    RULE_FIELDS.map((f) => [f.key, Number(ruleDraft[f.key])]),
  ) as TripRules
  const rulesValid = RULE_FIELDS.every((f) => {
    const v = parsedRules[f.key]
    return Number.isInteger(v) && v >= 0 && v <= 500
  })
  const rulesChanged = RULE_FIELDS.some((f) => parsedRules[f.key] !== rules[f.key])

  const saveRules = async (e: FormEvent) => {
    e.preventDefault()
    setSavingRules(true)
    await run(() => api.updateRules(tripId, parsedRules), 'Reglas guardadas').catch(() => undefined)
    setSavingRules(false)
  }

  return (
    <>
      <section className="card-box" aria-labelledby="drinks-title">
        <h3 id="drinks-title" className="box-title">Carta de tragos</h3>
        {!isOwner && <p className="muted small">Solo el organizador puede armar la carta y elegir los puntos.</p>}

        {drinks.length === 0 ? (
          <div className="empty-box">
            <p>Todavía no hay tragos cargados.</p>
            {isOwner && (
              <button type="button" className="btn btn--ghost" onClick={addSuggested}>
                ✨ Usar carta sugerida
              </button>
            )}
          </div>
        ) : (
          <ul className="drink-list">
            {drinks.map((d) =>
              editing === d.id ? (
                <li key={d.id} className="drink-row is-editing">
                  <DrinkForm initial={d} onSave={save} onCancel={() => setEditing(null)} />
                </li>
              ) : (
                <li key={d.id} className="drink-row">
                  <span className="drink-emoji" aria-hidden="true">{d.emoji}</span>
                  <span className="drink-name">{d.name}</span>
                  <span className="pts-chip">+{d.points}</span>
                  {isOwner && (
                    <span className="drink-actions">
                      <button type="button" className="icon-btn icon-btn--sm" aria-label={`Editar ${d.name}`} onClick={() => setEditing(d.id)}>
                        <EditIcon />
                      </button>
                      <button type="button" className="icon-btn icon-btn--sm" aria-label={`Eliminar ${d.name}`} onClick={() => remove(d)}>
                        <TrashIcon />
                      </button>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        )}

        {isOwner && editing === null && (
          <>
            <h4 className="sub-title">Agregar trago</h4>
            <DrinkForm initial={{ name: '', emoji: '🍺', points: 0 }} onSave={save} />
          </>
        )}
        {error && <p className="notice notice--error" role="alert">{error}</p>}
      </section>

      <section className="card-box" aria-labelledby="rules-title">
        <h3 id="rules-title" className="box-title">Reglas del viaje</h3>
        {isOwner ? (
          <form className="rules-form" onSubmit={saveRules}>
            {RULE_FIELDS.map((f) => (
              <label key={f.key} className="rule-row">
                <span>{f.label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={500}
                  value={ruleDraft[f.key]}
                  onChange={(e) => setRuleDraft({ ...ruleDraft, [f.key]: e.target.value })}
                />
              </label>
            ))}
            <button type="submit" className="btn btn--primary btn--block" disabled={savingRules || !rulesValid || !rulesChanged}>
              Guardar reglas
            </button>
          </form>
        ) : (
          <ul className="rules-list">
            {RULE_FIELDS.map((f) => (
              <li key={f.key}>
                <span>{f.label}</span>
                <strong>{f.key === 'quiebre_penalty' ? `-${rules[f.key]}` : `+${rules[f.key]}`}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
