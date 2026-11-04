import { useState } from 'react'
import BeerLoader from './components/BeerLoader'
import LoginOptions from './components/LoginOptions'
import Home from './screens/Home'
import TripScreen from './screens/TripScreen'
import { useAuth } from './lib/authContext'
import { matchTrip, useHashRoute } from './lib/router'

export default function App() {
  const { user } = useAuth()
  const [introDone, setIntroDone] = useState(false)
  const tripId = matchTrip(useHashRoute())

  if (introDone && user) {
    if (tripId) return <TripScreen key={`${user.id}:${tripId}`} tripId={tripId} user={user} />
    return <Home key={user.id} user={user} />
  }

  return (
    // Si ya se vio la intro (ej: después de cerrar sesión) el vaso aparece lleno
    <BeerLoader instant={introDone} onFilled={() => setIntroDone(true)}>
      {user === null && <LoginOptions />}
    </BeerLoader>
  )
}
