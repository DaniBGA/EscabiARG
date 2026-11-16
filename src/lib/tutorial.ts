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
