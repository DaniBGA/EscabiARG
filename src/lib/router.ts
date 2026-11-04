import { useEffect, useState } from 'react'

/** Navegación mínima con el hash (#/viaje/123): funciona en Netlify sin configuración extra */
export function useHashRoute() {
  const [path, setPath] = useState(() => window.location.hash.slice(1))
  useEffect(() => {
    const onChange = () => setPath(window.location.hash.slice(1))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}

export const tripPath = (id: string) => `#/viaje/${id}`

export function matchTrip(path: string) {
  const m = /^\/viaje\/([^/]+)$/.exec(path)
  return m ? decodeURIComponent(m[1]) : null
}

// Si entraste al viaje desde el inicio, "volver" usa el historial (así el botón atrás queda prolijo)
let cameFromHome = false

export function markCameFromHome() {
  cameFromHome = true
}

export function goHome() {
  if (cameFromHome) {
    cameFromHome = false
    window.history.back()
    return
  }
  window.location.hash = ''
}
