// Supabase Edge Function "push": manda las notificaciones (Web Push).
// Se despliega con: supabase functions deploy push --no-verify-jwt
// (el usuario se verifica adentro, así anda con cualquier tipo de clave).
import { makeHandler } from './handler.ts'

Deno.serve(makeHandler((name) => Deno.env.get(name)))
