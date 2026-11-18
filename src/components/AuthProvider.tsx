import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AppUser, type AuthState } from '../lib/authContext'
import { DEMO_USER_ID, resetDemoData } from '../lib/demoApi'
import { supabaseApi } from '../lib/api'
import { releasePush } from '../lib/notifications'
import { leaveEarlyAccess } from '../lib/earlyAccess'
import { isDemoEnabled, isEarlyAccess, supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

const DEMO_FLAG = 'escabiarg:demo'

/** Espera una promesa, pero no más de `ms` (si se cuelga, se sigue igual) */
function within<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([promise, new Promise<'timeout'>((r) => window.setTimeout(() => r('timeout'), ms))])
}

/** Borra la sesión guardada en este navegador (las claves sb-…-auth-token de Supabase) */
function forgetStoredSession() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^sb-.*-auth-token/.test(key)) localStorage.removeItem(key)
    }
  } catch {
    // sin acceso a localStorage no hay nada guardado que borrar
  }
}

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

  const sessionIsGuest = Boolean(session?.user.is_anonymous)

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
    if (!supabase) return
    // 1. Que a este celular no le lleguen más los avisos de esta cuenta
    await within(releasePush(supabaseApi), 2500).catch(() => undefined)
    // En el early access, el invitado que se va libera su lugar en el cupo
    if (isEarlyAccess && sessionIsGuest) await within(leaveEarlyAccess(), 4000).catch(() => undefined)
    // 2. Cerrar la sesión en el servidor y en el celular
    const result = await within(supabase.auth.signOut(), 6000).catch((err: unknown) => ({ error: err }))
    if (result !== 'timeout' && !result.error) return
    // 3. Si falló (sin internet, servidor caído, se colgó): se cierra igual en este celular.
    //    Se recarga para que no quede nada de la sesión vieja en memoria.
    await within(supabase.auth.signOut({ scope: 'local' }), 2500).catch(() => undefined)
    forgetStoredSession()
    window.location.replace(window.location.pathname)
  }, [demo, sessionIsGuest])

  const sessionUserId = session?.user.id
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
