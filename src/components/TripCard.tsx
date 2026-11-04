import type { Trip } from '../lib/api'
import { outingState } from '../lib/game'
import { markCameFromHome, tripPath } from '../lib/router'
import Avatar from './Avatar'
import { PinIcon } from './icons'
import './TripCard.css'

const MAX_AVATARS = 5

function dateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return {
    day: d,
    month: date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''),
    weekday: date.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
  }
}

/** Cada plan es una entrada: datos a la izquierda, talón con la fecha a la derecha */
export default function TripCard({ trip, myId, pending = 0 }: { trip: Trip; myId: string; pending?: number }) {
  const owner = trip.members.find((m) => m.role === 'owner')
  const isMine = trip.owner_id === myId
  const outing = outingState(trip)
  const members = [...trip.members].sort(
    (a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'),
  )
  const shown = members.slice(0, MAX_AVATARS)
  const extra = members.length - shown.length
  const date = trip.trip_date ? dateParts(trip.trip_date) : null

  return (
    <a className={`trip-card trip-card--${trip.kind}`} href={tripPath(trip.id)} onClick={markCameFromHome}>
      <div className="trip-ticket">
        <span className="trip-badges">
          <span className="trip-kind">{trip.kind === 'salida' ? 'Previa y salida' : 'Viaje'}</span>
          {trip.kind === 'salida' && (
            <span className={`trip-state trip-state--${outing}`}>
              {outing === 'open' ? 'Hoy' : outing === 'upcoming' ? 'Próximamente' : 'Terminada'}
            </span>
          )}
        </span>
        <h3 className="trip-name">{trip.name}</h3>
        <p className="trip-meta">
          {trip.place && (
            <span><PinIcon /> {trip.place}</span>
          )}
          <span className="trip-role">{isMine ? 'Organizás vos' : `Invita ${owner?.profile?.display_name ?? 'un amigo'}`}</span>
        </p>
        <div className="trip-members">
          <span className="trip-avatars">
            {shown.map((m) => (
              <Avatar key={m.user_id} id={m.user_id} name={m.profile?.display_name ?? '?'} size={28} />
            ))}
            {extra > 0 && <span className="trip-more">+{extra}</span>}
          </span>
          <span className="trip-count">
            {trip.members.length} {trip.members.length === 1 ? 'persona' : 'personas'}
          </span>
        </div>
      </div>

      <div className="trip-stub" aria-hidden={!date}>
        {date ? (
          <>
            <span className="stub-week">{date.weekday}</span>
            <span className="stub-day">{date.day}</span>
            <span className="stub-month">{date.month}</span>
          </>
        ) : (
          <span className="stub-none">Sin fecha</span>
        )}
      </div>

      {pending > 0 && (
        <span className="trip-pending" aria-label={`${pending} pendientes`}>{pending}</span>
      )}
    </a>
  )
}
