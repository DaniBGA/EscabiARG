import { useState } from 'react'
import BeerLoader from './components/BeerLoader'
import LoginOptions from './components/LoginOptions'
import Home from './screens/Home'
import { useSession } from './lib/useSession'

export default function App() {
  const session = useSession()
  const [introDone, setIntroDone] = useState(false)

  if (introDone && session) return <Home key={session.user.id} session={session} />

  return (
    // Si ya se vio la intro (ej: después de cerrar sesión) el vaso aparece lleno
    <BeerLoader instant={introDone} onFilled={() => setIntroDone(true)}>
      {session === null && <LoginOptions />}
    </BeerLoader>
  )
}
