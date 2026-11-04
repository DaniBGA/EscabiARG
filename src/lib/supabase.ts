import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

/** null cuando faltan las variables de entorno (ver .env.example) */
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null

export const isGoogleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true'

/** Modo demo disponible salvo que se apague con VITE_ENABLE_DEMO=false */
export const isDemoEnabled = import.meta.env.VITE_ENABLE_DEMO !== 'false'

export function requireSupabase() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  return supabase
}
