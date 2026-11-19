import { useCallback, useEffect, useRef, useState } from 'react'
import type { TripDetail } from '../lib/api'
import type { LiveChange } from '../lib/realtime'
import { formatDateRange, hasFeature } from '../lib/features'
import { deliverNotice } from '../lib/notifications'
import TripSettingsBox from '../components/trip/TripSettingsBox'
import { applyTripChange, needsReload, nextDeadline } from '../lib/tripSync'
import { useApi, type AppUser } from '../lib/authContext'
import NotificationsPrompt from '../components/NotificationsPrompt'
import PracticeCoach from '../components/trip/PracticeCoach'
import { friendlyError } from '../lib/errors'
import {
  activeCasino,
  activeChefSpin,
  cardDef,
  formatDay,
  formatTime,
  isActiveChallenge,
  isDanceVoting,
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
import { BackIcon, DizzyIcon, FlameIcon, MugIcon } from '../components/icons'
import ActivityFeed from '../components/trip/ActivityFeed'
import BolicheOverlay from '../components/trip/BolicheOverlay'
import BurnOverlay, { type BurnInfo } from '../components/trip/BurnOverlay'
import BurnSheet from '../components/trip/BurnSheet'
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
import MembersSheet from '../components/trip/MembersSheet'
import MissionCard from '../components/trip/MissionCard'
import MissionsBoard from '../components/trip/MissionsBoard'
import PendingSection from '../components/trip/PendingSection'
import QuiebreOverlay from '../components/trip/QuiebreOverlay'
import QuiebreSheet from '../components/trip/QuiebreSheet'
import RouletteSheet from '../components/trip/RouletteSheet'
import ScoreBoard from '../components/trip/ScoreBoard'
import './TripScreen.css'
import AppLoading from '../components/AppLoading'

type Tab = 'play' | 'board' | 'feed' | 'gallery' | 'drinks'
type SheetName = 'none' | 'drink' | 'quiebre' | 'burn' | 'roulette' | 'members'

const TABS: { key: Tab; label: string }[] = [
  { key: 'play', label: 'Jugar' },
  { key: 'board', label: 'Tabla' },
  { key: 'feed', label: 'Actividad' },
  { key: 'gallery', label: 'Galería' },
  { key: 'drinks', label: 'Reglas' },
]

// Sin tiempo real (o en la demo) se vuelve a pedir el viaje cada tanto
const REFRESH_MS = 20_000
/** Mientras hay votaciones o fotos por validar se refresca más seguido */
const FAST_REFRESH_MS = 3_000
/** Durante un duelo tuyo, casi en vivo */
const DUEL_REFRESH_MS = 1_200
/** Con tiempo real los cambios llegan solos; igual se resincroniza cada tanto */
const LIVE_RESYNC_MS = 180_000
/** Al volver a la app después de este tiempo afuera, se pide todo de nuevo */
const AWAY_RELOAD_MS = 20_000
/** Si después de una jugada no llega el aviso en vivo, se pide todo de nuevo */
const ECHO_TIMEOUT_MS = 2_000
/** Cada cuánto se chequea (con un pedido mínimo) que no se haya perdido nada en vivo */
const PULSE_MS = 15_000
/** Un cambio que no llegó en vivo después de esto se da por perdido */
const PULSE_GRACE_MS = 2_500
/** Si se perdió algo en vivo, se refresca seguido durante este rato */
const STALE_MS = 60_000
/** Los cambios que llegan juntos se aplican de una (un solo redibujado) */
const BATCH_MS = 100
/** Un quiebre se "anuncia" con animación si pasó hace menos de esto */
const QUIEBRE_FRESH_MS = 15 * 60_000

function formatTripDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

type TripScreenProps = {
  tripId: string
  user: AppUser
  /** Sala de práctica del tutorial: muestra la guía y la llama al terminar */
  onPracticeFinish?: () => void
}

export default function TripScreen({ tripId, user, onPracticeFinish }: TripScreenProps) {
  const practice = Boolean(onPracticeFinish)
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
  const [quiebreTitle, setQuiebreTitle] = useState<string | null>(null)
  /** Alguien quemó a alguien: animación con llamas */
  const [burnInfo, setBurnInfo] = useState<BurnInfo | null>(null)
  /** Arrancó la Hora boliche: animación (una vez por activación) */
  const [bolicheBy, setBolicheBy] = useState<string | null>(null)
  const [togglingBoliche, setTogglingBoliche] = useState(false)
  /** El organizador eliminó el viaje mientras estabas adentro */
  const [deleted, setDeleted] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deletingRef = useRef(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const [live, setLive] = useState(false)
  const liveRef = useRef(false)
  /** Hora del último cambio recibido en vivo */
  const lastChangeAt = useRef(0)
  const loadSeq = useRef(0)
  /** Cambios que llegan mientras se está pidiendo el viaje: se aplican arriba de la respuesta */
  const buffered = useRef<LiveChange[] | null>(null)
  const reloadTimer = useRef<number | undefined>(undefined)
  /** Cambios en vivo esperando a aplicarse todos juntos */
  const queued = useRef<LiveChange[]>([])
  const flushTimer = useRef<number | undefined>(undefined)
  /** Hora local en que se pidió el último viaje completo */
  const lastLoadAt = useRef(0)
  const clockOffsetRef = useRef(0)
  /** Se perdió algo en vivo (ej: Supabase cortó por límite de mensajes): se refresca seguido */
  const [stale, setStale] = useState(false)
  const staleTimer = useRef<number | undefined>(undefined)

  const markStale = useCallback(() => {
    setStale(true)
    window.clearTimeout(staleTimer.current)
    staleTimer.current = window.setTimeout(() => setStale(false), STALE_MS)
  }, [])

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    buffered.current = []
    try {
      const t0 = Date.now()
      const d = await api.getTrip(tripId)
      const t1 = Date.now()
      if (seq !== loadSeq.current) return
      const next = (buffered.current ?? []).reduce(applyTripChange, d)
      buffered.current = null
      lastLoadAt.current = t0
      // Reloj del servidor ≈ hora de respuesta − mitad de la demora
      clockOffsetRef.current = Date.parse(d.serverTime) - (t0 + t1) / 2
      setClockOffset(clockOffsetRef.current)
      setDetail(next)
      setError(null)
    } catch (err) {
      if (seq !== loadSeq.current) return
      buffered.current = null
      setError(friendlyError(err))
    }
  }, [api, tripId])

  const reloadNow = useCallback(() => void load(), [load])

  /** Junta varios pedidos seguidos en uno solo */
  const scheduleReload = useCallback(
    (delay = 250) => {
      window.clearTimeout(reloadTimer.current)
      reloadTimer.current = window.setTimeout(() => void load(), delay)
    },
    [load],
  )

  /** Después de una jugada: con tiempo real llega sola; si no llega, se pide */
  const expectEcho = useCallback(() => {
    if (!liveRef.current) {
      void load()
      return
    }
    const since = Date.now()
    window.setTimeout(() => {
      if (lastChangeAt.current < since) {
        markStale()
        void load()
      }
    }, ECHO_TIMEOUT_MS)
  }, [load, markStale])

  const fast = Boolean(
    detail &&
      (detail.challenges.some(isActiveChallenge) ||
        detail.events.some((e) => e.status === 'pending') ||
        activeChefSpin(detail.chefSpins) ||
        activeCasino(detail.casinoSessions)),
  )
  const counting = Boolean(
    detail &&
      (detail.challenges.some(isActiveChallenge) ||
        activeCasino(detail.casinoSessions) ||
        detail.duels.some((d) => isDanceVoting(d))),
  )
  const inDuel = Boolean(
    detail?.duels.some(
      (d) =>
        (d.status === 'live' || d.status === 'invited' || d.status === 'voting') &&
        (d.challenger_id === user.id || d.opponent_id === user.id),
    ),
  )

  useEffect(() => {
    load()
    return () => {
      window.clearTimeout(reloadTimer.current)
      window.clearTimeout(flushTimer.current)
      window.clearTimeout(staleTimer.current)
    }
  }, [load])

  // En vivo: cada cambio que hace alguien llega por Supabase Realtime y se aplica al toque
  useEffect(() => {
    const stop = api.subscribeTrip(tripId, {
      onChange(change) {
        lastChangeAt.current = Date.now()
        // Aviso para varios de la sala (lo muestra el navegador si estás en otra app)
        if (change.t === 'notifications') {
          deliverNotice(change.row, me)
          return
        }
        buffered.current?.push(change)
        if (change.t === 'trips' && change.op === 'DELETE') {
          if (!deletingRef.current) setDeleted(true)
          return
        }
        if (needsReload(change)) {
          scheduleReload()
          return
        }
        // Con mucha actividad llegan varios por segundo: se aplican juntos
        queued.current.push(change)
        flushTimer.current ??= window.setTimeout(() => {
          flushTimer.current = undefined
          const changes = queued.current
          queued.current = []
          setDetail((prev) => (prev ? changes.reduce(applyTripChange, prev) : prev))
        }, BATCH_MS)
      },
      onStatus(isLive) {
        liveRef.current = isLive
        setLive(isLive)
        // Recién conectado (o reconectado): pudo haberse perdido algo en el medio
        if (isLive) scheduleReload()
      },
    })
    return () => {
      stop()
      liveRef.current = false
    }
  }, [api, tripId, scheduleReload, me])

  // Con tiempo real, cada tanto se pregunta la hora del último cambio de la sala (es mínimo).
  // Si hubo algo después de lo último que llegó en vivo, se perdió: se pide todo de nuevo.
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(async () => {
      if (document.hidden) return
      const pulse = await api.tripPulse(tripId).catch(() => null)
      if (!pulse) return
      const at = Date.parse(pulse)
      const offset = clockOffsetRef.current
      const seen = Math.max(lastChangeAt.current, lastLoadAt.current) + offset
      if (at > seen && Date.now() + offset - at > PULSE_GRACE_MS) {
        markStale()
        void load()
      }
    }, PULSE_MS)
    return () => window.clearInterval(id)
  }, [live, api, tripId, load, markStale])

  // Sin tiempo real se refresca seguido; con tiempo real, solo de vez en cuando por las dudas
  useEffect(() => {
    const trusted = live && !stale
    const ms = trusted ? LIVE_RESYNC_MS : inDuel ? DUEL_REFRESH_MS : fast || stale ? FAST_REFRESH_MS : REFRESH_MS
    const id = window.setInterval(() => {
      setNow(Date.now())
      if (!document.hidden) load()
    }, ms)
    return () => window.clearInterval(id)
  }, [load, fast, inDuel, live, stale])

  // Al volver a la app (el celular suele cortar la conexión en segundo plano)
  const hiddenAt = useRef(0)
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now()
        return
      }
      setNow(Date.now())
      if (!liveRef.current || Date.now() - hiddenAt.current > AWAY_RELOAD_MS) scheduleReload(100)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [scheduleReload])

  // Cuando vence una votación, un casino o un duelo, alguien tiene que cerrarlo.
  // Cada celular espera un poquito distinto: el primero lo cierra y el resto ya lo ve cerrado.
  const deadline = detail ? nextDeadline(detail) : null
  useEffect(() => {
    if (deadline === null) return
    const wait = deadline - clockOffset - Date.now() + 300 + Math.random() * 900
    const id = window.setTimeout(() => {
      setNow(Date.now())
      api
        .tickTrip(tripId)
        .catch(() => undefined)
        .then(expectEcho)
    }, Math.max(0, wait))
    return () => window.clearTimeout(id)
  }, [deadline, clockOffset, api, tripId, expectEcho])

  // Cuenta regresiva de las votaciones
  useEffect(() => {
    if (!counting) return
    // Arranca con la hora actual (la anterior puede tener varios segundos)
    const first = window.setTimeout(() => setNow(Date.now()), 0)
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [counting])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const quiebreTitleFor = useCallback(
    (userId: string) => {
      if (userId === user.id) return '¡Quebraste!'
      const name = detail?.trip.members.find((m) => m.user_id === userId)?.profile?.display_name ?? 'Alguien'
      return `¡${name} quebró!`
    },
    [detail, user.id],
  )

  // Si alguien acaba de quebrar (y todavía no lo viste), animación a pantalla completa (una a la vez)
  useEffect(() => {
    if (!detail || quiebreTitle) return
    const key = `escabiarg:seen-quiebres:${tripId}`
    let seen: string[] = []
    try {
      seen = JSON.parse(localStorage.getItem(key) ?? '[]') as string[]
    } catch {
      seen = []
    }
    const fresh = detail.events.filter(
      (e) =>
        e.kind === 'quiebre' &&
        e.status !== 'rejected' &&
        Date.now() - Date.parse(e.created_at) < QUIEBRE_FRESH_MS &&
        !seen.includes(e.id),
    )
    if (fresh.length === 0) return
    setQuiebreTitle(quiebreTitleFor(fresh[0].user_id))
    try {
      localStorage.setItem(key, JSON.stringify([...fresh.map((e) => e.id), ...seen].slice(0, 100)))
    } catch {
      // sin localStorage: puede repetirse, no pasa nada
    }
  }, [detail, tripId, quiebreTitleFor, quiebreTitle])

  // Si alguien acaba de quemar a alguien (y todavía no lo viste), llamas a pantalla completa.
  // Una sola a la vez: si queman a varios seguido no se reinicia; al terminar se muestra la última.
  useEffect(() => {
    if (!detail || burnInfo) return
    const key = `escabiarg:seen-burns:${tripId}`
    let seen: string[] = []
    try {
      seen = JSON.parse(localStorage.getItem(key) ?? '[]') as string[]
    } catch {
      seen = []
    }
    const fresh = detail.events.filter(
      (e) =>
        e.kind === 'burn' &&
        e.status !== 'rejected' &&
        Date.now() - Date.parse(e.created_at) < QUIEBRE_FRESH_MS &&
        !seen.includes(e.id),
    )
    if (fresh.length === 0) return
    const e = fresh[0]
    const who = (id: string) => detail.trip.members.find((m) => m.user_id === id)?.profile?.display_name ?? 'Alguien'
    setBurnInfo({
      title:
        e.actor_id === user.id
          ? `¡Quemaste a ${who(e.user_id)}!`
          : e.user_id === user.id
            ? `¡${who(e.actor_id)} te quemó!`
            : `¡${who(e.actor_id)} quemó a ${who(e.user_id)}!`,
      drink: `${e.emoji} ${e.title}`,
      points: e.points,
      victimId: e.user_id,
      victimName: who(e.user_id),
      byName: e.actor_id === user.id ? 'vos' : who(e.actor_id),
    })
    try {
      localStorage.setItem(key, JSON.stringify([...fresh.map((x) => x.id), ...seen].slice(0, 100)))
    } catch {
      // sin localStorage: puede repetirse, no pasa nada
    }
  }, [detail, tripId, user.id, burnInfo])

  // Si se activó la Hora boliche hace poco y todavía no la viste, animación a pantalla completa
  const bolicheAt = detail?.trip.boliche_at ?? null
  const ownerName = detail
    ? detail.trip.owner_id === user.id
      ? 'Vos'
      : detail.trip.members.find((m) => m.user_id === detail.trip.owner_id)?.profile?.display_name ?? 'el organizador'
    : ''
  useEffect(() => {
    if (!bolicheAt || Date.now() - Date.parse(bolicheAt) > 30 * 60_000) return
    const key = `escabiarg:seen-boliche:${tripId}`
    try {
      if (localStorage.getItem(key) === bolicheAt) return
      localStorage.setItem(key, bolicheAt)
    } catch {
      // sin localStorage puede repetirse, no pasa nada
    }
    setBolicheBy(ownerName)
  }, [bolicheAt, tripId, ownerName])

  const toggleBoliche = async (on: boolean) => {
    if (!on && !window.confirm('¿Terminar la Hora boliche? Vuelven las misiones, prendas y duelos de siempre.')) return
    setTogglingBoliche(true)
    try {
      await api.setBoliche(tripId, on)
      refresh(on ? undefined : '🌙 Se terminó la Hora boliche')
    } catch (err) {
      showToast(friendlyError(err))
    } finally {
      setTogglingBoliche(false)
    }
  }

  const showToast = (message?: string) => {
    if (!message) return
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }

  const refresh = (message?: string) => {
    showToast(message)
    expectEcho()
  }

  const goTo = (anchor: string) => {
    setTab('play')
    window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  const removeTrip = async () => {
    if (!detail) return
    const what = detail.trip.kind === 'salida' ? 'la salida' : 'el viaje'
    if (!window.confirm(`¿Eliminar ${what} "${detail.trip.name}"?\n\nSe borra para todos: puntos, fotos, actividad, prendas y duelos.`)) return
    if (!window.confirm('¿Seguro? No se puede deshacer.')) return
    deletingRef.current = true
    setDeleting(true)
    try {
      await api.deleteTrip(tripId)
      goHome()
    } catch (err) {
      deletingRef.current = false
      setDeleting(false)
      showToast(friendlyError(err))
    }
  }

  if (deleted) {
    return (
      <div className="trip-screen trip-screen--center">
        <div className="home-error">
          <p className="notice" role="status">🗑️ El organizador eliminó este viaje.</p>
          <div className="home-error-actions">
            <button type="button" className="btn btn--primary" onClick={goHome}>Volver al inicio</button>
          </div>
        </div>
      </div>
    )
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
          <AppLoading text="Sirviendo el viaje…" />
        )}
      </div>
    )
  }

  const { trip, drinks, events, missions, cards } = detail
  const members = trip.members
  const isOwner = trip.owner_id === me
  const boliche = Boolean(trip.boliche_at)
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
    <div className={`trip-screen${boliche ? ' is-boliche' : ''}${practice ? ' is-practice' : ''}`} data-live={live || undefined}>
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
                trip.trip_date && formatDateRange(trip.trip_date, trip.end_date),
                trip.place,
                `${members.length} ${members.length === 1 ? 'jugador' : 'jugadores'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            type="button"
            className="trip-avatars"
            onClick={() => setSheet('members')}
            aria-label={`Jugadores (${members.length})${isOwner ? ': sumar gente' : ''}`}
          >
            {members.slice(0, 3).map((m) => (
              <Avatar key={m.user_id} id={m.user_id} name={m.profile?.display_name ?? '?'} size={28} />
            ))}
            {isOwner && <span className="trip-avatars-add" aria-hidden="true">+</span>}
          </button>
        </div>
      </header>

      <main className="trip-main">
        {user.isDemo && !practice && (
          <p className="demo-banner"><strong>Modo demo</strong> · Probá cargar tragos, misiones y quiebres.</p>
        )}
        {practice && (
          <p className="demo-banner"><strong>Sala de práctica</strong> · Nada de acá cuenta ni lo ve nadie.</p>
        )}

        {!user.isDemo && (
          <NotificationsPrompt
            api={api}
            userId={me}
            name={trip.members.find((m) => m.user_id === me)?.profile?.display_name ?? 'che'}
          />
        )}

        {isOuting && outing === 'upcoming' && trip.trip_date && (
          <div className="outing-banner">
            <span className="outing-emoji" aria-hidden="true">🌙</span>
            <div>
              <strong>La salida es el {formatTripDate(trip.trip_date)}</strong>
              <span>Ese día se habilita todo. Mientras tanto, armá la carta en Reglas.</span>
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
          <div className="stats" data-tour="stats">
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
        <div className="stats" data-tour="stats">
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

        {boliche ? (
          <div className="boliche-banner" role="status">
            <span className="boliche-ball" aria-hidden="true">🪩</span>
            <div>
              <strong>Hora boliche</strong>
              <span>Desde las {formatTime(trip.boliche_at!)} · misiones, prendas y duelos de boliche</span>
            </div>
            {isOwner && (
              <button type="button" className="btn btn--ghost btn--sm" disabled={togglingBoliche} onClick={() => toggleBoliche(false)}>
                Terminar
              </button>
            )}
          </div>
        ) : isOwner && canPlay && hasFeature(trip, 'boliche') ? (
          <button type="button" className="boliche-toggle" disabled={togglingBoliche} onClick={() => toggleBoliche(true)}>
            <span className="boliche-toggle-ball" aria-hidden="true">🪩</span>
            <span>
              <strong>{togglingBoliche ? 'Activando…' : 'Activar Hora boliche'}</strong>
              <small>Las misiones, prendas y duelos pasan a ser de boliche</small>
            </span>
          </button>
        ) : null}

        {(doubleActive || shieldActive) && (
          <p className="active-effects">
            {doubleActive && <span>✌️ Doble activo</span>}
            {shieldActive && <span>🛡️ Escudo activo</span>}
          </p>
        )}

        {canPlay && (
        <div className="actions">
          <button type="button" className="action action--drink" data-tour="drink" onClick={() => setSheet('drink')}>
            <span className="action-emoji" aria-hidden="true"><MugIcon size={30} /></span>
            <span>Cargar trago</span>
          </button>
          <button type="button" className="action action--quiebre" data-tour="quiebre" onClick={() => setSheet('quiebre')}>
            <span className="action-emoji" aria-hidden="true"><DizzyIcon size={26} /></span>
            <span>Alguien quebró</span>
          </button>
          <button type="button" className="action action--burn" data-tour="burn" onClick={() => setSheet('burn')}>
            <span className="action-emoji" aria-hidden="true"><FlameIcon size={26} /></span>
            <span>
              Quemar
              <br />
              <small>Agarrá a alguien tomando agua para apagar el fuego</small>
            </span>
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
              data-tour={`tab-${t.key}`}
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
              {/* Los extras se muestran solo si el plan los tiene (lo en curso se ve igual) */}
              {hasFeature(trip, 'missions') && (
                <>
                  <MissionCard
                    tripId={tripId}
                    userId={me}
                    rules={trip}
                    mission={mission}
                    underVote={missionUnderVote}
                    boliche={boliche}
                    onChange={refresh}
                  />
                  <MissionsBoard detail={detail} me={me} today={today} now={now} onChange={refresh} />
                </>
              )}
              {(hasFeature(trip, 'duels') || detail.duels.some((d) => ['invited', 'live', 'voting'].includes(d.status))) && (
                <DuelsBox detail={detail} me={me} today={today} boliche={boliche} onChange={refresh} />
              )}
              {(hasFeature(trip, 'chef') || activeChefSpin(detail.chefSpins)) && (
                <ChefRouletteBox detail={detail} me={me} boliche={boliche} onChange={refresh} />
              )}
              {/* En el boliche no hay casino (salvo que ya hubiera uno en curso) */}
              {((hasFeature(trip, 'casino') && !boliche) || activeCasino(detail.casinoSessions)) && (
                <CasinoBox detail={detail} me={me} now={now} isDemo={user.isDemo} onChange={refresh} />
              )}
              <ForfeitsBox detail={detail} me={me} boliche={boliche} onChange={refresh} />
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
            <ActivityFeed
              events={events}
              eventVotes={detail.eventVotes}
              members={members}
              userId={me}
              today={today}
              onReplayQuiebre={(userId) => setQuiebreTitle(quiebreTitleFor(userId))}
            />
          )}
          {tab === 'gallery' && (
            <GalleryTab events={events} members={members} userId={me} today={today} tripName={trip.name} />
          )}
          {tab === 'drinks' && (
            <>
              <TripSettingsBox key={`${trip.features?.join()}|${trip.trip_date}|${trip.end_date}`} trip={trip} isOwner={isOwner} onChange={refresh} />
              <DrinksTab tripId={tripId} drinks={drinks} rules={trip} features={trip.features} isOwner={isOwner} onChange={refresh} />
              <ListsEditor
                tripId={tripId}
                infractions={detail.infractions}
                forfeits={detail.forfeits}
                isOwner={isOwner}
                onChange={refresh}
              />
              {isOwner && (
                <section className="card-box card-box--danger" aria-labelledby="danger-title">
                  <h3 id="danger-title" className="box-title">Zona peligrosa</h3>
                  <p className="muted small">
                    Eliminar {isOuting ? 'la salida' : 'el viaje'} borra todo para todos: puntos, fotos, actividad, prendas y duelos.
                  </p>
                  <button type="button" className="btn btn--danger-solid btn--block" disabled={deleting} onClick={removeTrip}>
                    {deleting ? 'Eliminando…' : `🗑️ Eliminar ${isOuting ? 'salida' : 'viaje'}`}
                  </button>
                </section>
              )}
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
      <MembersSheet
        open={sheet === 'members'}
        onClose={() => setSheet('none')}
        tripId={tripId}
        me={me}
        members={members}
        isOwner={isOwner}
        isOuting={isOuting}
        onDone={refresh}
      />
      <BurnSheet
        open={sheet === 'burn'}
        onClose={() => setSheet('none')}
        tripId={tripId}
        userId={me}
        members={members}
        drinks={drinks}
        isOwner={isOwner}
        onDone={refresh}
        onGoToDrinks={() => setTab('drinks')}
      />
      <RouletteSheet
        open={sheet === 'roulette'}
        onClose={() => {
          setSheet('none')
          expectEcho()
        }}
        tripId={tripId}
        day={spinDay}
        today={today}
        onDone={showToast}
      />

      {(() => {
        // Duelo en vivo, o el último que terminó y todavía no cerraste
        const liveDuel = myLiveDuel(detail.duels, me)
        const justDone = detail.duels.find(
          (d) =>
            d.status === 'done' &&
            (d.challenger_id === me || d.opponent_id === me) &&
            d.ends_at &&
            Date.now() - Date.parse(d.ends_at) < 5 * 60_000 &&
            !closedDuels[d.id],
        )
        const duel = liveDuel ?? (justDone && detail.duelResults.some((r) => r.duel_id === justDone.id) ? justDone : null)
        if (!duel || closedDuels[duel.id]) return null
        return (
          <DuelOverlay
            key={duel.id}
            duel={duel}
            detail={detail}
            me={me}
            clockOffset={clockOffset}
            onChange={() => expectEcho()}
            onClose={() => setClosedDuels((c) => ({ ...c, [duel.id]: true }))}
          />
        )
      })()}

      {quiebreTitle && <QuiebreOverlay title={quiebreTitle} onClose={() => setQuiebreTitle(null)} />}
      {burnInfo && !quiebreTitle && <BurnOverlay info={burnInfo} onClose={() => setBurnInfo(null)} />}
      {bolicheBy && !quiebreTitle && !burnInfo && <BolicheOverlay by={bolicheBy} onClose={() => setBolicheBy(null)} />}
      {onPracticeFinish && (
        <PracticeCoach detail={detail} me={me} tab={tab} onRefresh={reloadNow} onFinish={onPracticeFinish} />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
