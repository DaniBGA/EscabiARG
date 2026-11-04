import { useState } from 'react'
import type { PlayerForfeit, TripDetail } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import Avatar from '../Avatar'
import Sheet from '../Sheet'
import PhotoPicker from './PhotoPicker'
import { uploadPhotos } from './uploadPhotos'

type Props = {
  detail: TripDetail
  me: string
  onChange: (message?: string) => void
}

/** Infracciones (las reporta cualquiera, valida la mayoría) y las prendas que tocan */
export default function ForfeitsBox({ detail, me, onChange }: Props) {
  const api = useApi()
  const members = detail.trip.members
  const name = (id: string) => (id === me ? 'Vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? '?')
  const [reporting, setReporting] = useState(false)
  const [who, setWho] = useState<string | null>(null)
  const [infraction, setInfraction] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Blob[]>([])
  const [doing, setDoing] = useState<PlayerForfeit | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mine = detail.playerForfeits.filter((f) => f.user_id === me && f.status === 'to_do')
  const others = detail.playerForfeits.filter((f) => !(f.user_id === me && f.status === 'to_do')).slice(0, 12)

  const resetReport = () => {
    setReporting(false)
    setWho(null)
    setInfraction(null)
    setPhotos([])
    setError(null)
  }

  const report = async () => {
    if (!who || !infraction) return
    setBusy(true)
    setError(null)
    try {
      const paths = photos.length ? await uploadPhotos(api, detail.trip.id, me, photos) : []
      await api.reportInfraction(detail.trip.id, who, infraction, paths)
      const inf = detail.infractions.find((i) => i.id === infraction)
      resetReport()
      onChange(`${inf?.emoji ?? '📋'} Infracción reportada: si la valida la mayoría, a ${name(who)} le toca prenda`)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const complete = async () => {
    if (!doing) return
    setBusy(true)
    setError(null)
    try {
      const [path] = photos.length ? await uploadPhotos(api, detail.trip.id, me, photos) : [null]
      await api.completeForfeit(doing.id, path)
      setDoing(null)
      setPhotos([])
      onChange('🙈 ¡Prenda cumplida!')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card-box" id="prendas" aria-labelledby="forfeits-title">
      <h3 id="forfeits-title" className="box-title">🙈 Infracciones y prendas</h3>
      <p className="muted">
        ¿Alguien se levantó tarde o terminó roto? Reportalo: si la mayoría lo valida, le toca una prenda al azar.
      </p>
      <button type="button" className="btn btn--ghost btn--block forfeit-report" onClick={() => setReporting(true)}>
        📋 Reportar infracción
      </button>

      {mine.length > 0 && (
        <>
          <h4 className="sub-title">Tus prendas</h4>
          <ul className="forfeit-list">
            {mine.map((f) => (
              <li key={f.id} className="forfeit is-mine">
                <span className="forfeit-text">{f.forfeit}</span>
                <span className="forfeit-reason">Por: {f.reason}</span>
                <button type="button" className="btn btn--primary" onClick={() => setDoing(f)}>La cumplí</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <h4 className="sub-title">Prendas del viaje</h4>
          <ul className="forfeit-list">
            {others.map((f) => (
              <li key={f.id} className={`forfeit${f.status === 'done' ? ' is-done' : ''}`}>
                <span className="forfeit-who">
                  <Avatar id={f.user_id} name={name(f.user_id)} size={24} /> {name(f.user_id)}
                  <span className="forfeit-state">{f.status === 'done' ? '✅ cumplida' : '⏳ pendiente'}</span>
                </span>
                <span className="forfeit-text">{f.forfeit}</span>
                <span className="forfeit-reason">Por: {f.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={reporting} title="Reportar infracción" onClose={resetReport}>
        <div className="sheet-stack">
          <div>
            <p className="step-label">1. ¿Quién fue?</p>
            <div className="who-grid">
              {members.map((m) => (
                <button key={m.user_id} type="button" className={`who-choice${m.user_id === who ? ' is-selected' : ''}`}
                  onClick={() => setWho(m.user_id)} aria-pressed={m.user_id === who}>
                  <Avatar id={m.user_id} name={m.profile?.display_name ?? '?'} size={40} />
                  <span>{m.user_id === me ? 'Yo 🙈' : m.profile?.display_name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="step-label">2. ¿Qué hizo?</p>
            <div className="infraction-grid">
              {detail.infractions.map((i) => (
                <button key={i.id} type="button" className={`infraction-choice${i.id === infraction ? ' is-selected' : ''}`}
                  onClick={() => setInfraction(i.id)} aria-pressed={i.id === infraction}>
                  <span aria-hidden="true">{i.emoji}</span> {i.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="step-label">3. Prueba (opcional, hasta 3 fotos)</p>
            <PhotoPicker photos={photos} onChange={setPhotos} max={3} label="Sacar foto" />
          </div>
          {error && <p className="notice notice--error" role="alert">{error}</p>}
          <button type="button" className="btn btn--primary btn--block" disabled={busy || !who || !infraction} onClick={report}>
            {busy ? 'Enviando…' : 'Reportar'}
          </button>
        </div>
      </Sheet>

      <Sheet open={doing !== null} title="Cumplir prenda" onClose={() => { setDoing(null); setPhotos([]); setError(null) }}>
        <div className="sheet-stack">
          <p className="mission-text">{doing?.forfeit}</p>
          <div>
            <p className="step-label">Prueba (opcional)</p>
            <PhotoPicker photos={photos} onChange={setPhotos} label="Sacar foto" />
          </div>
          {error && <p className="notice notice--error" role="alert">{error}</p>}
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={complete}>
            {busy ? 'Guardando…' : 'Listo, la cumplí'}
          </button>
        </div>
      </Sheet>
    </section>
  )
}
