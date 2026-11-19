/**
 * Módulos de un viaje o previa. Lo fundamental está siempre; los extras se eligen al
 * crearlo (y el organizador los puede cambiar en Reglas). Ver migración
 * 20261123000000_modulos_y_fechas.sql: la base rechaza lo que está apagado.
 */
export type Feature = 'missions' | 'duels' | 'casino' | 'chef' | 'boliche'

export const ALL_FEATURES: Feature[] = ['missions', 'duels', 'casino', 'chef', 'boliche']

/** Siempre están (son la base del juego) */
export const CORE_PARTS = [
  { emoji: '🍺', name: 'Cargar trago', desc: 'Sacás foto de lo que tomás y suma puntos cuando lo validan.' },
  { emoji: '🔥', name: 'Quemar', desc: 'Agarrás a alguien tomando agua o algo que resta: le resta puntos.' },
  { emoji: '😵', name: 'Alguien quebró', desc: 'Si alguien quiebra, se reporta con foto y pierde puntos.' },
  { emoji: '🚨', name: 'Infracciones', desc: 'Romper una regla del grupo se paga con una prenda.' },
] as const

/** Extras que se pueden prender o apagar */
export const OPTIONAL_FEATURES: { key: Feature; emoji: string; name: string; desc: string }[] = [
  { key: 'missions', emoji: '🎯', name: 'Misiones del día', desc: 'Cada uno elige un reto por día (fácil, intermedio o extremo).' },
  { key: 'duels', emoji: '⚔️', name: 'Duelos', desc: 'Fondo blanco, shots o baile: el que gana se lleva los puntos.' },
  { key: 'casino', emoji: '🎰', name: 'Casino', desc: 'Salen al casino y el último que queda con plata gana.' },
  { key: 'chef', emoji: '🍳', name: '¿Quién cocina? / ¿Quién prepara el trago?', desc: 'Una ruleta elige a quién le toca, y los demás votan si salió bueno.' },
  { key: 'boliche', emoji: '🪩', name: 'Hora boliche', desc: 'El organizador la prende y todo pasa a ser de boliche.' },
]

/** Viajes viejos (sin la columna) tienen todo activado */
export function hasFeature(trip: { features?: Feature[] | null }, feature: Feature) {
  return !trip.features || trip.features.includes(feature)
}

const SHORT_DATE = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
const DAY_ONLY = new Intl.DateTimeFormat('es-AR', { day: 'numeric' })

const asDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "4 nov" o "4 – 7 nov" (o "30 nov – 2 dic") */
export function formatDateRange(start: string, end?: string | null) {
  const a = asDate(start)
  if (!end || end === start) return SHORT_DATE.format(a).replace('.', '')
  const b = asDate(end)
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${DAY_ONLY.format(a)} – ${SHORT_DATE.format(b).replace('.', '')}`
  }
  return `${SHORT_DATE.format(a).replace('.', '')} – ${SHORT_DATE.format(b).replace('.', '')}`
}
