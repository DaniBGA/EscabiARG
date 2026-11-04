import { useState } from 'react'
import type { DailyMission, Difficulty, TripRules } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { DIFFICULTIES, difficultyLabel, missionPoints } from '../../lib/game'
import Sheet from '../Sheet'
import PhotoPicker from './PhotoPicker'
import { uploadPhotos } from './uploadPhotos'

type Props = {
  tripId: string
  userId: string
  rules: TripRules
  mission: DailyMission | null
  /** Están votando si tu misión es mala */
  underVote: boolean
  onChange: (message?: string) => void
}

export default function MissionCard({ tripId, userId, rules, mission, underVote, onChange }: Props) {
  const api = useApi()
  const [busy, setBusy] = useState<Difficulty | 'done' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [photos, setPhotos] = useState<Blob[]>([])

  const choose = async (d: Difficulty) => {
    setBusy(d)
    setError(null)
    try {
      await api.chooseMission(tripId, d)
      onChange()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
  }

  const complete = async () => {
    if (!mission) return
    setBusy('done')
    setError(null)
    try {
      const [path] = photos.length ? await uploadPhotos(api, tripId, userId, photos) : [null]
      await api.completeMission(tripId, path)
      setCompleting(false)
      setPhotos([])
      onChange(`🎉 ¡Misión cumplida! +${mission.points} puntos`)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card-box mission" aria-labelledby="mission-title">
      <h3 id="mission-title" className="box-title">Tu misión de hoy</h3>

      {!mission ? (
        <>
          <p className="muted">Elegí la dificultad y te toca una misión al azar. Una por jornada, sin cambiar.</p>
          <div className="difficulty-row">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`difficulty difficulty--${d.key}`}
                onClick={() => choose(d.key)}
                disabled={busy !== null}
              >
                <span className="difficulty-emoji" aria-hidden="true">{d.emoji}</span>
                <span className="difficulty-name">{d.label}</span>
                <span className="difficulty-pts">+{missionPoints(rules, d.key)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className={`mission-body difficulty--${mission.difficulty}`}>
          <span className="mission-badge">
            {DIFFICULTIES.find((d) => d.key === mission.difficulty)?.emoji} {difficultyLabel(mission.difficulty)} · +{mission.points}
          </span>
          <p className="mission-text">{mission.mission}</p>
          {mission.group_assigned && <span className="badge-group">elegida por el grupo</span>}
          {mission.completed_at ? (
            <p className="mission-done">✅ ¡Cumplida! Mañana te toca otra.</p>
          ) : underVote ? (
            <p className="notice">🗳️ Están votando si tu misión es mala. Esperá a que termine para cumplirla.</p>
          ) : (
            <button type="button" className="btn btn--primary btn--block" onClick={() => setCompleting(true)}>
              ¡La cumplí!
            </button>
          )}
        </div>
      )}

      {error && !completing && <p className="notice notice--error" role="alert">{error}</p>}

      <Sheet
        open={completing}
        title="Misión cumplida"
        onClose={() => {
          setCompleting(false)
          setPhotos([])
          setError(null)
        }}
      >
        <div className="sheet-stack">
          <p className="mission-text">{mission?.mission}</p>
          <div>
            <p className="step-label">Prueba (opcional)</p>
            <PhotoPicker photos={photos} onChange={setPhotos} label="Sacar foto de prueba" />
          </div>
          {error && <p className="notice notice--error" role="alert">{error}</p>}
          <button type="button" className="btn btn--primary btn--block" disabled={busy !== null} onClick={complete}>
            {busy === 'done' ? 'Guardando…' : `Sumar +${mission?.points ?? 0} puntos`}
          </button>
        </div>
      </Sheet>
    </section>
  )
}
