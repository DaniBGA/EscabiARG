import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Profile } from '../lib/api'
import { useApi, useAuth, type AppUser } from '../lib/authContext'
import { isEarlyAccess } from '../lib/supabase'
import { squareAvatar, useAvatarUrl } from '../lib/avatars'
import { friendlyError } from '../lib/errors'
import Avatar from './Avatar'
import FriendCode from './FriendCode'
import Sheet from './Sheet'
import NotificationsToggle from './NotificationsToggle'
import TermsContent from './TermsContent'
import CameraCapture from './trip/CameraCapture'
import './TermsGate.css'
import './ProfileSheet.css'

type Props = {
  open: boolean
  onClose: () => void
  me: Profile
  user: AppUser
  onChange: () => void
  /** Volver a ver el tutorial */
  onShowTutorial?: () => void
}

export default function ProfileSheet({ open, onClose, me, user, onChange, onShowTutorial }: Props) {
  const api = useApi()
  const auth = useAuth()
  const [name, setName] = useState(me.display_name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  const [camera, setCamera] = useState(false)
  const [photoBusy, setPhotoBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatarUrl = useAvatarUrl(me.id)

  const changePhoto = async (source: Blob | null) => {
    setError(null)
    let preview: string | null = null
    try {
      const photo = source ? await squareAvatar(source) : null
      preview = photo ? URL.createObjectURL(photo) : ''
      setPhotoBusy(preview)
      await api.setAvatar(me.id, photo)
      onChange()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setPhotoBusy(null)
      if (preview) URL.revokeObjectURL(preview)
    }
  }

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Elegí una imagen.')
      return
    }
    changePhoto(file)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.updateDisplayName(me.id, name)
      onChange()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  // Confirmación dentro de la app (window.confirm a veces está bloqueado y el botón
  // parecía no hacer nada)
  const [confirmOut, setConfirmOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const signOut = async () => {
    if (user.isGuest && !confirmOut) {
      setConfirmOut(true)
      return
    }
    setSigningOut(true)
    setError(null)
    try {
      await auth.signOut()
    } catch (err) {
      setError(friendlyError(err))
      setSigningOut(false)
    }
  }

  const unchanged = name.trim() === me.display_name || !name.trim()

  return (
    <Sheet
      open={open}
      title="Tu perfil"
      onClose={() => {
        setName(me.display_name)
        setError(null)
        setConfirmOut(false)
        onClose()
      }}
    >
      <div className="profile-top">
        <button
          type="button"
          className={photoBusy !== null ? 'profile-photo is-busy' : 'profile-photo'}
          onClick={() => setCamera(true)}
          disabled={photoBusy !== null}
          aria-label={avatarUrl ? 'Cambiar foto de perfil' : 'Poner foto de perfil'}
        >
          <Avatar id={me.id} name={me.display_name} size={84} photo={photoBusy === null ? undefined : photoBusy || null} />
          <span className="profile-photo-badge" aria-hidden="true">📷</span>
        </button>
        <div>
          <p className="profile-name">{me.display_name}</p>
          {user.isGuest && <p className="profile-badge">Invitado</p>}
          {user.isDemo && <p className="profile-badge">Demo</p>}
        </div>
      </div>

      <div className="profile-photo-actions">
        <button type="button" className="profile-chip" onClick={() => setCamera(true)} disabled={photoBusy !== null}>
          📸 Sacar foto
        </button>
        <button type="button" className="profile-chip" onClick={() => fileRef.current?.click()} disabled={photoBusy !== null}>
          🖼️ Elegir de la galería
        </button>
        {avatarUrl && (
          <button type="button" className="profile-chip profile-chip--danger" onClick={() => changePhoto(null)} disabled={photoBusy !== null}>
            Quitar
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
      </div>
      {photoBusy !== null && <p className="profile-photo-status">{photoBusy ? 'Subiendo tu foto…' : 'Quitando tu foto…'}</p>}

      <CameraCapture
        open={camera}
        title="Tu foto de perfil"
        initialFacing="user"
        onClose={() => setCamera(false)}
        onCapture={(blob) => changePhoto(blob)}
      />

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

      <NotificationsToggle api={api} userId={me.id} name={me.display_name} isDemo={user.isDemo} />

      {onShowTutorial && (
        <button type="button" className="btn btn--ghost btn--block profile-terms" onClick={onShowTutorial}>
          🎓 Ver el tutorial
        </button>
      )}
      <button type="button" className="btn btn--ghost btn--block profile-terms" onClick={() => setShowTerms(true)}>
        ⚠️ Términos y condiciones
      </button>
      <Sheet open={showTerms} title="Términos y condiciones" onClose={() => setShowTerms(false)}>
        <div className="terms-sheet">
          <TermsContent />
        </div>
      </Sheet>

      {confirmOut && (
        <p className="notice notice--error profile-signout-warn" role="alert">
          Sos invitado: si cerrás sesión <strong>perdés tus amigos y viajes</strong> (no hay forma de volver a
          entrar a esta cuenta).
          {isEarlyAccess && ' También dejás libre tu lugar en el early access: si se llena, no vas a poder volver a entrar.'}
        </p>
      )}
      <button type="button" className="btn btn--danger btn--block profile-signout" onClick={signOut} disabled={signingOut}>
        {signingOut
          ? 'Cerrando sesión…'
          : user.isDemo
            ? 'Salir de la demo'
            : confirmOut
              ? 'Sí, cerrar sesión igual'
              : 'Cerrar sesión'}
      </button>
      {confirmOut && !signingOut && (
        <button type="button" className="btn btn--ghost btn--block profile-signout-cancel" onClick={() => setConfirmOut(false)}>
          Mejor no
        </button>
      )}
      {user.isDemo && (
        <p className="profile-demo-note">Al salir se borran los datos de prueba.</p>
      )}
    </Sheet>
  )
}
