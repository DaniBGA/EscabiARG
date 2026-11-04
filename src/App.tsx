import { lazy, Suspense, useEffect, useState } from 'react'
import BeerLoader from './components/BeerLoader'
import LoginOptions from './components/LoginOptions'
import Home from './screens/Home'
import { useAuth } from './lib/authContext'
import { matchTrip, useHashRoute } from './lib/router'

// La pantalla del viaje es la más pesada: se baja aparte para que el inicio cargue antes
const loadTripScreen = () => import('./screens/TripScreen')
const TripScreen = lazy(loadTripScreen)

export default function App() {
  const { user } = useAuth()
  const [introDone, setIntroDone] = useState(false)
  const tripId = matchTrip(useHashRoute())
  const loggedIn = introDone && Boolean(user)

  // Ya logueado, se trae en segundo plano para que abrir un viaje sea instantáneo
  useEffect(() => {
    if (loggedIn) void loadTripScreen()
  }, [loggedIn])

  if (introDone && user) {
    if (tripId) {
      return (
        <Suspense
          fallback={
            <div className="home home--center">
              <p className="home-loading" role="status">Sirviendo el viaje…</p>
            </div>
          }
        >
          <TripScreen key={`${user.id}:${tripId}`} tripId={tripId} user={user} />
        </Suspense>
      )
    }
    return <Home key={user.id} user={user} />
  }

  return (
    // Si ya se vio la intro (ej: después de cerrar sesión) el vaso aparece lleno
    <BeerLoader instant={introDone} onFilled={() => setIntroDone(true)}>
      {user === null && <LoginOptions />}
    </BeerLoader>
  )
}
