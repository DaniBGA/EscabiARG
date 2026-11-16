/* EscabiARG: service worker de notificaciones (no guarda nada en caché) */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const ICON = '/icons/icon-192.png'
const BADGE = '/icons/badge-96.png'

async function show(data) {
  const tag = data.tag || 'escabiarg'
  // Si ya hay uno igual de hace poco se actualiza sin volver a sonar
  const existing = await self.registration.getNotifications({ tag })
  const recent = existing.some((n) => Date.now() - ((n.data && n.data.at) || 0) < 90000)
  return self.registration.showNotification(data.title || 'EscabiARG', {
    body: data.body || '',
    tag,
    renotify: existing.length > 0 && !recent,
    icon: ICON,
    badge: BADGE,
    lang: 'es-AR',
    vibrate: [90, 40, 90],
    timestamp: Date.now(),
    data: { url: data.url || '', at: Date.now() },
  })
}

async function appIsVisible() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return windows.some((w) => w.visibilityState === 'visible')
}

// Web Push: llega aunque el navegador esté cerrado o el celular bloqueado
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    (async () => {
      // Con la app a la vista no hace falta: ya se ve todo en vivo
      if (await appIsVisible()) return
      await show(data)
    })(),
  )
})

// Avisos que manda la propia app (cuando está en segundo plano)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'show') event.waitUntil(show(event.data.data || {}))
})

// Tocar el aviso abre la app en ese viaje
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const hash = (event.notification.data && event.notification.data.url) || ''
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          w.postMessage({ type: 'open', url: hash })
          return w.focus()
        }
      }
      return self.clients.openWindow(new URL('/' + hash, self.location.origin).href)
    })(),
  )
})
