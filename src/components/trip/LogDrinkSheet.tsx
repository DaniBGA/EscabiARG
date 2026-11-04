import { useState } from 'react'
import type { Drink } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import Sheet from '../Sheet'
import PhotoPicker from './PhotoPicker'
import { uploadPhotos } from './uploadPhotos'

type Props = {
  open: boolean
  onClose: () => void
  tripId: string
  userId: string
  drinks: Drink[]
  /** Tiene un "Doble o nada" activo */
  doubleActive: boolean
  isOwner: boolean
  onDone: (message: string) => void
  onGoToDrinks: () => void
}

export default function LogDrinkSheet(props: Props) {
  const { open, onClose, tripId, userId, doubleActive, isOwner, onDone, onGoToDrinks } = props
  // Los que restan no se cargan: te queman
  const drinks = props.drinks.filter((d) => d.points > 0)
  const api = useApi()
  const [drinkId, setDrinkId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Blob[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const drink = drinks.find((d) => d.id === drinkId) ?? null
  const points = drink ? drink.points * (doubleActive ? 2 : 1) : 0

  const close = () => {
    setDrinkId(null)
    setPhotos([])
    setError(null)
    onClose()
  }

  const submit = async () => {
    if (!drink || photos.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const [path] = await uploadPhotos(api, tripId, userId, photos)
      await api.logDrink(tripId, drink.id, path)
      close()
      onDone(`${drink.emoji} ¡Cargado! Cuando la mayoría lo valide suma +${points}`)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Cargar trago" onClose={close}>
      {drinks.length === 0 ? (
        <div className="empty-box">
          <p>Todavía no hay tragos en la carta.</p>
          {isOwner ? (
            <button type="button" className="btn btn--primary" onClick={() => { close(); onGoToDrinks() }}>
              Armar la carta
            </button>
          ) : (
            <p className="muted">Pedile al organizador que cargue los tragos.</p>
          )}
        </div>
      ) : (
        <div className="sheet-stack">
          <div>
            <p className="step-label">1. ¿Qué estás tomando?</p>
            <div className="drink-grid">
              {drinks.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`drink-choice${d.id === drinkId ? ' is-selected' : ''}`}
                  onClick={() => setDrinkId(d.id)}
                  aria-pressed={d.id === drinkId}
                >
                  <span className="drink-choice-emoji" aria-hidden="true">{d.emoji}</span>
                  <span className="drink-choice-name">{d.name}</span>
                  <span className="drink-choice-pts">+{d.points * (doubleActive ? 2 : 1)}</span>
                </button>
              ))}
            </div>
            {doubleActive && <p className="notice">✌️ Tenés <strong>Doble o nada</strong> activo: este trago suma el doble.</p>}
          </div>

          <div>
            <p className="step-label">2. Sacale una foto ahora</p>
            <PhotoPicker photos={photos} onChange={setPhotos} label="Abrir cámara" />
            <p className="muted small">Tus amigos ven la foto y la validan. Suma cuando la aprueba la mayoría.</p>
          </div>

          {error && <p className="notice notice--error" role="alert">{error}</p>}

          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={busy || !drink || photos.length === 0}
            onClick={submit}
          >
            {busy ? 'Subiendo…' : drink ? `Cargar ${drink.name} (+${points})` : 'Elegí un trago'}
          </button>
        </div>
      )}
    </Sheet>
  )
}
