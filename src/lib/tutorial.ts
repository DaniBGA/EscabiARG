/** Si ya vio (o salteó) el tutorial de la primera vez, por persona y celular */

const key = (userId: string) => `escabiarg:tutorial:${userId}`

/** ¿Ya vio (o salteó) el tutorial en este celular? */
export function tutorialSeen(userId: string) {
  try {
    return localStorage.getItem(key(userId)) === '1'
  } catch {
    return true
  }
}

export function markTutorialSeen(userId: string) {
  try {
    localStorage.setItem(key(userId), '1')
  } catch {
    // sin localStorage se vuelve a mostrar la próxima vez
  }
}

const tourKey = (userId: string) => `escabiarg:home-tour:${userId}`

/** Al terminar la sala de práctica, en el inicio se muestra el recorrido */
export function markHomeTourPending(userId: string) {
  try {
    sessionStorage.setItem(tourKey(userId), '1')
  } catch {
    // sin recorrido, no pasa nada
  }
}

/** ¿Hay que mostrar el recorrido del inicio? */
export function homeTourPending(userId: string) {
  try {
    return sessionStorage.getItem(tourKey(userId)) === '1'
  } catch {
    return false
  }
}

export function clearHomeTour(userId: string) {
  try {
    sessionStorage.removeItem(tourKey(userId))
  } catch {
    // nada
  }
}
