const MESSAGES: Record<string, string> = {
  SUPABASE_NOT_CONFIGURED: 'Falta configurar Supabase (ver README).',
  NOT_AUTHENTICATED: 'Tu sesión expiró. Volvé a entrar.',
  FRIEND_CODE_NOT_FOUND: 'No encontramos a nadie con ese código.',
  FRIEND_IS_SELF: 'Ese es tu propio código 😅',
  ALREADY_FRIENDS: 'Ya son amigos.',
  MEMBER_NOT_FRIEND: 'Solo podés invitar a tus amigos.',
  TRIP_NAME_REQUIRED: 'Ponele un nombre al viaje.',
  NOT_TRIP_MEMBER: 'No sos parte de este viaje.',
  DRINK_NOT_FOUND: 'Ese trago ya no está en la carta.',
  PHOTO_REQUIRED: 'La foto no es válida: sacá una nueva en el momento.',
  PHOTO_TOO_OLD: 'Esa foto no es de ahora. Sacá una nueva con la cámara.',
  PHOTO_INVALID: 'No pudimos leer la foto. Probá de nuevo.',
  INVALID_DIFFICULTY: 'Elegí una dificultad válida.',
  MISSION_ALREADY_CHOSEN: 'Ya elegiste tu misión de hoy.',
  MISSION_NOT_FOUND: 'No tenés misión para hoy. Elegí una dificultad.',
  MISSION_ALREADY_DONE: 'Ya cumpliste la misión de hoy.',
  QUIEBRE_PHOTOS_REQUIRED: 'Subí entre 1 y 3 fotos nuevas de la quebrada.',
  DAY_NOT_FINISHED: 'La jornada todavía no terminó.',
  NOT_DAY_WINNER: 'Solo el ganador de la jornada puede girar la ruleta.',
  ALREADY_SPUN: 'Ya giraste la ruleta de esa jornada.',
  CARD_NOT_AVAILABLE: 'Ese comodín ya se usó.',
  TARGET_REQUIRED: 'Elegí a quién robarle.',
}

const AUTH_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/already registered|already been registered/i, 'Ya existe una cuenta con ese email.'],
  [/email not confirmed/i, 'Confirmá tu email antes de entrar (revisá tu casilla).'],
  [/password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
  [/anonymous sign-ins are disabled/i, 'El modo invitado no está habilitado todavía.'],
  [/provider is not enabled/i, 'Este método de ingreso no está habilitado todavía.'],
  [/rate limit/i, 'Demasiados intentos. Esperá un ratito y probá de nuevo.'],
  [/failed to fetch|network/i, 'No hay conexión. Revisá tu internet.'],
  [/maximum allowed size|payload too large/i, 'La foto es muy pesada.'],
  [/row-level security|permission denied/i, 'No tenés permiso para hacer eso.'],
]

/** Traduce errores de Supabase / RPC a mensajes para el usuario */
export function friendlyError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err)

  if (MESSAGES[message]) return MESSAGES[message]
  for (const [pattern, text] of AUTH_MESSAGES) {
    if (pattern.test(message)) return text
  }
  return 'Algo salió mal. Probá de nuevo.'
}
