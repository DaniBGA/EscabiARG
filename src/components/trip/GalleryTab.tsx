import { useEffect, useState } from 'react'
import type { TripEvent, TripMember } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { formatDay, formatPoints, formatTime } from '../../lib/game'
import Sheet from '../Sheet'

type Props = {
  events: TripEvent[]
  members: TripMember[]
  userId: string
  today: string
}

type Filter = 'all' | 'drink' | 'quiebre' | 'mission' | 'more'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'drink', label: '🍺 Tragos' },
  { key: 'quiebre', label: '😵 Quebradas' },
  { key: 'mission', label: '🎯 Misiones' },
  { key: 'more', label: '🎰 Otras' },
]

const MAIN_KINDS = ['drink', 'quiebre', 'mission']
const matches = (f: Filter, kind: string) =>
  f === 'all' || (f === 'more' ? !MAIN_KINDS.includes(kind) : kind === f)

type Photo = { path: string; event: TripEvent }

/** Todas las fotos del viaje: tragos, quebradas y pruebas de misiones */
export default function GalleryTab({ events, members, userId, today }: Props) {
  const api = useApi()
  const [filter, setFilter] = useState<Filter>('all')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Photo | null>(null)

  const photos: Photo[] = events.flatMap((e) => e.photo_paths.map((path) => ({ path, event: e })))
  const shown = photos.filter((p) => matches(filter, p.event.kind))
  const pathsKey = photos.map((p) => p.path).join('|')

  useEffect(() => {
    if (!pathsKey) return
    let alive = true
    api
      .getPhotoUrls(pathsKey.split('|'))
      .then((r) => alive && setUrls((prev) => ({ ...prev, ...r })))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [api, pathsKey])

  const name = (id: string) =>
    id === userId ? 'Vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? 'Alguien'

  const count = (f: Filter) => photos.filter((p) => matches(f, p.event.kind)).length

  return (
    <section className="card-box" aria-labelledby="gallery-title">
      <h3 id="gallery-title" className="box-title">Galería</h3>
      <div className="gallery-filters" role="group" aria-label="Filtrar fotos">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="chip-btn"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label} · {count(f.key)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="muted center hand">Todavía no hay fotos acá. ¡Que empiece la joda!</p>
      ) : (
        <ul className="gallery-grid">
          {shown.map((p) => (
            <li key={p.path}>
              <button type="button" className="gallery-item" onClick={() => setOpen(p)} aria-label={`${name(p.event.user_id)}: ${p.event.title}`}>
                {urls[p.path] ? (
                  <img src={urls[p.path]} alt="" loading="lazy" />
                ) : (
                  <span className="feed-photo--loading" style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />
                )}
                <span className="gallery-badge">{p.event.emoji}</span>
                {p.event.status !== 'approved' && (
                  <span className="gallery-status" title={p.event.status === 'pending' ? 'Esperando validación' : 'No validada'}>
                    {p.event.status === 'pending' ? '⏳' : '❌'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open !== null} title="Foto" onClose={() => setOpen(null)}>
        {open && (
          <>
            {urls[open.path] && <img className="lightbox-img" src={urls[open.path]} alt={open.event.title} />}
            <div className="gallery-caption">
              <p>
                <strong>{name(open.event.user_id)}</strong>{' '}
                {open.event.kind === 'quiebre' ? 'quebró 😵' : `· ${open.event.emoji} ${open.event.title}`}{' '}
                <span className={`pts-chip${open.event.points < 0 ? ' is-neg' : ''}${open.event.status !== 'approved' ? ' is-off' : ''}`}>
                  {formatPoints(open.event.points)}
                </span>
              </p>
              {open.event.detail && <p className="muted">“{open.event.detail}”</p>}
              <p className="muted small">
                {formatDay(open.event.day, today)} · {formatTime(open.event.created_at)}
                {open.event.kind === 'quiebre' && open.event.actor_id !== open.event.user_id && ` · la sacó ${name(open.event.actor_id)}`}
                {open.event.status === 'pending' && ' · ⏳ esperando validación'}
                {open.event.status === 'rejected' && ' · ❌ no validada'}
              </p>
            </div>
          </>
        )}
      </Sheet>
    </section>
  )
}
