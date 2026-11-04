import { useCallback, useEffect, useRef, useState } from 'react'
import type { TripDetail } from '../lib/api'
import { useApi, type AppUser } from '../lib/authContext'
import { friendlyError } from '../lib/errors'
import {
  activeCasino,
  activeChefSpin,
  cardDef,
  formatDay,
  isActiveChallenge,
  myLiveDuel,
  myMissionToday,
  outingState,
  pendingPoints,
  pendingSpins,
  scoreboard,
  tripDay,
} from '../lib/game'
import { goHome } from '../lib/router'
import Avatar from '../components/Avatar'
import { BackIcon } from '../components/icons'
import ActivityFeed from '../components/trip/ActivityFeed'
import CardsSection from '../components/trip/CardsSection'
import CasinoBox from '../components/trip/CasinoBox'
import ChefRouletteBox from '../components/trip/ChefRouletteBox'
import DrinksTab from '../components/trip/DrinksTab'
import DuelOverlay from '../components/trip/DuelOverlay'
import DuelsBox from '../components/trip/DuelsBox'
import ForfeitsBox from '../components/trip/ForfeitsBox'
import ListsEditor from '../components/trip/ListsEditor'
import GalleryTab from '../components/trip/GalleryTab'
import LogDrinkSheet from '../components/trip/LogDrinkSheet'
import MissionCard from '../components/trip/MissionCard'
import MissionsBoard from '../components/trip/MissionsBoard'
import PendingSection from '../components/trip/PendingSection'
import QuiebreSheet from '../components/trip/QuiebreSheet'
import RouletteSheet from '../components/trip/RouletteSheet'
import ScoreBoard from '../components/trip/ScoreBoard'
import './TripScreen.css'

type Tab = 'play' | 'board' | 'feed' | 'gallery' | 'drinks'
type SheetName = 'none' | 'drink' | 'quiebre' | 'roulette'

const TABS: { key: Tab; label: string }[] = [
  { key: 'play', label: 'Jugar' },
  { key: 'board', label: 'Tabla' },
  { key: 'feed', label: 'Actividad' },
  { key: 'gallery', label: 'Galería' },
  { key: 'drinks', label: 'Reglas' },
]

const REFRESH_MS = 20_000
/** Mientras hay votaciones o fotos por validar se refresca más seguido */
const FAST_REFRESH_MS = 3_000
/** Durante un duelo tuyo, casi en vivo */
const DUEL_REFRESH_MS = 1_200

function formatTripDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function TripScreen({ tripId, user }: { tripId: string; user: AppUser }) {
  const api = useApi()
  const me = user.id
  const [detail, setDetail] = useState<TripDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('play')
  const [sheet, setSheet] = useState<SheetName>('none')
  const [spinDay, setSpinDay] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [clockOffset, setClockOffset] = useState(0)
  const [closedDuels, setClosedDuels] = useState<Record<string, boolean>>({})
  const toastTimer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      const t0 = Date.now()
      const d = await api.getTrip(tripId)
      const t1 = Date.now()
      // Reloj del servidor ≈ hora de respuesta − mitad de la demora
      setClockOffset(Date.parse(d.serverTime) - (t0 + t1) / 2)
      setDetail(d)
      setError(null)
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [api, tripId])

  const fast = Boolean(
    detail &&
      (detail.challenges.some(isActiveChallenge) ||
        detail.events.some((e) => e.status === 'pending') ||
        activeChefSpin(detail.chefSpins) ||
        activeCasino(detail.casinoSessions)),
  )
  const counting = Boolean(detail && (detail.challenges.some(isActiveChallenge) || activeCasino(detail.casinoSessions)))
  const inDuel = Boolean(
    detail?.duels.some(
      (d) => (d.status === 'live' || d.status === 'invited') && (d.challenger_id === user.id || d.opponent_id === user.id),
    ),
  )

  useEffect(() => {
    load()
  }, [load])

  // Refresco periódico para ver lo que cargan y votan los demás
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now())
      if (!document.hidden) load()
    }, inDuel ? DUEL_REFRESH_MS : fast ? FAST_REFRESH_MS : REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load, fast, inDuel])

  // Cuenta regresiva de las votaciones
  useEffect(() => {
    if (!counting) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [counting])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const showToast = (message?: string) => {
    if (!message) return
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }

  const refresh = (message?: string) => {
    showToast(message)
    load()
  }

  const goTo = (anchor: string) => {
    setTab('play')
    window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  if (!detail) {
    return (
      <div className="trip-screen trip-screen--center">
        {error ? (
          <div className="home-error">
            <p className="notice notice--error" role="alert">{error}</p>
            <div className="home-error-actions">
              <button type="button" className="btn btn--primary" onClick={load}>Reintentar</button>
              <button type="button" className="btn btn--ghost" onClick={goHome}>Volver</button>
            </div>
          </div>
        ) : (
          <p className="home-loading" role="status">Sirviendo el viaje…</p>
        )}
      </div>
    )
  }

  const { trip, drinks, events, missions, cards } = detail
  const members = trip.members
  const isOwner = trip.owner_id === me
  const today = tripDay(trip.day_cutoff_hour, now)
  const waiting = pendingPoints(events, me)
  const todayRow = scoreboard(members, events, today).find((r) => r.userId === me)
  const totalRow = scoreboard(members, events).find((r) => r.userId === me)
  const mission = myMissionToday(missions, me, today)
  const missionUnderVote = Boolean(
    mission && detail.challenges.some((c) => c.mission_id === mission.id && isActiveChallenge(c)),
  )
  // Previa y salida: dura una sola jornada
  const isOuting = trip.kind === 'salida'
  const outing = outingState(trip, now)
  const canPlay = outing === 'open'
  const nightDay = trip.trip_date ?? today
  const nightBoard = isOuting ? scoreboard(members, events, nightDay) : []
  const nightRow = nightBoard.find((r) => r.userId === me)
  // En una salida no hay ruleta de comodines: se gira recién al terminar la jornada
  const pending = isOuting ? [] : pendingSpins(events, cards, me, today)
  const activeCards = cards.filter((c) => c.user_id === me && c.status === 'active')
  const doubleActive = activeCards.some((c) => cardDef(c.card_key).effect === 'double')
  const shieldActive = activeCards.some((c) => cardDef(c.card_key).effect === 'shield')

  return (
    <div className="trip-screen">
      <header className="trip-header">
        <div className="trip-header-bar">
          <button type="button" className="header-btn" onClick={goHome} aria-label="Volver al inicio">
            <BackIcon />
          </button>
          <div className="trip-title-wrap">
            <h1 className="trip-title">{trip.name}</h1>
            <p className="trip-sub">
              {[
                isOuting && '🌙 Previa y salida',
                trip.trip_date && formatTripDate(trip.trip_date),
                trip.place,
                `${members.length} jugadores`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <span className="trip-avatars" aria-hidden="true">
            {members.slice(0, 3).map((m) => (
              <Avatar key={m.user_id} id={m.user_id} name={m.profile?.display_name ?? '?'} size={28} />
            ))}
          </span>
        </div>
      </header>

      <main className="trip-main">
        {user.isDemo && (
          <p className="demo-banner"><strong>Modo demo</strong> · Probá cargar tragos, misiones y quiebres.</p>
        )}

        {isOuting && outing === 'upcoming' && trip.trip_date && (
          <div className="outing-banner">
            <span className="outing-emoji" aria-hidden="true">🌙</span>
            <div>
              <strong>La salida es el {formatTripDate(trip.trip_date)}</strong>
              <span>Ese día se habilita todo: tragos, misiones, duelos, casino… Mientras tanto, armá la carta en Reglas.</span>
            </div>
          </div>
        )}

        {isOuting && outing === 'finished' && (
          <div className="outing-banner outing-banner--done">
            <span className="outing-emoji" aria-hidden="true">🏁</span>
            <div>
              <strong>La salida terminó</strong>
              <span>Todavía se pueden validar fotos, cumplir prendas y ver la galería.</span>
            </div>
            <ol className="podium">
              {nightBoard.slice(0, 3).map((r, i) => (
                <li key={r.userId} className={`podium-${i + 1}`}>
                  <span className="podium-medal" aria-hidden="true">{r.points > 0 ? ['🥇', '🥈', '🥉'][r.rank - 1] ?? '' : ''}</span>
                  <Avatar id={r.userId} name={r.name} size={i === 0 ? 48 : 38} />
                  <span className="podium-name">{r.userId === me ? 'Vos' : r.name}</span>
                  <span className="podium-pts">{r.points}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {isOuting ? (
          <div className="stats">
            <div className="stat">
              <span className="stat-label">Puntos de la noche</span>
              <span className="stat-value">{nightRow?.points ?? 0}</span>
              {waiting !== 0 && <span className="stat-pending">⏳ {waiting > 0 ? '+' : ''}{waiting} por validar</span>}
            </div>
            <div className="stat">
              <span className="stat-label">Puesto</span>
              <span className="stat-value">{nightRow ? `${nightRow.rank}°` : '—'}</span>
              <span className="stat-sub">de {members.length}</span>
            </div>
          </div>
        ) : (
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Hoy</span>
            <span className="stat-value">{todayRow?.points ?? 0}</span>
            <span className="stat-sub">{todayRow ? `${todayRow.rank}° de ${members.length}` : '—'}</span>
            {waiting !== 0 && <span className="stat-pending">⏳ {waiting > 0 ? '+' : ''}{waiting} por validar</span>}
          </div>
          <div className="stat">
            <span className="stat-label">General</span>
            <span className="stat-value">{totalRow?.points ?? 0}</span>
            <span className="stat-sub">{totalRow ? `${totalRow.rank}° de ${members.length}` : '—'}</span>
          </div>
        </div>
        )}

        {(doubleActive || shieldActive) && (
          <p className="active-effects">
            {doubleActive && <span>✌️ Doble activo</span>}
            {shieldActive && <span>🛡️ Escudo activo</span>}
          </p>
        )}

        {canPlay && (
        <div className="actions">
          <button type="button" className="action action--drink" onClick={() => setSheet('drink')}>
            <span className="action-emoji" aria-hidden="true">🍺</span>
            <span>Cargar trago</span>
          </button>
          <button type="button" className="action action--quiebre" onClick={() => setSheet('quiebre')}>
            <span className="action-emoji" aria-hidden="true">😵</span>
            <span>Alguien quebró</span>
          </button>
        </div>
        )}

        {pending.map((day) => (
          <button
            key={day}
            type="button"
            className="spin-banner"
            onClick={() => {
              setSpinDay(day)
              setSheet('roulette')
            }}
          >
            <span className="spin-banner-emoji" aria-hidden="true">🏆</span>
            <span>
              <strong>¡Ganaste la jornada de {formatDay(day, today).toLowerCase()}!</strong>
              <span>Tocá para girar la ruleta y llevarte un comodín.</span>
            </span>
          </button>
        ))}

        <PendingSection detail={detail} me={me} now={now} onChange={refresh} onGo={goTo} />

        <nav className="tabs" role="tablist" aria-label="Secciones del viaje">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className="tab"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="tab-panel" role="tabpanel">
          {tab === 'play' && !canPlay && (
            <>
              <section className="card-box">
                <p className="muted center">
                  {outing === 'upcoming'
                    ? '🌙 Los juegos se habilitan el día de la salida.'
                    : '🏁 La salida terminó: ya no se pueden cargar cosas nuevas.'}
                </p>
              </section>
              <ForfeitsBox detail={detail} me={me} onChange={refresh} canReport={false} />
            </>
          )}
          {tab === 'play' && canPlay && (
            <>
              <MissionCard
                tripId={tripId}
                userId={me}
                rules={trip}
                mission={mission}
                underVote={missionUnderVote}
                onChange={refresh}
              />
              <MissionsBoard detail={detail} me={me} today={today} now={now} onChange={refresh} />
              <DuelsBox detail={detail} me={me} today={today} onChange={refresh} />
              <ChefRouletteBox detail={detail} me={me} onChange={refresh} />
              <CasinoBox detail={detail} me={me} now={now} isDemo={user.isDemo} onChange={refresh} />
              <ForfeitsBox detail={detail} me={me} onChange={refresh} />
              {!isOuting && <CardsSection cards={cards} members={members} userId={me} onChange={refresh} />}
            </>
          )}
          {tab === 'board' && (
            <ScoreBoard
              members={members}
              events={events}
              cards={cards}
              userId={me}
              today={today}
              singleDay={isOuting ? nightDay : undefined}
            />
          )}
          {tab === 'feed' && (
            <ActivityFeed events={events} eventVotes={detail.eventVotes} members={members} userId={me} today={today} />
          )}
          {tab === 'gallery' && <GalleryTab events={events} members={members} userId={me} today={today} />}
          {tab === 'drinks' && (
            <>
              <DrinksTab tripId={tripId} drinks={drinks} rules={trip} isOwner={isOwner} onChange={refresh} />
              <ListsEditor
                tripId={tripId}
                infractions={detail.infractions}
                forfeits={detail.forfeits}
                isOwner={isOwner}
                onChange={refresh}
              />
            </>
          )}
        </div>
      </main>

      <LogDrinkSheet
        open={sheet === 'drink'}
        onClose={() => setSheet('none')}
        tripId={tripId}
        userId={me}
        drinks={drinks}
        doubleActive={doubleActive}
        isOwner={isOwner}
        onDone={refresh}
        onGoToDrinks={() => setTab('drinks')}
      />
      <QuiebreSheet
        open={sheet === 'quiebre'}
        onClose={() => setSheet('none')}
        tripId={tripId}
        userId={me}
        members={members}
        penalty={trip.quiebre_penalty}
        onDone={refresh}
      />
      <RouletteSheet
        open={sheet === 'roulette'}
        onClose={() => {
          setSheet('none')
          load()
        }}
        tripId={tripId}
        day={spinDay}
        today={today}
        onDone={showToast}
      />

      {(() => {
        // Duelo en vivo, o el último que terminó y todavía no cerraste
        const live = myLiveDuel(detail.duels, me)
        const justDone = detail.duels.find(
          (d) =>
            d.status === 'done' &&
            (d.challenger_id === me || d.opponent_id === me) &&
            d.ends_at &&
            Date.now() - Date.parse(d.ends_at) < 5 * 60_000 &&
            !closedDuels[d.id],
        )
        const duel = live ?? (justDone && detail.duelResults.some((r) => r.duel_id === justDone.id) ? justDone : null)
        if (!duel || closedDuels[duel.id]) return null
        return (
          <DuelOverlay
            key={duel.id}
            duel={duel}
            detail={detail}
            me={me}
            clockOffset={clockOffset}
            onChange={() => load()}
            onClose={() => setClosedDuels((c) => ({ ...c, [duel.id]: true }))}
          />
        )
      })()}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
