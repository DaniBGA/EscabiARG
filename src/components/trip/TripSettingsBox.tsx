import { useState } from 'react'
import type { Trip } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { ALL_FEATURES, OPTIONAL_FEATURES, formatDateRange, type Feature } from '../../lib/features'
import FeaturePicker from '../FeaturePicker'

type Props = {
  trip: Trip
  isOwner: boolean
  onChange: (message?: string) => void
}

const sameSet = (a: Feature[], b: Feature[]) => a.length === b.length && a.every((x) => b.includes(x))

/** Reglas: qué extras se juegan y las fechas (las cambia el organizador) */
export default function TripSettingsBox({ trip, isOwner, onChange }: Props) {
  const api = useApi()
  const current = trip.features ?? ALL_FEATURES
  const isOuting = trip.kind === 'salida'
  const [features, setFeatures] = useState<Feature[]>(current)
  const [start, setStart] = useState(trip.trip_date ?? '')
  const [end, setEnd] = useState(trip.end_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChange(message)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const datesChanged = start !== (trip.trip_date ?? '') || end !== (trip.end_date ?? '')
  const badDates = (isOuting && !start) || (Boolean(end) && (!start || end < start))

  if (!isOwner) {
    const on = OPTIONAL_FEATURES.filter((f) => current.includes(f.key))
    return (
      <section className="card-box" aria-labelledby="settings-title">
        <h3 id="settings-title" className="box-title">Qué se juega</h3>
        <p className="muted small">
          Lo de siempre (tragos, quemar, quebrar e infracciones)
          {on.length > 0 ? ` y además: ${on.map((f) => `${f.emoji} ${f.name}`).join(', ')}.` : '. Sin extras.'}
        </p>
        {trip.trip_date && (
          <p className="muted small">📅 {formatDateRange(trip.trip_date, trip.end_date)}</p>
        )}
      </section>
    )
  }

  return (
    <>
    <section className="card-box" aria-labelledby="settings-title">
      <h3 id="settings-title" className="box-title">Qué se juega</h3>
      <p className="muted small">Lo de siempre (tragos, quemar, quebrar e infracciones) está fijo. Los extras los podés prender o apagar cuando quieras.</p>
      <FeaturePicker value={features} onChange={setFeatures} disabled={busy} showCore={false} />
      {!sameSet(features, current) && (
        <button
          type="button"
          className="btn btn--primary btn--block settings-save"
          disabled={busy}
          onClick={() => run(() => api.setTripFeatures(trip.id, features), '✅ Extras actualizados')}
        >
          {busy ? 'Guardando…' : 'Guardar extras'}
        </button>
      )}
    </section>

    <section className="card-box" aria-labelledby="dates-title">
      <h3 id="dates-title" className="box-title">Fechas</h3>
      <div className="trip-form-row">
        <label className="field">
          <span>{isOuting ? 'Día de la salida' : 'Ida'}</span>
          <input type="date" value={start} disabled={busy} onChange={(e) => setStart(e.target.value)} />
        </label>
        {!isOuting && (
          <label className="field">
            <span>Vuelta</span>
            <input type="date" value={end} min={start || undefined} disabled={busy || !start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        )}
      </div>
      {datesChanged && (
        <button
          type="button"
          className="btn btn--primary btn--block settings-save"
          disabled={busy || badDates}
          onClick={() => run(() => api.setTripDates(trip.id, start || null, isOuting ? null : end || null), '📅 Fechas actualizadas')}
        >
          {badDates ? 'Revisá las fechas' : busy ? 'Guardando…' : 'Guardar fechas'}
        </button>
      )}
      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </section>
    </>
  )
}
