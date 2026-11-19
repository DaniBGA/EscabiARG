import { lazy, Suspense, useEffect, useState } from 'react'
import BeerLoader from './components/BeerLoader'
import LoginOptions from './components/LoginOptions'
import TermsGate from './components/TermsGate'
import Home from './screens/Home'
import { useApi, useAuth } from './lib/authContext'
import { useNotificationsBridge } from './lib/useNotifications'
import { isPracticePath, matchTrip, useHashRoute } from './lib/router'
import AppLoading from './components/AppLoading'

// La pantalla del viaje es la más pesada: se baja aparte para que el inicio cargue antes
const loadTripScreen = () => import('./screens/TripScreen')
const TripScreen = lazy(loadTripScreen)
const PracticeScreen = lazy(() => import('./screens/PracticeScreen'))

export default function App() {
  const { user } = useAuth()
  const api = useApi()
  const [introDone, setIntroDone] = useState(false)
  const path = useHashRoute()
  const tripId = matchTrip(path)
  const practice = isPracticePath(path)
  const loggedIn = introDone && Boolean(user)
  // Avisos del navegador (en vivo y Web Push)
  useNotificationsBridge(user, api)

  // Ya logueado, se trae en segundo plano para que abrir un viaje sea instantáneo
  useEffect(() => {
    if (loggedIn) void loadTripScreen()
  }, [loggedIn])

  if (introDone && user) {
    // Primero hay que aceptar los términos (una vez por persona y por versión)
    return (
      <TermsGate key={user.id} user={user}>
        {practice ? (
          <Suspense
            fallback={
              <div className="home home--center">
                <AppLoading text="Armando la práctica…" />
              </div>
            }
          >
            <PracticeScreen key={`${user.id}:practica`} user={user} />
          </Suspense>
        ) : tripId ? (
          <Suspense
            fallback={
              <div className="home home--center">
                <AppLoading text="Sirviendo el viaje…" />
              </div>
            }
          >
            <TripScreen key={`${user.id}:${tripId}`} tripId={tripId} user={user} />
          </Suspense>
        ) : (
          <Home key={user.id} user={user} />
        )}
      </TermsGate>
    )
  }

  return (
    // Si ya se vio la intro (ej: después de cerrar sesión) el vaso aparece lleno
    <BeerLoader instant={introDone} onFilled={() => setIntroDone(true)}>
      {user === null && <LoginOptions />}
    </BeerLoader>
  )
}
