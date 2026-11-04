import { useState, type FormEvent } from 'react'
import type { Drink, DrinkInput, TripRules } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { formatHour } from '../../lib/game'
import { EditIcon, TrashIcon } from '../icons'

type Props = {
  tripId: string
  drinks: Drink[]
  rules: TripRules
  isOwner: boolean
  onChange: (message?: string) => void
}

const EMOJIS = ['🍺', '🥃', '🍸', '🍷', '🍹', '🥂', '🍾', '🧉', '🔥']
/** Para los que restan: agua, algo para la panza, gaseosa sola… */
const PENALTY_EMOJIS = ['💧', '💊', '🍵', '🥤', '☕', '🧃']

const SUGGESTED: DrinkInput[] = [
  { name: 'Birra', emoji: '🍺', points: 5 },
  { name: 'Vino', emoji: '🍷', points: 6 },
  { name: 'Gin tonic', emoji: '🍸', points: 8 },
  { name: 'Fernet con coca', emoji: '🥃', points: 10 },
  { name: 'Shot', emoji: '🔥', points: 12 },
]

/** Los que restan: si te agarran tomando esto, te queman */
const SUGGESTED_PENALTIES: DrinkInput[] = [
  { name: 'Vaso de agua', emoji: '💧', points: -5 },
  { name: 'Gaseosa sola', emoji: '🥤', points: -3 },
  { name: 'Té de boldo', emoji: '🍵', points: -8 },
  { name: 'Alikal', emoji: '💊', points: -10 },
]

type PointRule = Exclude<keyof TripRules, 'day_cutoff_hour'>

const RULE_FIELDS: { key: PointRule; label: string }[] = [
  { key: 'mission_points_easy', label: '🎯 Misión fácil' },
  { key: 'mission_points_medium', label: '🔥 Misión intermedia' },
  { key: 'mission_points_extreme', label: '💀 Misión extrema' },
  { key: 'quiebre_penalty', label: '😵 Descuento por quebrar' },
  { key: 'chef_points', label: '👨‍🍳 Cocinar o preparar bien' },
  { key: 'casino_points', label: '🎰 Ganar el casino' },
  { key: 'duel_points', label: '⚔️ Ganar un duelo' },
]

function DrinkForm({ initial, onSave, onCancel }: {
  initial: DrinkInput
  onSave: (d: DrinkInput) => Promise<void>
  onCancel?: () => void
}) {
  const [emoji, setEmoji] = useState(initial.emoji)
  const [name, setName] = useState(initial.name)
  const [points, setPoints] = useState(String(Math.abs(initial.points) || ''))
  /** true = resta puntos (agua, Alikal…) */
  const [penalty, setPenalty] = useState(initial.points < 0)
  const [busy, setBusy] = useState(false)

  const pts = Number(points)
  const valid = name.trim().length > 0 && Number.isInteger(pts) && pts >= 1 && pts <= 500
  const emojis = penalty ? PENALTY_EMOJIS : EMOJIS

  const switchKind = (next: boolean) => {
    if (next === penalty) return
    setPenalty(next)
    const list = next ? PENALTY_EMOJIS : EMOJIS
    if (!list.includes(emoji)) setEmoji(list[0])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      await onSave({ id: initial.id, emoji, name: name.trim(), points: penalty ? -pts : pts })
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
      <div className="seg" role="group" aria-label="¿Suma o resta?">
        <button type="button" className={`seg-btn${!penalty ? ' is-selected' : ''}`} aria-pressed={!penalty} onClick={() => switchKind(false)}>
          ➕ Suma
        </button>
        <button type="button" className={`seg-btn seg-btn--neg${penalty ? ' is-selected' : ''}`} aria-pressed={penalty} onClick={() => switchKind(true)}>
          ➖ Resta
        </button>
      </div>
      {penalty && (
        <p className="muted small">No se carga: si alguien te agarra tomándolo, te quema con una foto 🔥</p>
      )}
      <div className="emoji-row" role="group" aria-label="Ícono">
        {emojis.map((em) => (
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={penalty ? 'Ej: Alikal' : 'Ej: Fernet con coca'}
            maxLength={40}
            required
          />
        </label>
        <label className="field field--pts">
          <span>{penalty ? 'Resta' : 'Puntos'}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder={penalty ? '5' : '10'}
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
  const [ruleDraft, setRuleDraft] = useState<Record<PointRule, string>>(() => ({
    mission_points_easy: String(rules.mission_points_easy),
    mission_points_medium: String(rules.mission_points_medium),
    mission_points_extreme: String(rules.mission_points_extreme),
    quiebre_penalty: String(rules.quiebre_penalty),
    chef_points: String(rules.chef_points),
    casino_points: String(rules.casino_points),
    duel_points: String(rules.duel_points),
  }))
  const [cutoff, setCutoff] = useState(rules.day_cutoff_hour)
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

  const addSuggested = (list: DrinkInput[], message: string) =>
    run(async () => {
      for (const d of list) await api.saveDrink(tripId, d)
    }, message).catch(() => undefined)

  const plus = drinks.filter((d) => d.points > 0)
  const minus = drinks.filter((d) => d.points < 0)

  const row = (d: Drink) =>
    editing === d.id ? (
      <li key={d.id} className="drink-row is-editing">
        <DrinkForm initial={d} onSave={save} onCancel={() => setEditing(null)} />
      </li>
    ) : (
      <li key={d.id} className="drink-row">
        <span className="drink-emoji" aria-hidden="true">{d.emoji}</span>
        <span className="drink-name">{d.name}</span>
        <span className="leader" aria-hidden="true" />
        <span className={`pts-chip${d.points < 0 ? ' is-neg' : ''}`}>{d.points > 0 ? `+${d.points}` : `−${-d.points}`}</span>
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
    )

  const parsedRules = {
    ...(Object.fromEntries(RULE_FIELDS.map((f) => [f.key, Number(ruleDraft[f.key])])) as Record<PointRule, number>),
    day_cutoff_hour: cutoff,
  } satisfies TripRules
  const rulesValid = RULE_FIELDS.every((f) => {
    const v = parsedRules[f.key]
    return Number.isInteger(v) && v >= 0 && v <= 500
  })
  const rulesChanged =
    RULE_FIELDS.some((f) => parsedRules[f.key] !== rules[f.key]) || cutoff !== rules.day_cutoff_hour

  const saveRules = async (e: FormEvent) => {
    e.preventDefault()
    setSavingRules(true)
    await run(() => api.updateRules(tripId, parsedRules), 'Reglas guardadas').catch(() => undefined)
    setSavingRules(false)
  }

  return (
    <>
      <section className="card-box card-box--board board-surface" aria-labelledby="drinks-title">
        <h3 id="drinks-title" className="box-title">La carta</h3>
        {!isOwner && <p className="muted small">Solo el organizador puede armar la carta y elegir los puntos.</p>}

        {drinks.length === 0 ? (
          <div className="empty-box">
            <p>Todavía no hay tragos cargados.</p>
            {isOwner && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => addSuggested([...SUGGESTED, ...SUGGESTED_PENALTIES], 'Carta sugerida cargada 🍻')}
              >
                Usar carta sugerida
              </button>
            )}
          </div>
        ) : (
          <>
            {plus.length > 0 && <ul className="drink-list">{plus.map(row)}</ul>}

            <h4 className="sub-title sub-title--neg">🔥 Los que restan</h4>
            <p className="muted small">
              No se cargan: si agarrás a alguien tomando uno de estos, sacale una foto con <strong>Quemar</strong>.
            </p>
            {minus.length > 0 ? (
              <ul className="drink-list drink-list--neg">{minus.map(row)}</ul>
            ) : isOwner ? (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => addSuggested(SUGGESTED_PENALTIES, '💧 Ahora el agua y el Alikal restan')}
              >
                Agregar los sugeridos (agua, boldo, Alikal…)
              </button>
            ) : (
              <p className="muted small">Todavía no hay ninguno: el organizador los puede agregar.</p>
            )}
          </>
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
            <label className="rule-row">
              <span>🌅 Fin de la jornada</span>
              <select value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </label>
            <p className="muted small">
              A esa hora (de Argentina) cierra el día: se define el ganador y arranca la jornada siguiente.
            </p>
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
            <li>
              <span>🌅 Fin de la jornada</span>
              <strong>{formatHour(rules.day_cutoff_hour)} hs</strong>
            </li>
          </ul>
        )}
      </section>
    </>
  )
}
