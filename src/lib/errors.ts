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
  EVENT_NOT_FOUND: 'Eso ya no existe.',
  EVENT_ALREADY_RESOLVED: 'Ya se decidió por mayoría.',
  CANNOT_VOTE_OWN: 'No podés votar lo tuyo 😏',
  CAMERA_DENIED: 'Necesitamos permiso para usar la cámara. Activalo en la configuración del navegador.',
  CAMERA_MISSING: 'No encontramos una cámara en este dispositivo.',
  CAMERA_INSECURE: 'La cámara solo funciona si la app está en https.',
  CAMERA_ERROR: 'No pudimos abrir la cámara. Cerrá otras apps que la estén usando y probá de nuevo.',
  MISSION_NOT_TODAY: 'Solo se pueden votar las misiones de hoy.',
  CANNOT_CHALLENGE_OWN: 'No podés votar en contra de tu propia misión.',
  CHALLENGE_EXISTS: 'Esa misión ya se votó.',
  CHALLENGE_NOT_FOUND: 'Esa votación ya no existe.',
  CHALLENGE_CLOSED: 'Esa votación ya cerró.',
  CANNOT_VOTE_OWN_MISSION: 'Es tu misión: esta vez te toca mirar.',
  MISSION_UNDER_VOTE: 'Están votando tu misión: esperá a que termine.',
  OPTION_INVALID: 'La misión tiene que tener entre 5 y 140 caracteres.',
  NEED_MORE_OPTIONS: 'Hacen falta al menos 2 opciones para votar.',
  VOTING_CLOSED: 'Se terminó el tiempo para votar.',
  CANNOT_VOTE_OWN_OPTION: 'No podés votar tu propia opción.',
  INVALID_KIND: 'Elegí si es comida o trago.',
  CHEF_SPIN_ACTIVE: 'Ya hay una ruleta en curso: terminen esa primero.',
  CHEF_SPIN_NOT_FOUND: 'Esa ruleta ya no existe.',
  CHEF_SPIN_CLOSED: 'Esa ruleta ya avanzó.',
  NOT_ALLOWED: 'Solo quien la arrancó o el organizador puede cancelarla.',
  INVALID_MINUTES: 'Elegí entre 5 minutos y 10 horas.',
  CASINO_ACTIVE: 'Ya hay un casino en curso.',
  CASINO_NOT_FOUND: 'Ese casino ya no existe.',
  CASINO_CLOSED: 'Ese casino ya cerró.',
  CASINO_STILL_RUNNING: 'Todavía no terminó el tiempo del casino.',
  CASINO_NOT_JOINED: 'No entraste a este casino.',
  CASINO_ALREADY_REPORTED: 'Ya cargaste tu resultado.',
  INVALID_AMOUNT: 'Poné un monto válido.',
  INFRACTION_NOT_FOUND: 'Esa infracción ya no está en la lista.',
  FORFEIT_NOT_FOUND: 'Esa prenda ya no existe.',
  FORFEIT_ALREADY_DONE: 'Esa prenda ya la cumpliste.',
  INVALID_OPPONENT: 'Elegí a alguien del viaje (que no seas vos).',
  INVALID_SECONDS: 'Elegí un tiempo válido.',
  DUEL_BUSY: 'Alguno de los dos ya tiene un duelo en curso.',
  DUEL_LIMIT_ME: 'Ya jugaste 3 duelos en esta jornada. ¡Descansá un rato!',
  DUEL_LIMIT_OPPONENT: 'Esa persona ya jugó 3 duelos en esta jornada.',
  DUEL_NOT_FOUND: 'Ese duelo ya no existe.',
  DUEL_CLOSED: 'Ese duelo ya terminó.',
  DUEL_ALREADY_DONE: 'Ya terminaste tu parte del duelo.',
  DUEL_FALSE_START: '¡Largada en falso! Esperá a que arranque.',
  DUEL_SHOTS_CAP: 'Llegaste al máximo de 3 shots.',
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
