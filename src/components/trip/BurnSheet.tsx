import { useState } from 'react'
import type { Drink, TripMember } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import Avatar from '../Avatar'
import Sheet from '../Sheet'
import PhotoPicker from './PhotoPicker'
import { uploadPhotos } from './uploadPhotos'

type Props = {
  open: boolean
  onClose: () => void
  tripId: string
  userId: string
  members: TripMember[]
  drinks: Drink[]
  isOwner: boolean
  onDone: (message: string) => void
  onGoToDrinks: () => void
}

/** Quemar: le sacás una foto a alguien tomando algo que resta (agua, Alikal…) */
export default function BurnSheet(props: Props) {
  const { open, onClose, tripId, userId, members, isOwner, onDone, onGoToDrinks } = props
  const api = useApi()
  const [who, setWho] = useState<string | null>(null)
  const [drinkId, setDrinkId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Blob[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const penalties = props.drinks.filter((d) => d.points < 0)
  const others = members.filter((m) => m.user_id !== userId)
  const drink = penalties.find((d) => d.id === drinkId) ?? null
  const target = others.find((m) => m.user_id === who)
  const targetName = target?.profile?.display_name ?? 'Alguien'

  const close = () => {
    setWho(null)
    setDrinkId(null)
    setPhotos([])
    setError(null)
    onClose()
  }

  const submit = async () => {
    if (!who || !drink || photos.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const [path] = await uploadPhotos(api, tripId, userId, photos)
      await api.burnPlayer(tripId, who, drink.id, path)
      close()
      onDone(`🔥 ¡Quemaste a ${targetName}! Si la mayoría lo valida, le restan ${-drink.points}`)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Quemar a alguien" onClose={close}>
      {penalties.length === 0 ? (
        <div className="empty-box">
          <p>La carta todavía no tiene tragos que restan (agua, Alikal, té de boldo…).</p>
          {isOwner ? (
            <button type="button" className="btn btn--primary" onClick={() => { close(); onGoToDrinks() }}>
              Agregarlos a la carta
            </button>
          ) : (
            <p className="muted">Pedile al organizador que los agregue en Reglas.</p>
          )}
        </div>
      ) : others.length === 0 ? (
        <div className="empty-box">
          <p>Para quemar a alguien tiene que haber más gente en el viaje 😅</p>
        </div>
      ) : (
        <div className="sheet-stack">
          <p className="muted">
            ¿Agarraste a alguien tomando agua o algo para la panza? Sacale una foto: si la mayoría la valida, le restan los puntos.
          </p>

          <div>
            <p className="step-label">1. ¿A quién agarraste?</p>
            <div className="who-grid">
              {others.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  className={`who-choice${m.user_id === who ? ' is-selected' : ''}`}
                  onClick={() => setWho(m.user_id)}
                  aria-pressed={m.user_id === who}
                >
                  <Avatar id={m.user_id} name={m.profile?.display_name ?? '?'} size={40} />
                  <span>{m.profile?.display_name ?? '?'}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="step-label">2. ¿Qué estaba tomando?</p>
            <div className="drink-grid">
              {penalties.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`drink-choice drink-choice--neg${d.id === drinkId ? ' is-selected' : ''}`}
                  onClick={() => setDrinkId(d.id)}
                  aria-pressed={d.id === drinkId}
                >
                  <span className="drink-choice-emoji" aria-hidden="true">{d.emoji}</span>
                  <span className="drink-choice-name">{d.name}</span>
                  <span className="drink-choice-pts">−{-d.points}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="step-label">3. Sacale la foto con las manos en la masa</p>
            <PhotoPicker photos={photos} onChange={setPhotos} label="Abrir cámara" />
          </div>

          {error && <p className="notice notice--error" role="alert">{error}</p>}

          <button
            type="button"
            className="btn btn--danger-solid btn--block"
            disabled={busy || !who || !drink || photos.length === 0}
            onClick={submit}
          >
            {busy
              ? 'Subiendo…'
              : !who
                ? 'Elegí a quién quemar'
                : !drink
                  ? '¿Qué estaba tomando?'
                  : `🔥 Quemar a ${targetName} (−${-drink.points})`}
          </button>
        </div>
      )}
    </Sheet>
  )
}
