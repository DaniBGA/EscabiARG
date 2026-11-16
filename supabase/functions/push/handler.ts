import { sendPush, type PushSubscription, type VapidKeys } from './webpush.ts'

/**
 * Función "push" de EscabiARG.
 *   { "op": "key" }   → la clave pública para que el navegador se suscriba
 *   { "op": "flush" } → manda los avisos nuevos a los celulares suscriptos
 * La app la llama después de cada jugada; solo usuarios logueados.
 */

type Env = (name: string) => string | undefined

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Item = PushSubscription & { payload: Record<string, unknown> }

export function makeHandler(env: Env) {
  const url = env('SUPABASE_URL')
  // Clave de servidor: la que da Supabase a las funciones (nunca va en la app)
  const secretKeys = env('SUPABASE_SECRET_KEYS')
  const serverKey =
    env('SUPABASE_SERVICE_ROLE_KEY') || (secretKeys ? (Object.values(JSON.parse(secretKeys))[0] as string) : undefined)
  const publicKey = env('SUPABASE_ANON_KEY') || serverKey
  const vapid: VapidKeys | null =
    env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY')
      ? { publicKey: env('VAPID_PUBLIC_KEY')!, privateKey: env('VAPID_PRIVATE_KEY')!, subject: env('VAPID_SUBJECT') || 'mailto:escabiarg@example.com' }
      : null

  const serverHeaders = () => {
    const h: Record<string, string> = { apikey: serverKey!, 'Content-Type': 'application/json' }
    // Las claves nuevas (sb_secret_...) van solo en apikey
    if (!serverKey!.startsWith('sb_')) h.Authorization = `Bearer ${serverKey}`
    return h
  }

  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: serverHeaders(), body: JSON.stringify(args) })
    if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  const isLoggedIn = async (req: Request) => {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return false
    const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: authorization, apikey: publicKey! } })
    await res.body?.cancel()
    return res.ok
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json(405, { error: 'POST' })
    if (!url || !serverKey) return json(500, { error: 'Faltan SUPABASE_URL / clave de servidor' })

    let op = ''
    try {
      op = String(((await req.json()) as { op?: string }).op ?? '')
    } catch {
      return json(400, { error: 'JSON' })
    }

    if (op === 'key') return json(200, { publicKey: vapid?.publicKey ?? null })
    if (op !== 'flush') return json(400, { error: 'op' })
    if (!(await isLoggedIn(req))) return json(401, { error: 'Iniciá sesión' })
    if (!vapid) return json(200, { sent: 0, reason: 'Faltan las claves VAPID' })

    let sent = 0
    const gone: string[] = []
    // Varias vueltas por si hay muchos avisos juntos
    for (let round = 0; round < 5; round++) {
      const items = ((await rpc('claim_push_batch')) ?? []) as Item[]
      if (items.length === 0) break
      const results = await Promise.allSettled(
        items.map((it) => sendPush({ endpoint: it.endpoint, p256dh: it.p256dh, auth: it.auth }, JSON.stringify(it.payload), vapid)),
      )
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.gone) gone.push(r.value.endpoint)
          else if (r.value.status < 300) sent++
          else console.warn('push', r.value.status, new URL(r.value.endpoint).host)
        } else {
          console.warn('push', String(r.reason))
        }
      }
      if (items.length < 50) break
    }
    if (gone.length > 0) await rpc('drop_push_subscriptions', { p_endpoints: [...new Set(gone)] })
    return json(200, { sent, dropped: gone.length })
  }
}
