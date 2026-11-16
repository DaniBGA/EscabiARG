import type { Api } from './api'

/**
 * Notificaciones del navegador.
 *  - Avisos locales: con la app abierta en segundo plano (otra pestaña, otra app).
 *  - Web Push: aunque el navegador esté cerrado o el celular bloqueado
 *    (si el servidor tiene configurada la función "push").
 */

export type NotifSupport = 'ok' | 'ios-install' | 'unsupported'
export type LocalNotice = { title: string; body: string; tag: string; url: string }

const isIos = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function notifSupport(): NotifSupport {
  const ok = 'Notification' in window && 'serviceWorker' in navigator && window.isSecureContext
  if (ok) return 'ok'
  // En iPhone solo funcionan si la app está agregada a la pantalla de inicio
  return isIos() && !isStandalone() ? 'ios-install' : 'unsupported'
}

export function notifPermission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

const wantKey = (userId: string) => `escabiarg:notif:${userId}`
const askedKey = (userId: string) => `escabiarg:notif-asked:${userId}`

function readLocal(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // modo privado: se pregunta de nuevo la próxima vez
  }
}

/** ¿Las activó y el navegador lo permite? */
export function notifEnabled(userId: string) {
  return notifPermission() === 'granted' && readLocal(wantKey(userId)) === '1'
}

/** ¿Ya le ofrecimos activarlas (para no insistir)? */
export function notifAsked(userId: string) {
  return readLocal(askedKey(userId)) === '1'
}

export function markNotifAsked(userId: string) {
  writeLocal(askedKey(userId), '1')
}

// ---------- Service worker ----------

let registration: Promise<ServiceWorkerRegistration | null> | null = null

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return Promise.resolve(null)
  registration ??= navigator.serviceWorker
    .register('/sw.js')
    .then(() => navigator.serviceWorker.ready)
    .catch(() => null)
  return registration
}

/** Tocar un aviso abre el viaje (lo manda el service worker) */
export function listenNotificationClicks(open: (hash: string) => void) {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (e) => {
    const msg = e.data as { type?: string; url?: string } | null
    if (msg?.type === 'open' && typeof msg.url === 'string') open(msg.url)
  })
}

// ---------- Web Push ----------

let pushActive = false

export function isPushActive() {
  return pushActive
}

function keyBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

/** Suscribe este navegador a Web Push y lo guarda en el servidor. false = no disponible */
export async function syncPush(api: Api) {
  pushActive = false
  const reg = await registerServiceWorker()
  if (!reg || !('pushManager' in reg)) return false
  const key = await api.pushPublicKey()
  if (!key) return false
  const wanted = keyBytes(key)
  let sub = await reg.pushManager.getSubscription()
  // Si cambiaron las claves del servidor, hay que suscribirse de nuevo
  if (sub && !sameKey(sub.options.applicationServerKey, wanted)) {
    await sub.unsubscribe().catch(() => undefined)
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted })
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false
  await api.savePushSubscription(json.endpoint, json.keys.p256dh, json.keys.auth)
  pushActive = true
  return true
}

export type EnableResult = { ok: true; push: boolean } | { ok: false; reason: 'denied' | 'dismissed' | 'unsupported' }

/** Pide permiso (tiene que ser al tocar un botón) y activa los avisos */
export async function enableNotifications(api: Api, userId: string): Promise<EnableResult> {
  markNotifAsked(userId)
  if (notifSupport() !== 'ok') return { ok: false, reason: 'unsupported' }
  await registerServiceWorker()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed' }
  writeLocal(wantKey(userId), '1')
  const push = await syncPush(api).catch(() => false)
  return { ok: true, push }
}

export async function disableNotifications(api: Api, userId: string) {
  writeLocal(wantKey(userId), '0')
  pushActive = false
  const reg = await registerServiceWorker()
  const sub = await reg?.pushManager?.getSubscription().catch(() => null)
  if (sub) {
    await api.deletePushSubscription(sub.endpoint).catch(() => undefined)
    await sub.unsubscribe().catch(() => undefined)
  }
}

/**
 * Al cerrar sesión: este celular deja de recibir los avisos de esa cuenta (si otra
 * persona entra después, no le llegan los tuyos). Tu preferencia queda guardada:
 * si volvés a entrar con la misma cuenta, se reactivan solas.
 */
export async function releasePush(api: Api) {
  pushActive = false
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined)
  const sub = await reg?.pushManager?.getSubscription().catch(() => null)
  if (!sub) return
  await api.deletePushSubscription(sub.endpoint).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

// ---------- Avisos locales ----------

export async function showNotice(notice: LocalNotice) {
  const reg = await registerServiceWorker()
  const worker = reg?.active ?? navigator.serviceWorker?.controller
  if (worker) {
    worker.postMessage({ type: 'show', data: notice })
    return
  }
  // Sin service worker (raro): notificación común
  new Notification(notice.title, { body: notice.body, tag: notice.tag, icon: '/icons/icon-192.png' })
}

/**
 * Llegó un aviso en vivo (por tu canal o por el de la sala, con la lista de a quiénes
 * les toca). Se muestra solo si la app está en segundo plano y no llega por Web Push.
 */
export function deliverNotice(row: Record<string, unknown>, userId: string) {
  const users = row.users
  if (Array.isArray(users) && !users.includes(userId)) return
  if (!notifEnabled(userId) || isPushActive() || document.visibilityState === 'visible') return
  void showNotice({
    title: String(row.title ?? 'EscabiARG'),
    body: String(row.body ?? ''),
    tag: String(row.tag ?? 'escabiarg'),
    url: String(row.url ?? ''),
  })
}

/** Aviso de prueba para ver que anda */
export function testNotice(name: string) {
  return showNotice({
    title: 'EscabiARG',
    body: `🍻 ¡Listo, ${name}! Así te vamos a avisar cuando pase algo en la sala.`,
    tag: 'prueba',
    url: '',
  })
}
