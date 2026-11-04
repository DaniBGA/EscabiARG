import { useEffect, useState, type ReactNode } from 'react'
import type { TripDetail, TripEvent } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { eventTally, formatDuelTime, formatPoints, formatTime, myPendingItems } from '../../lib/game'
import Sheet from '../Sheet'
import ChallengeCard from './ChallengeCard'
import QuiebreGuy from './QuiebreGuy'

type Props = {
  detail: TripDetail
  me: string
  now: number
  onChange: (message?: string) => void
  /** Ir a una sección de la pestaña Jugar */
  onGo: (anchor: string) => void
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
        {e.kind === 'quiebre' && (
          <span className="qg-mini" aria-hidden="true">
            <QuiebreGuy size={76} loop />
          </span>
        )}
        <p className="validate-title">
          <span className="validate-text">
          {e.kind === 'drink' ? (
            <>
              <strong>{name(e.user_id)}</strong> se tomó {e.emoji} {e.title}
            </>
          ) : e.kind === 'infraction' ? (
            <>
              <strong>{name(e.actor_id)}</strong> dice que <strong>{name(e.user_id)}</strong>: {e.emoji} {e.title}
            </>
          ) : e.kind === 'casino' ? (
            <>
              <strong>{name(e.user_id)}</strong> dice que en el casino: {e.detail}
            </>
          ) : e.kind === 'duel' ? (
            <>
              ⚔️ <strong>{name(e.user_id)}</strong> le ganó un duelo a <strong>{name(e.actor_id)}</strong>: {e.detail}
            </>
          ) : (
            <>
              <strong>{name(e.actor_id)}</strong> dice que <strong>{name(e.user_id)}</strong> quebró 😵
            </>
          )}
          </span>
          {e.kind === 'infraction' ? (
            <span className="pts-chip is-zero">🙈 prenda</span>
          ) : e.kind !== 'casino' ? (
            <span className={`pts-chip${e.points < 0 ? ' is-neg' : ''}`}>{formatPoints(e.points)}</span>
          ) : null}
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
function QuickItem({ icon, title, sub, action, onAction, busy }: {
  icon: string
  title: ReactNode
  sub?: ReactNode
  action: string
  onAction: () => void
  busy?: boolean
}) {
  return (
    <article className="quick">
      <span className="quick-icon" aria-hidden="true">{icon}</span>
      <div className="quick-body">
        <p className="quick-title">{title}</p>
        {sub && <p className="muted small">{sub}</p>}
      </div>
      <button type="button" className="btn btn--primary quick-btn" onClick={onAction} disabled={busy}>{action}</button>
    </article>
  )
}

export default function PendingSection({ detail, me, now, onChange, onGo }: Props) {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const members = detail.trip.members
  const who = (id: string | null) => members.find((m) => m.user_id === id)?.profile?.display_name ?? 'alguien'
  const act = async (fn: () => Promise<void>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChange(message)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<string | null>(null)
  const items = myPendingItems(detail, me, now)
  const pathsKey = items
    .flatMap((i) =>
      i.type === 'event' ? i.event.photo_paths : i.type === 'chefVote' && i.spin.photo_path ? [i.spin.photo_path] : [],
    )
    .join('|')

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
        <span className="sign">Pendientes</span> <span className="pending-count">{items.length}</span>
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
          ) : item.type === 'challenge' ? (
            <ChallengeCard key={item.challenge.id} challenge={item.challenge} detail={detail} me={me} now={now} onChange={onChange} />
          ) : item.type === 'chefJoin' ? (
            <QuickItem
              key={item.spin.id}
              icon={item.spin.kind === 'comida' ? '🍳' : '🍹'}
              title={`Ruleta: ¿quién ${item.spin.kind === 'comida' ? 'cocina' : 'prepara el trago'}?`}
              sub="Tienen que meterse todos para que gire."
              action="Meterme"
              busy={busy}
              onAction={() => act(() => api.joinChefSpin(item.spin.id), '🎡 Adentro de la ruleta')}
            />
          ) : item.type === 'chefVote' ? (
            <article key={item.spin.id} className="validate">
              {item.spin.photo_path && urls[item.spin.photo_path] && (
                <div className="validate-photos validate-photos--1">
                  <button type="button" className="validate-photo" onClick={() => setViewing(urls[item.spin.photo_path as string])}>
                    <img src={urls[item.spin.photo_path]} alt="Lo que preparó" />
                  </button>
                </div>
              )}
              <p className="validate-title">
                <span>¿Salió bueno {item.spin.kind === 'comida' ? 'lo que cocinó' : 'el trago de'} <strong>{who(item.spin.chosen_user_id)}</strong>?</span>
              </p>
              <div className="vote-row">
                <button type="button" className="btn btn--primary" disabled={busy}
                  onClick={() => act(() => api.voteChef(item.spin.id, true), '😋 Votaste que salió bueno')}>😋 Salió bueno</button>
                <button type="button" className="btn btn--ghost" disabled={busy}
                  onClick={() => act(() => api.voteChef(item.spin.id, false), '🤢 Votaste que salió malo')}>🤢 Salió malo</button>
              </div>
            </article>
          ) : item.type === 'casinoReport' ? (
            <QuickItem
              key={item.session.id}
              icon="🎰"
              title="Terminó el casino: cargá cuánto ganaste o perdiste"
              sub="Con foto de las fichas o el ticket."
              action="Cargar"
              onAction={() => onGo('casino')}
            />
          ) : item.type === 'duelInvite' ? (
            <article key={item.duel.id} className="quick quick--duel">
              <span className="quick-icon" aria-hidden="true">⚔️</span>
              <div className="quick-body">
                <p className="quick-title">
                  <strong>{who(item.duel.challenger_id)}</strong> te retó a un duelo de{' '}
                  {item.duel.kind === 'fondo' ? `fondo blanco (máx. ${formatDuelTime(item.duel.seconds)})` : `shots (${formatDuelTime(item.duel.seconds)})`}
                </p>
                <p className="muted small">Podés decir que no sin problema.</p>
                <div className="vote-row">
                  <button type="button" className="btn btn--primary" disabled={busy}
                    onClick={() => act(() => api.respondDuel(item.duel.id, true), '⚔️ ¡Duelo aceptado! Preparate')}>Aceptar</button>
                  <button type="button" className="btn btn--ghost" disabled={busy}
                    onClick={() => act(() => api.respondDuel(item.duel.id, false), 'Duelo rechazado')}>No, gracias</button>
                </div>
              </div>
            </article>
          ) : (
            <QuickItem
              key={item.forfeit.id}
              icon="🙈"
              title={<>Tenés una prenda: <strong>{item.forfeit.forfeit}</strong></>}
              sub={`Por: ${item.forfeit.reason}`}
              action="Ver"
              onAction={() => onGo('prendas')}
            />
          ),
        )}
      </div>
      {error && <p className="notice notice--error" role="alert">{error}</p>}

      <Sheet open={viewing !== null} title="Foto" onClose={() => setViewing(null)}>
        {viewing && <img className="lightbox-img" src={viewing} alt="Foto en grande" />}
      </Sheet>
    </section>
  )
}
