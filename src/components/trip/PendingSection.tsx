import { useEffect, useState } from 'react'
import type { TripDetail, TripEvent } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { eventTally, formatPoints, formatTime, myPendingItems } from '../../lib/game'
import Sheet from '../Sheet'
import ChallengeCard from './ChallengeCard'

type Props = {
  detail: TripDetail
  me: string
  now: number
  onChange: (message?: string) => void
}

function EventToValidate({ e, detail, urls, onView, onChange }: {
  e: TripEvent
  detail: TripDetail
  urls: Record<string, string>
  onView: (url: string) => void
  onChange: (message?: string) => void
}) {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const members = detail.trip.members
  const name = (id: string) => members.find((m) => m.user_id === id)?.profile?.display_name ?? 'Alguien'
  const t = eventTally(e, detail, members)

  const vote = async (valid: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await api.voteEvent(e.id, valid)
      onChange(valid ? '👍 ¡Validado!' : '👎 Votaste que no vale')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="validate">
      <div className={`validate-photos validate-photos--${Math.min(e.photo_paths.length, 3)}`}>
        {e.photo_paths.map((p) =>
          urls[p] ? (
            <button key={p} type="button" className="validate-photo" onClick={() => onView(urls[p])}>
              <img src={urls[p]} alt={`Foto de ${name(e.user_id)}`} />
            </button>
          ) : (
            <span key={p} className="validate-photo feed-photo--loading" aria-hidden="true" />
          ),
        )}
      </div>
      <div className="validate-body">
        <p className="validate-title">
          {e.kind === 'drink' ? (
            <>
              <strong>{name(e.user_id)}</strong> se tomó {e.emoji} {e.title}
            </>
          ) : (
            <>
              <strong>{name(e.actor_id)}</strong> dice que <strong>{name(e.user_id)}</strong> quebró 😵
            </>
          )}
          <span className={`pts-chip${e.points < 0 ? ' is-neg' : ''}`}>{formatPoints(e.points)}</span>
        </p>
        <p className="muted small">
          {formatTime(e.created_at)} · {t.yes} de {t.needed} votos para validar
        </p>
        <div className="vote-row">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => vote(true)}>
            👍 Vale
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => vote(false)}>
            👎 No vale
          </button>
        </div>
        {error && <p className="notice notice--error" role="alert">{error}</p>}
      </div>
    </article>
  )
}

/** Lo que espera tu voto: fotos de tragos/quiebres y votaciones de misiones */
export default function PendingSection({ detail, me, now, onChange }: Props) {
  const api = useApi()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<string | null>(null)
  const items = myPendingItems(detail, me, now)
  const pathsKey = items.flatMap((i) => (i.type === 'event' ? i.event.photo_paths : [])).join('|')

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

  if (items.length === 0) return null

  return (
    <section className="pending" aria-labelledby="pending-title">
      <h2 id="pending-title" className="pending-title">
        🔔 Pendientes <span className="pending-count">{items.length}</span>
      </h2>
      <p className="muted small">Mirá las fotos y decí si valen. Los puntos cuentan cuando los valida la mayoría.</p>
      <div className="pending-list">
        {items.map((item) =>
          item.type === 'event' ? (
            <EventToValidate
              key={item.event.id}
              e={item.event}
              detail={detail}
              urls={urls}
              onView={setViewing}
              onChange={onChange}
            />
          ) : (
            <ChallengeCard key={item.challenge.id} challenge={item.challenge} detail={detail} me={me} now={now} onChange={onChange} />
          ),
        )}
      </div>

      <Sheet open={viewing !== null} title="Foto" onClose={() => setViewing(null)}>
        {viewing && <img className="lightbox-img" src={viewing} alt="Foto en grande" />}
      </Sheet>
    </section>
  )
}
