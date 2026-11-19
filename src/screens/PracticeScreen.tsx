import { useMemo, useState } from 'react'
import { ApiOverrideContext, type AppUser } from '../lib/authContext'
import { DEMO_USER_ID, PRACTICE_TRIP_ID, practiceApi, resetPractice } from '../lib/demoApi'
import { markHomeTourPending, markTutorialSeen } from '../lib/tutorial'
import TripScreen from './TripScreen'

/** Adentro de la práctica sos "Vos", con Juli y Tincho (jugadores de ejemplo) */
const PRACTICE_USER: AppUser = { id: DEMO_USER_ID, isGuest: false, isDemo: true }

/**
 * Sala de práctica del tutorial: es la pantalla del viaje de siempre, pero con datos
 * de mentira guardados en el celular (no toca el servidor) y una guía paso a paso.
 */
export default function PracticeScreen({ user }: { user: AppUser }) {
  // Cada vez que se entra, arranca de cero
  const [startKey] = useState(() => {
    resetPractice()
    return Date.now()
  })
  const value = useMemo(() => ({ api: practiceApi, practice: true }), [])
  const finish = () => {
    markTutorialSeen(user.id)
    markHomeTourPending(user.id)
    window.location.hash = ''
  }

  return (
    <ApiOverrideContext.Provider value={value}>
      <TripScreen key={startKey} tripId={PRACTICE_TRIP_ID} user={PRACTICE_USER} onPracticeFinish={finish} />
    </ApiOverrideContext.Provider>
  )
}
