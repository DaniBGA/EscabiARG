import { useState, type FormEvent } from 'react'
import type { Profile, TripKind } from '../lib/api'
import { DEFAULT_CUTOFF_HOUR, tripDay } from '../lib/game'
import { useApi } from '../lib/authContext'
import { friendlyError } from '../lib/errors'
import Avatar from './Avatar'
import Sheet from './Sheet'
import { CheckIcon, FriendsIcon } from './icons'
import './CreateTripSheet.css'

type Props = {
  open: boolean
  /** Viaje (varios días) o previa y salida (una jornada) */
  kind: TripKind
  onClose: () => void
  friends: Profile[]
  onCreated: () => void
  onOpenFriends: () => void
}

export default function CreateTripSheet({ open, kind, onClose, friends, onCreated, onOpenFriends }: Props) {
  const isOuting = kind === 'salida'
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [place, setPlace] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const api = useApi()

  const reset = () => {
    setName('')
    setDate('')
    setPlace('')
    setSelected(new Set())
    setError(null)
  }

  const close = () => {
    reset()
    onClose()
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = friends.length > 0 && selected.size === friends.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(friends.map((f) => f.id)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.createTrip({
        name: name.trim(),
        // Una salida sin fecha elegida es para hoy (la base calcula la jornada)
        tripDate: date || null,
        kind,
        place: place.trim() || null,
        // Solo amigos que siguen en la lista (por si se quitó alguno mientras tanto)
        memberIds: friends.filter((f) => selected.has(f.id)).map((f) => f.id),
      })
      reset()
      onCreated()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title={isOuting ? 'Nueva previa y salida' : 'Nuevo viaje'} onClose={close}>
      {isOuting && (
        <p className="muted small create-outing-note">
          🌙 Es igual que un viaje pero dura una sola jornada: tragos, misiones, duelos, casino y todo lo demás, solo por esa noche.
        </p>
      )}
      <form className="trip-form" onSubmit={submit}>
        <label className="field">
          <span>Nombre del viaje</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isOuting ? 'Ej: Previa del viernes' : 'Ej: Finde en la costa'}
            maxLength={60}
            required
            autoFocus
          />
        </label>

        <div className="trip-form-row">
          <label className="field">
            <span>{isOuting ? 'Día de la salida' : <>Fecha <em>(opcional)</em></>}</span>
            <input type="date" value={date || (isOuting ? tripDay(DEFAULT_CUTOFF_HOUR) : '')} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Lugar <em>(opcional)</em></span>
            <input
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Ej: Lo de Juan"
              maxLength={80}
            />
          </label>
        </div>

        <fieldset className="invite">
          <legend className="invite-legend">
            <span>Invitar amigos</span>
            {friends.length > 0 && (
              <button type="button" className="invite-all" onClick={toggleAll}>
                {allSelected ? 'Ninguno' : 'Todos'}
              </button>
            )}
          </legend>

          {friends.length === 0 ? (
            <div className="invite-empty">
              <p>Todavía no tenés amigos agregados. Podés crear el viaje igual o sumar amigos primero.</p>
              <button type="button" className="btn btn--ghost" onClick={onOpenFriends}>
                <FriendsIcon size={20} />
                Agregar amigos
              </button>
            </div>
          ) : (
            <ul className="invite-list">
              {friends.map((f) => {
                const checked = selected.has(f.id)
                return (
                  <li key={f.id}>
                    <label className={`invite-item${checked ? ' is-checked' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(f.id)} />
                      <Avatar id={f.id} name={f.display_name} size={36} />
                      <span className="invite-name">{f.display_name}</span>
                      <span className="invite-check" aria-hidden="true">
                        {checked && <CheckIcon />}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>

        {error && <p className="notice notice--error" role="alert">{error}</p>}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !name.trim()}>
          {busy
            ? 'Creando…'
            : selected.size > 0
              ? `Crear ${isOuting ? 'salida' : 'viaje'} con ${selected.size} amigo${selected.size === 1 ? '' : 's'}`
              : isOuting ? 'Crear salida' : 'Crear viaje'}
        </button>
      </form>
    </Sheet>
  )
}
