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
  /** Se pueden reportar infracciones nuevas (no en una salida cerrada) */
  canReport?: boolean
  /** Hora boliche: se ofrecen las infracciones de boliche */
  boliche?: boolean
}

/** Infracciones (las reporta cualquiera, valida la mayoría) y las prendas que tocan */
export default function ForfeitsBox({ detail, me, onChange, canReport = true, boliche = false }: Props) {
  const api = useApi()
  const members = detail.trip.members
  const name = (id: string) => (id === me ? 'Vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? '?')
  const [reporting, setReporting] = useState(false)
  const [who, setWho] = useState<string | null>(null)
  const [infraction, setInfraction] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Blob[]>([])
  /** Qué prenda le toca: al azar, una de las cargadas o escrita por quien reporta */
  const [forfeitMode, setForfeitMode] = useState<'random' | 'list' | 'write'>('random')
  const [pickedForfeit, setPickedForfeit] = useState<string | null>(null)
  const [writtenForfeit, setWrittenForfeit] = useState('')
  const [doing, setDoing] = useState<PlayerForfeit | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const theme = boliche ? 'boliche' : 'normal'
  const themed = detail.infractions.filter((i) => (i.theme ?? 'normal') === theme)
  const infractions = themed.length > 0 ? themed : detail.infractions
  const themedForfeits = detail.forfeits.filter((f) => (f.theme ?? 'normal') === theme)
  const forfeitOptions = themedForfeits.length > 0 ? themedForfeits : detail.forfeits
  const chosenForfeit =
    forfeitMode === 'write'
      ? writtenForfeit.trim()
      : forfeitMode === 'list'
        ? forfeitOptions.find((f) => f.id === pickedForfeit)?.text ?? ''
        : null
  const forfeitReady = forfeitMode === 'random' || (chosenForfeit !== null && chosenForfeit.length >= 3)
  const mine = detail.playerForfeits.filter((f) => f.user_id === me && f.status === 'to_do')
  const others = detail.playerForfeits.filter((f) => !(f.user_id === me && f.status === 'to_do')).slice(0, 12)

  const resetReport = () => {
    setReporting(false)
    setWho(null)
    setInfraction(null)
    setPhotos([])
    setForfeitMode('random')
    setPickedForfeit(null)
    setWrittenForfeit('')
    setError(null)
  }

  const report = async () => {
    if (!who || !infraction || !forfeitReady) return
    setBusy(true)
    setError(null)
    try {
      const paths = photos.length ? await uploadPhotos(api, detail.trip.id, me, photos) : []
      await api.reportInfraction(detail.trip.id, who, infraction, paths, chosenForfeit)
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
    <section className="card-box card-box--forfeit" id="prendas" aria-labelledby="forfeits-title">
      <h3 id="forfeits-title" className="box-title">Infracciones y prendas</h3>
      <p className="muted">
        ¿Alguien se levantó tarde o terminó roto? Reportalo y elegí la prenda (o que toque una al azar): si la mayoría lo valida, la tiene que cumplir.
      </p>
      {canReport && (
        <button type="button" className="btn btn--ghost btn--block forfeit-report" onClick={() => setReporting(true)}>
          Reportar infracción
        </button>
      )}

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
              {infractions.map((i) => (
                <button key={i.id} type="button" className={`infraction-choice${i.id === infraction ? ' is-selected' : ''}`}
                  onClick={() => setInfraction(i.id)} aria-pressed={i.id === infraction}>
                  <span aria-hidden="true">{i.emoji}</span> {i.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="step-label">3. ¿Qué prenda le toca?</p>
            <div className="seg seg--3" role="group" aria-label="Prenda">
              {([
                ['random', '🎲 Al azar'],
                ['list', '📋 Elegir una de las cargadas'],
                ['write', '✍️ Escribirla'],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" className={`seg-btn${forfeitMode === key ? ' is-selected' : ''}`}
                  aria-pressed={forfeitMode === key} onClick={() => setForfeitMode(key)}>
                  {label}
                </button>
              ))}
            </div>
            {forfeitMode === 'random' && (
              <p className="muted small">Cuando se valide, le toca una de la lista{boliche ? ' de boliche' : ''} al azar.</p>
            )}
            {forfeitMode === 'list' && (
              forfeitOptions.length === 0 ? (
                <p className="muted small">No hay prendas cargadas: el organizador las agrega en Reglas.</p>
              ) : (
                <div className="forfeit-options">
                  {forfeitOptions.map((f) => (
                    <button key={f.id} type="button" className={`infraction-choice${f.id === pickedForfeit ? ' is-selected' : ''}`}
                      onClick={() => setPickedForfeit(f.id)} aria-pressed={f.id === pickedForfeit}>
                      {f.text}
                    </button>
                  ))}
                </div>
              )
            )}
            {forfeitMode === 'write' && (
              <label className="field">
                <span>La prenda</span>
                <textarea
                  className="forfeit-input"
                  value={writtenForfeit}
                  onChange={(e) => setWrittenForfeit(e.target.value)}
                  placeholder="Ej: Bailar la Macarena en el medio del living"
                  maxLength={140}
                  rows={2}
                />
              </label>
            )}
          </div>
          <div>
            <p className="step-label">4. Prueba (opcional, hasta 3 fotos o videos)</p>
            <PhotoPicker photos={photos} onChange={setPhotos} max={3} label="Foto o video" allowVideo />
          </div>
          {error && <p className="notice notice--error" role="alert">{error}</p>}
          <button type="button" className="btn btn--primary btn--block" disabled={busy || !who || !infraction || !forfeitReady} onClick={report}>
            {busy ? 'Enviando…' : !forfeitReady ? (forfeitMode === 'write' ? 'Escribí la prenda' : 'Elegí la prenda') : 'Reportar'}
          </button>
        </div>
      </Sheet>

      <Sheet open={doing !== null} title="Cumplir prenda" onClose={() => { setDoing(null); setPhotos([]); setError(null) }}>
        <div className="sheet-stack">
          <p className="mission-text">{doing?.forfeit}</p>
          <div>
            <p className="step-label">Prueba (opcional)</p>
            <PhotoPicker photos={photos} onChange={setPhotos} label="Foto o video de prueba" allowVideo />
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
