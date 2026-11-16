import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** undefined = todavía cargando, null = sin sesión */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (!data.session) return
      // La sesión guardada puede ser de una cuenta que ya no existe (ej: se borraron
      // todos los datos): se le pregunta al servidor y, si no está, se cierra sola.
      const { error } = await sb.auth.getUser()
      const gone =
        error &&
        ((error as { status?: number }).status === 403 ||
          (error as { status?: number }).status === 401 ||
          /user_not_found|session_not_found|does not exist/i.test(`${(error as { code?: string }).code ?? ''} ${error.message}`))
      if (gone) await sb.auth.signOut({ scope: 'local' }).catch(() => undefined)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return session
}
