import { createContext, useContext } from 'react'
import { supabaseApi, type Api } from './api'
import { demoApi } from './demoApi'

export type AppUser = {
  id: string
  /** Invitado anónimo de Supabase */
  isGuest: boolean
  /** Modo demo (datos locales, sin cuenta) */
  isDemo: boolean
}

export type AuthState = {
  /** undefined = cargando, null = sin sesión */
  user: AppUser | null | undefined
  enterDemo: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/** API de datos correspondiente al usuario actual (Supabase o demo) */
export function useApi(): Api {
  return useAuth().user?.isDemo ? demoApi : supabaseApi
}
