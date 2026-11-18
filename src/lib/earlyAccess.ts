import { supabase } from './supabase'

export type EarlyAccessStatus = { registered: number; max: number }

/** Cuántos ya entraron y cuál es el cupo. null = la base no tiene el cupo configurado */
export async function earlyAccessStatus(): Promise<EarlyAccessStatus | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('early_access_status')
  if (error || !data) return null
  const s = data as { registered?: number; max?: number }
  if (typeof s.registered !== 'number' || typeof s.max !== 'number') return null
  return { registered: s.registered, max: s.max }
}

/** Un invitado que cierra sesión libera su lugar (su cuenta se borra) */
export async function leaveEarlyAccess() {
  if (!supabase) return
  await supabase.rpc('leave_early_access')
}
