import { useCallback, useEffect, useRef, useState } from 'react'
import type { Profile, Trip } from '../lib/api'
import { useApi, useAuth, type AppUser } from '../lib/authContext'
import { friendlyError } from '../lib/errors'
import Avatar from '../components/Avatar'
import CreateTripSheet from '../components/CreateTripSheet'
import FriendsSheet from '../components/FriendsSheet'
import ProfileSheet from '../components/ProfileSheet'
import TripCard from '../components/TripCard'
import { FriendsIcon, MoonIcon, PlusIcon } from '../components/icons'
import './Home.css'

type Panel = 'none' | 'create' | 'create-outing' | 'friends' | 'profile'

export default function Home({ user }: { user: AppUser }) {
  const userId = user.id
  const api = useApi()
  const { signOut } = useAuth()

  const [me, setMe] = useState<Profile | null>(null)
  const [friends, setFriends] = useState<Profile[]>([])
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('none')

  const loadProfile = useCallback(async () => setMe(await api.getMyProfile(userId)), [api, userId])
  const loadFriends = useCallback(async () => setFriends(await api.listFriends(userId)), [api, userId])
  const loadTrips = useCallback(async () => setTrips(await api.listTrips()), [api])
  const [pending, setPending] = useState<Record<string, number>>({})
  const loadPending = useCallback(async () => {
    try {
      setPending(await api.pendingCounts())
    } catch {
      // los avisos no son críticos
    }
  }, [api])

  const loadAll = useCallback(async () => {
    try {
      await Promise.all([loadProfile(), loadFriends(), loadTrips()])
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [loadProfile, loadFriends, loadTrips])

  const [live, setLive] = useState(false)
  const pendingTimer = useRef<number | undefined>(undefined)
  /** Junta varios avisos seguidos en un solo pedido */
  const schedulePending = useCallback(() => {
    window.clearTimeout(pendingTimer.current)
    pendingTimer.current = window.setTimeout(() => void loadPending(), 500)
  }, [loadPending])

  useEffect(() => {
    loadAll()
    loadPending()
    return () => window.clearTimeout(pendingTimer.current)
  }, [loadAll, loadPending])

  // En vivo: te agregan como amigo o te suman a un viaje
  useEffect(
    () =>
      api.subscribeUser(userId, {
        onChange(change) {
          if (change.t === 'friendships') loadFriends().catch(() => undefined)
          if (change.t === 'trip_members') {
            loadTrips().catch(() => undefined)
            schedulePending()
          }
        },
        onStatus(isLive) {
          setLive(isLive)
          if (isLive) {
            loadFriends().catch(() => undefined)
            loadTrips().catch(() => undefined)
          }
        },
      }),
    [api, userId, loadFriends, loadTrips, schedulePending],
  )

  // Lo que pasa en tus viajes más recientes actualiza los avisos de pendientes
  const recentTrips = (trips ?? [])
    .slice(0, 10)
    .map((t) => t.id)
    .join(',')
  useEffect(() => {
    if (!recentTrips) return
    const stops = recentTrips.split(',').map((id) => api.subscribeTrip(id, { onChange: schedulePending }))
    return () => stops.forEach((stop) => stop())
  }, [api, recentTrips, schedulePending])

  // Sin tiempo real se consulta cada 30 s; con tiempo real, cada tanto por las dudas
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) loadPending()
    }, live ? 120_000 : 30_000)
    const onVisible = () => {
      if (!document.hidden) schedulePending()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [live, loadPending, schedulePending])

  const totalPending = Object.values(pending).reduce((a, b) => a + b, 0)

  const safely = (fn: () => Promise<void>) => () => {
    fn().catch((err) => setError(friendlyError(err)))
  }

  if (!me) {
    return (
      <div className="home home--center">
        {error ? (
          <div className="home-error">
            <p className="notice notice--error" role="alert">{error}</p>
            <div className="home-error-actions">
              <button type="button" className="btn btn--primary" onClick={() => {
                  setError(null)
                  loadAll()
                }}>Reintentar</button>
              <button type="button" className="btn btn--ghost" onClick={signOut}>
                Cerrar sesión
              </button>
            </div>
          </div>
        ) : (
          <p className="home-loading" role="status">Enfriando los vasos…</p>
        )}
      </div>
    )
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header-bar">
          <button
            type="button"
            className="header-btn"
            onClick={() => setPanel('profile')}
            aria-label="Tu perfil"
          >
            <Avatar id={me.id} name={me.display_name} size={40} />
          </button>

          <h1 className="home-logo">EscabiARG</h1>

          <button
            type="button"
            className="header-btn header-btn--friends"
            onClick={() => setPanel('friends')}
            aria-label={`Amigos (${friends.length})`}
          >
            <FriendsIcon size={26} />
            {friends.length > 0 && <span className="header-badge">{friends.length}</span>}
          </button>
        </div>
      </header>

      <main className="home-main">
        {user.isDemo && (
          <p className="demo-banner">
            <strong>Modo demo</strong> · Los datos son de prueba y se guardan solo en este dispositivo.
          </p>
        )}

        <p className="home-greeting">
          <span>¡Hola,</span> {me.display_name}!
        </p>

        {totalPending > 0 && trips && (
          <div className="home-pending" role="status">
            <strong>Tenés {totalPending} {totalPending === 1 ? 'cosa' : 'cosas'} para validar o votar</strong>
            <span>
              {trips
                .filter((t) => pending[t.id])
                .map((t) => `${t.name} (${pending[t.id]})`)
                .join(' · ')}
            </span>
          </div>
        )}

        <div className="create-row">
          <button type="button" className="create-trip" onClick={() => setPanel('create')}>
            <span className="create-trip-icon"><PlusIcon size={28} /></span>
            <span className="create-trip-text">
              <strong>Crear viaje</strong>
              <span>Varios días, con tus amigos</span>
            </span>
          </button>
          <button type="button" className="create-trip create-trip--night" onClick={() => setPanel('create-outing')}>
            <span className="create-trip-icon" aria-hidden="true"><MoonIcon size={26} /></span>
            <span className="create-trip-text">
              <strong>Previa y salida</strong>
              <span>Lo mismo, pero solo por una noche</span>
            </span>
          </button>
        </div>

        {error && <p className="notice notice--error" role="alert">{error}</p>}

        <section className="trips" aria-labelledby="trips-title">
          <h2 id="trips-title" className="sign trips-title">Tus planes</h2>

          {trips === null ? (
            <p className="trips-empty">Cargando…</p>
          ) : trips.length === 0 ? (
            <div className="trips-empty">
              <span className="trips-empty-emoji" aria-hidden="true">🍺</span>
              <p>Todavía no hay planes. ¡Armá un viaje o una salida!</p>
            </div>
          ) : (
            <ul className="trips-list">
              {trips.map((t) => (
                <li key={t.id}>
                  <TripCard trip={t} myId={me.id} pending={pending[t.id] ?? 0} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <CreateTripSheet
        key={panel === 'create-outing' ? 'salida' : 'viaje'}
        kind={panel === 'create-outing' ? 'salida' : 'viaje'}
        open={panel === 'create' || panel === 'create-outing'}
        onClose={() => setPanel('none')}
        friends={friends}
        onOpenFriends={() => setPanel('friends')}
        onCreated={() => {
          setPanel('none')
          safely(loadTrips)()
        }}
      />
      <FriendsSheet
        open={panel === 'friends'}
        onClose={() => setPanel('none')}
        me={me}
        friends={friends}
        onChange={safely(loadFriends)}
      />
      <ProfileSheet
        open={panel === 'profile'}
        onClose={() => setPanel('none')}
        me={me}
        user={user}
        onChange={safely(async () => {
          await loadProfile()
          await loadTrips()
        })}
      />
    </div>
  )
}
