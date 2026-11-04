import { useCallback, useEffect, useState } from 'react'
import type { Profile, Trip } from '../lib/api'
import { useApi, useAuth, type AppUser } from '../lib/authContext'
import { friendlyError } from '../lib/errors'
import Avatar from '../components/Avatar'
import CreateTripSheet from '../components/CreateTripSheet'
import FriendsSheet from '../components/FriendsSheet'
import ProfileSheet from '../components/ProfileSheet'
import TripCard from '../components/TripCard'
import { FriendsIcon, PlusIcon } from '../components/icons'
import './Home.css'

type Panel = 'none' | 'create' | 'friends' | 'profile'

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

  const loadAll = useCallback(async () => {
    try {
      await Promise.all([loadProfile(), loadFriends(), loadTrips()])
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [loadProfile, loadFriends, loadTrips])

  useEffect(() => {
    loadAll()
  }, [loadAll])

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

        <p className="home-greeting">¡Hola, {me.display_name}! 🍻</p>

        <button type="button" className="create-trip" onClick={() => setPanel('create')}>
          <span className="create-trip-icon"><PlusIcon size={28} /></span>
          <span className="create-trip-text">
            <strong>Crear viaje</strong>
            <span>Armá la juntada e invitá a tus amigos</span>
          </span>
        </button>

        {error && <p className="notice notice--error" role="alert">{error}</p>}

        <section className="trips" aria-labelledby="trips-title">
          <h2 id="trips-title" className="trips-title">Tus viajes</h2>

          {trips === null ? (
            <p className="trips-empty">Cargando…</p>
          ) : trips.length === 0 ? (
            <div className="trips-empty">
              <span className="trips-empty-emoji" aria-hidden="true">🍺</span>
              <p>Todavía no hay viajes. ¡Creá el primero!</p>
            </div>
          ) : (
            <ul className="trips-list">
              {trips.map((t) => (
                <li key={t.id}>
                  <TripCard trip={t} myId={me.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <CreateTripSheet
        open={panel === 'create'}
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
