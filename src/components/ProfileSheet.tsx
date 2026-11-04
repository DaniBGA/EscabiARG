import { useState, type FormEvent } from 'react'
import { updateDisplayName, type Profile } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'
import FriendCode from './FriendCode'
import Sheet from './Sheet'
import './ProfileSheet.css'

type Props = {
  open: boolean
  onClose: () => void
  me: Profile
  isGuest: boolean
  onChange: () => void
}

export default function ProfileSheet({ open, onClose, me, isGuest, onChange }: Props) {
  const [name, setName] = useState(me.display_name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updateDisplayName(me.id, name)
      onChange()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    if (isGuest && !window.confirm('Sos invitado: si cerrás sesión vas a perder tus amigos y viajes. ¿Seguro?')) {
      return
    }
    await supabase?.auth.signOut()
  }

  const unchanged = name.trim() === me.display_name || !name.trim()

  return (
    <Sheet
      open={open}
      title="Tu perfil"
      onClose={() => {
        setName(me.display_name)
        setError(null)
        onClose()
      }}
    >
      <div className="profile-top">
        <Avatar id={me.id} name={me.display_name} size={64} />
        <div>
          <p className="profile-name">{me.display_name}</p>
          {isGuest && <p className="profile-badge">Invitado</p>}
        </div>
      </div>

      <form className="profile-form" onSubmit={save}>
        <label className="field">
          <span>¿Cómo te dicen?</span>
          <div className="profile-row">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
            />
            <button type="submit" className="btn btn--primary" disabled={busy || unchanged}>
              Guardar
            </button>
          </div>
        </label>
      </form>

      {error && <p className="notice notice--error" role="alert">{error}</p>}

      <div className="profile-code">
        <FriendCode code={me.friend_code} />
      </div>

      <button type="button" className="btn btn--danger btn--block profile-signout" onClick={signOut}>
        Cerrar sesión
      </button>
    </Sheet>
  )
}
