import type { RealtimeChannel } from '@supabase/supabase-js'
import { requireSupabase } from './supabase'

/** Lo que manda la base por cada cambio (ver migración 20261110000000_tiempo_real.sql) */
export type LiveChange = {
  /** Tabla que cambió */
  t: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  row: Record<string, unknown>
}

export type LiveListener = {
  onChange(change: LiveChange): void
  /** true cuando el canal está conectado y recibiendo; false si se cortó */
  onStatus?(live: boolean): void
}

type Topic = {
  channel: RealtimeChannel | null
  listeners: Set<LiveListener>
  live: boolean
  closeTimer: number | undefined
}

/** Un canal sin nadie escuchando queda abierto un rato por si se vuelve enseguida */
const LINGER_MS = 8_000

/**
 * Supabase reutiliza el mismo canal si dos pantallas piden el mismo tema y al
 * cerrarlo se lo cierra a las dos. Por eso acá se comparte un canal por tema.
 */
const topics = new Map<string, Topic>()

function open(name: string, topic: Topic) {
  const sb = requireSupabase()
  // Los canales privados necesitan el token del usuario antes de entrar
  sb.realtime
    .setAuth()
    .catch(() => undefined)
    .then(() => {
      if (topics.get(name) !== topic) return
      const channel = sb.channel(name, { config: { private: true } })
      topic.channel = channel
      channel
        .on('broadcast', { event: 'change' }, (message) => {
          const change = message.payload as LiveChange | undefined
          if (!change || typeof change.t !== 'string') return
          for (const l of topic.listeners) l.onChange(change)
        })
        .subscribe((status) => {
          const live = status === 'SUBSCRIBED'
          // Cada vez que (re)conecta se avisa: puede haberse perdido algo mientras tanto
          if (!live && !topic.live) return
          topic.live = live
          for (const l of topic.listeners) l.onStatus?.(live)
        })
    })
}

function close(name: string, topic: Topic) {
  if (topics.get(name) !== topic || topic.listeners.size > 0) return
  topics.delete(name)
  if (topic.channel) void requireSupabase().removeChannel(topic.channel)
}

/** Escucha un canal privado ("trip:<id>" o "user:<id>"). Devuelve cómo dejar de escuchar. */
export function listen(name: string, listener: LiveListener): () => void {
  let topic = topics.get(name)
  if (!topic) {
    topic = { channel: null, listeners: new Set(), live: false, closeTimer: undefined }
    topics.set(name, topic)
    open(name, topic)
  }
  window.clearTimeout(topic.closeTimer)
  topic.listeners.add(listener)
  if (topic.live) listener.onStatus?.(true)

  const current = topic
  return () => {
    current.listeners.delete(listener)
    if (current.listeners.size > 0) return
    window.clearTimeout(current.closeTimer)
    current.closeTimer = window.setTimeout(() => close(name, current), LINGER_MS)
  }
}
