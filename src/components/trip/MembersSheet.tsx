import { useEffect, useState } from 'react'
import type { Profile, TripMember } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import Avatar from '../Avatar'
import Sheet from '../Sheet'
import { CheckIcon } from '../icons'
import '../CreateTripSheet.css'

type Props = {
  open: boolean
  onClose: () => void
  tripId: string
  me: string
  members: TripMember[]
  isOwner: boolean
  isOuting: boolean
  onDone: (message: string) => void
}

/** Quiénes juegan; el organizador puede sumar a los que se olvidó */
export default function MembersSheet({ open, onClose, tripId, me, members, isOwner, isOuting, onDone }: Props) {
  const api = useApi()
  const [friends, setFriends] = useState<Profile[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !isOwner) return
    let alive = true
    api
      .listFriends(me)
      .then((list) => alive && setFriends(list))
      .catch((err) => alive && setError(friendlyError(err)))
    return () => {
      alive = false
    }
  }, [open, isOwner, api, me])

  const inTrip = new Set(members.map((m) => m.user_id))
  const candidates = (friends ?? []).filter((f) => !inTrip.has(f.id))

  const close = () => {
    setSelected(new Set())
    setError(null)
    onClose()
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const add = async () => {
    const ids = candidates.filter((f) => selected.has(f.id)).map((f) => f.id)
    if (ids.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await api.addTripMembers(tripId, ids)
      const names = candidates.filter((f) => selected.has(f.id)).map((f) => f.display_name)
      close()
      onDone(`🙌 ${names.length === 1 ? `Sumaste a ${names[0]}` : `Sumaste a ${names.length} amigos`} ${isOuting ? 'a la salida' : 'al viaje'}`)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} title={`Jugadores (${members.length})`} onClose={close}>
      <div className="sheet-stack">
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.user_id} className="member-row">
              <Avatar id={m.user_id} name={m.profile?.display_name ?? '?'} size={36} />
              <span className="member-name">{m.user_id === me ? 'Vos' : m.profile?.display_name ?? '?'}</span>
              {m.role === 'owner' && <span className="member-role">Organiza</span>}
            </li>
          ))}
        </ul>

        {isOwner && (
          <fieldset className="invite">
            <legend className="invite-legend">
              <span>¿Te olvidaste de alguien?</span>
            </legend>
            {friends === null && !error ? (
              <p className="muted small">Buscando tus amigos…</p>
            ) : candidates.length === 0 ? (
              <p className="muted small">
                {friends && friends.length > 0
                  ? 'Ya están todos tus amigos. Para sumar a alguien más, agregalo primero como amigo desde el inicio.'
                  : 'Todavía no tenés amigos agregados. Agregalos desde el inicio con su código.'}
              </p>
            ) : (
              <ul className="invite-list">
                {candidates.map((f) => {
                  const checked = selected.has(f.id)
                  return (
                    <li key={f.id}>
                      <label className={`invite-item${checked ? ' is-checked' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(f.id)} />
                        <Avatar id={f.id} name={f.display_name} size={36} />
                        <span className="invite-name">{f.display_name}</span>
                        <span className="invite-check" aria-hidden="true">
                          {checked && <CheckIcon />}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>
        )}

        {error && <p className="notice notice--error" role="alert">{error}</p>}

        {isOwner && candidates.length > 0 && (
          <button type="button" className="btn btn--primary btn--block" disabled={busy || selected.size === 0} onClick={add}>
            {busy ? 'Sumando…' : selected.size > 0 ? `Sumar ${selected.size} al ${isOuting ? 'plan' : 'viaje'}` : 'Elegí a quién sumar'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
