import { useEffect, useState } from 'react'
import type { TripDetail, TripEvent, TripMember } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { eventTally, formatDay, formatPoints, formatTime } from '../../lib/game'
import Sheet from '../Sheet'

type Props = {
  events: TripEvent[]
  eventVotes: TripDetail['eventVotes']
  members: TripMember[]
  userId: string
  today: string
  /** Repetir la animación de un quiebre */
  onReplayQuiebre?: (userId: string) => void
}

const MAX_EVENTS = 80

export default function ActivityFeed({ events, eventVotes, members, userId, today, onReplayQuiebre }: Props) {
  const api = useApi()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<string | null>(null)

  const shown = events.slice(0, MAX_EVENTS)
  const pathsKey = shown.flatMap((e) => e.photo_paths).join('|')

  useEffect(() => {
    if (!pathsKey) return
    let alive = true
    api
      .getPhotoUrls(pathsKey.split('|'))
      .then((r) => alive && setUrls((prev) => ({ ...prev, ...r })))
      .catch(() => {
        // sin fotos: se muestra el emoji
      })
    return () => {
      alive = false
    }
  }, [api, pathsKey])

  const name = (id: string) =>
    id === userId ? 'Vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? 'Alguien'

  const groups = new Map<string, TripEvent[]>()
  for (const e of shown) groups.set(e.day, [...(groups.get(e.day) ?? []), e])

  if (shown.length === 0) {
    return (
      <section className="card-box">
        <p className="muted center">Todavía no pasó nada. ¡Cargá el primer trago! 🍻</p>
      </section>
    )
  }

  return (
    <section className="card-box" aria-label="Actividad">
      {[...groups.entries()].map(([day, list]) => (
        <div key={day} className="feed-day">
          <h3 className="feed-day-title">{formatDay(day, today)}</h3>
          <ul className="feed">
            {list.map((e) => (
              <li key={e.id} className="feed-item">
                <span className={`feed-emoji feed-emoji--${e.kind}`} aria-hidden="true">{e.emoji || '•'}</span>
                <div className="feed-body">
                  <p className="feed-line">
                    <strong>{name(e.user_id)}</strong>{' '}
                    {e.kind === 'quiebre'
                      ? e.title.toLowerCase()
                      : e.kind === 'infraction'
                        ? `· infracción: ${e.title}`
                        : e.kind === 'burn'
                          ? `· 🔥 tomando ${e.title}`
                          : `· ${e.title}`}
                  </p>
                  {e.kind === 'burn' && (
                    <p className="feed-detail">{e.actor_id === userId ? 'Quemada tuya 😈' : `Quemada de ${name(e.actor_id)}`}</p>
                  )}
                  {e.detail && <p className="feed-detail">{e.kind === 'duel' ? `contra ${name(e.actor_id)} · ${e.detail}` : `“${e.detail}”`}</p>}
                  {(e.kind === 'quiebre' || e.kind === 'infraction') && e.actor_id !== e.user_id && (
                    <p className="feed-detail">Lo reportó {name(e.actor_id)}</p>
                  )}
                  {e.kind === 'quiebre' && onReplayQuiebre && (
                    <button type="button" className="link-btn replay-btn" onClick={() => onReplayQuiebre(e.user_id)}>
                      Ver quebrada
                    </button>
                  )}
                  {e.photo_paths.length > 0 && (
                    <div className="feed-photos">
                      {e.photo_paths.map((p) =>
                        urls[p] ? (
                          <button key={p} type="button" className="feed-photo" onClick={() => setViewing(urls[p])}>
                            <img src={urls[p]} alt={`Foto: ${e.title}`} loading="lazy" />
                          </button>
                        ) : (
                          <span key={p} className="feed-photo feed-photo--loading" aria-hidden="true" />
                        ),
                      )}
                    </div>
                  )}
                  <span className="feed-time">
                    {formatTime(e.created_at)}
                    {e.status === 'pending' && (() => {
                      const t = eventTally(e, { eventVotes }, members)
                      return <span className="status-chip is-pending">⏳ Esperando validación ({t.yes}/{t.needed})</span>
                    })()}
                    {e.status === 'rejected' && <span className="status-chip is-rejected">❌ No validado</span>}
                  </span>
                </div>
                <span className={`pts-chip${e.status !== 'approved' ? ' is-off' : ''}${e.points < 0 ? ' is-neg' : e.points === 0 ? ' is-zero' : ''}`}>
                  {formatPoints(e.points)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <Sheet open={viewing !== null} title="Foto" onClose={() => setViewing(null)}>
        {viewing && <img className="lightbox-img" src={viewing} alt="Foto en grande" />}
      </Sheet>
    </section>
  )
}
