import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AppUser, type AuthState } from '../lib/authContext'
import { DEMO_USER_ID, resetDemoData } from '../lib/demoApi'
import { isDemoEnabled, supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

const DEMO_FLAG = 'escabiarg:demo'

/** Lee si el modo demo está activo (o se pidió con ?demo en la URL) */
function initialDemo(): boolean {
  if (!isDemoEnabled) return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('demo')) {
      params.delete('demo')
      const query = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash)
      localStorage.setItem(DEMO_FLAG, '1')
      return true
    }
    return localStorage.getItem(DEMO_FLAG) === '1'
  } catch {
    return false
  }
}

const DEMO_USER: AppUser = { id: DEMO_USER_ID, isGuest: false, isDemo: true }

export default function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const [demo, setDemo] = useState(initialDemo)

  const enterDemo = useCallback(() => {
    try {
      localStorage.setItem(DEMO_FLAG, '1')
    } catch {
      // la demo funciona igual, solo que no sobrevive a una recarga
    }
    setDemo(true)
  }, [])

  const signOut = useCallback(async () => {
    if (demo) {
      try {
        localStorage.removeItem(DEMO_FLAG)
      } catch {
        // nada
      }
      resetDemoData()
      setDemo(false)
      return
    }
    await supabase?.auth.signOut()
  }, [demo])

  const sessionUserId = session?.user.id
  const sessionIsGuest = Boolean(session?.user.is_anonymous)
  const hasSession = session === undefined ? undefined : session !== null

  const user = useMemo<AppUser | null | undefined>(() => {
    if (demo) return DEMO_USER
    if (hasSession === undefined) return undefined
    if (!hasSession || !sessionUserId) return null
    return { id: sessionUserId, isGuest: sessionIsGuest, isDemo: false }
  }, [demo, hasSession, sessionUserId, sessionIsGuest])

  const value = useMemo<AuthState>(() => ({ user, enterDemo, signOut }), [user, enterDemo, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
