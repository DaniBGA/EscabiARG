import { useState } from 'react'
import type { TripMember } from '../../lib/api'
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
  penalty: number
  onDone: (message: string) => void
}

export default function QuiebreSheet({ open, onClose, tripId, userId, members, penalty, onDone }: Props) {
  const api = useApi()
  const [who, setWho] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = members.find((m) => m.user_id === who)

  const close = () => {
    setWho(null)
    setFiles([])
    setError(null)
    onClose()
  }

  const submit = async () => {
    if (!who || files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const paths = await uploadPhotos(api, tripId, userId, files)
      await api.reportQuiebre(tripId, who, paths)
      const name = who === userId ? 'Vos' : target?.profile?.display_name ?? 'Alguien'
      close()
      onDone(`😵 ${name} quebró: -${penalty} puntos`)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title="Reportar quiebre" onClose={close}>
      <div className="sheet-stack">
        <p className="muted">
          Al que quiebra se le restan <strong>{penalty} puntos</strong>. Para que cuente, hacen falta fotos de la quebrada.
        </p>

        <div>
          <p className="step-label">1. ¿Quién quebró?</p>
          <div className="who-grid">
            {members.map((m) => (
              <button
                key={m.user_id}
                type="button"
                className={`who-choice${m.user_id === who ? ' is-selected' : ''}`}
                onClick={() => setWho(m.user_id)}
                aria-pressed={m.user_id === who}
              >
                <Avatar id={m.user_id} name={m.profile?.display_name ?? '?'} size={40} />
                <span>{m.user_id === userId ? 'Yo 🙈' : m.profile?.display_name ?? '?'}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="step-label">2. Fotos de la quebrada (1 a 3)</p>
          <PhotoPicker files={files} onChange={setFiles} max={3} label="Sacar foto" />
        </div>

        {error && <p className="notice notice--error" role="alert">{error}</p>}

        <button
          type="button"
          className="btn btn--danger-solid btn--block"
          disabled={busy || !who || files.length === 0}
          onClick={submit}
        >
          {busy ? 'Subiendo…' : target ? `Confirmar quiebre (-${penalty})` : 'Elegí quién quebró'}
        </button>
      </div>
    </Sheet>
  )
}
