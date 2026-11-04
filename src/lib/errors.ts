const MESSAGES: Record<string, string> = {
  SUPABASE_NOT_CONFIGURED: 'Falta configurar Supabase (ver README).',
  NOT_AUTHENTICATED: 'Tu sesión expiró. Volvé a entrar.',
  FRIEND_CODE_NOT_FOUND: 'No encontramos a nadie con ese código.',
  FRIEND_IS_SELF: 'Ese es tu propio código 😅',
  ALREADY_FRIENDS: 'Ya son amigos.',
  MEMBER_NOT_FRIEND: 'Solo podés invitar a tus amigos.',
  TRIP_NAME_REQUIRED: 'Ponele un nombre al viaje.',
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
