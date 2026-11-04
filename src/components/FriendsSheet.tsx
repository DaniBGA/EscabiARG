import { useState, type FormEvent } from 'react'
import { addFriendByCode, removeFriend, type Profile } from '../lib/api'
import { friendlyError } from '../lib/errors'
import Avatar from './Avatar'
import Sheet from './Sheet'
import FriendCode from './FriendCode'
import './FriendsSheet.css'

type Props = {
  open: boolean
  onClose: () => void
  me: Profile
  friends: Profile[]
  onChange: () => void
}

export default function FriendsSheet({ open, onClose, me, friends, onChange }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const close = () => {
    setCode('')
    setError(null)
    setNotice(null)
    onClose()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const friend = await addFriendByCode(code)
      setNotice(`¡Listo! ${friend.display_name} ya es tu amigo 🍻`)
      setCode('')
      onChange()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (friend: Profile) => {
    if (!window.confirm(`¿Sacar a ${friend.display_name} de tus amigos?`)) return
    setError(null)
    setNotice(null)
    try {
      await removeFriend(friend.id)
      onChange()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Sheet open={open} title="Amigos" onClose={close}>
      <FriendCode code={me.friend_code} />

      <form className="add-friend" onSubmit={submit}>
        <label className="field">
          <span>Agregar por código</span>
          <div className="add-friend-row">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Ej: K7MQ2X"
              maxLength={6}
              minLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              required
              aria-describedby="add-friend-hint"
            />
            <button type="submit" className="btn btn--primary" disabled={busy || code.length !== 6}>
              {busy ? '…' : 'Agregar'}
            </button>
          </div>
          <span id="add-friend-hint" className="field-hint">
            Pedile a tu amigo su código de 6 caracteres.
          </span>
        </label>
      </form>

      {error && <p className="notice notice--error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <h3 className="friends-heading">
        Tus amigos <span className="friends-count">{friends.length}</span>
      </h3>

      {friends.length === 0 ? (
        <p className="friends-empty">Todavía no agregaste a nadie. Compartí tu código o pedí el de tus amigos.</p>
      ) : (
        <ul className="friends-list">
          {friends.map((f) => (
            <li key={f.id} className="friend-row">
              <Avatar id={f.id} name={f.display_name} />
              <span className="friend-name">{f.display_name}</span>
              <button type="button" className="friend-remove" onClick={() => remove(f)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
