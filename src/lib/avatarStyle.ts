/** Color e iniciales de los avatares (se usan también para dibujarlos en canvas) */

const COLORS = ['#f2a71b', '#e0583f', '#5aa37a', '#5b8fcf', '#d9b23a', '#b07ad6', '#e98a3a']

/** Color de fondo del avatar (fijo por persona) */
export function colorFor(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

/** Iniciales que muestra el avatar */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]
  return letters.toUpperCase()
}
