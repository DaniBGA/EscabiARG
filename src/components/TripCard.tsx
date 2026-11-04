import type { Trip } from '../lib/api'
import { markCameFromHome, tripPath } from '../lib/router'
import Avatar from './Avatar'
import { CalendarIcon, PinIcon } from './icons'
import './TripCard.css'

const MAX_AVATARS = 5

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function TripCard({ trip, myId, pending = 0 }: { trip: Trip; myId: string; pending?: number }) {
  const owner = trip.members.find((m) => m.role === 'owner')
  const isMine = trip.owner_id === myId
  const members = [...trip.members].sort(
    (a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'),
  )
  const shown = members.slice(0, MAX_AVATARS)
  const extra = members.length - shown.length

  return (
    <a className="trip-card" href={tripPath(trip.id)} onClick={markCameFromHome}>
      <div className="trip-card-top">
        <h3 className="trip-name">{trip.name}</h3>
        <span className={`trip-role${isMine ? ' trip-role--mine' : ''}`}>
          {isMine ? 'Organizás vos' : `Invita ${owner?.profile?.display_name ?? 'un amigo'}`}
        </span>
      </div>

      {(trip.trip_date || trip.place) && (
        <p className="trip-meta">
          {trip.trip_date && (
            <span className="trip-date"><CalendarIcon /> {formatDate(trip.trip_date)}</span>
          )}
          {trip.place && (
            <span><PinIcon /> {trip.place}</span>
          )}
        </p>
      )}

      <div className="trip-members">
        <span className="trip-avatars">
          {shown.map((m) => (
            <Avatar key={m.user_id} id={m.user_id} name={m.profile?.display_name ?? '?'} size={30} />
          ))}
          {extra > 0 && <span className="trip-more">+{extra}</span>}
        </span>
        <span className="trip-count">
          {trip.members.length} {trip.members.length === 1 ? 'persona' : 'personas'}
        </span>
      </div>
      <span className="trip-open" aria-hidden="true">Entrar →</span>
      {pending > 0 && (
        <span className="trip-pending">🔔 {pending} {pending === 1 ? 'pendiente' : 'pendientes'}</span>
      )}
    </a>
  )
}
