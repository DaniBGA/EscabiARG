import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/authContext'
import { isDemoEnabled, isGoogleAuthEnabled, isSupabaseConfigured, supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import './LoginOptions.css'

type View = 'options' | 'email'
type EmailMode = 'signin' | 'signup'

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

const MailIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)

export default function LoginOptions() {
  const [view, setView] = useState<View>('options')
  const [mode, setMode] = useState<EmailMode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const { enterDemo } = useAuth()
  const [error, setError] = useState<string | null>(
    isSupabaseConfigured || isDemoEnabled ? null : friendlyError('SUPABASE_NOT_CONFIGURED'),
  )
  const [notice, setNotice] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    if (!supabase) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const signInWithGoogle = () =>
    run(async () => {
      const { error } = await supabase!.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
    })

  const signInAsGuest = () =>
    run(async () => {
      const { error } = await supabase!.auth.signInAnonymously({
        options: { data: { display_name: 'Invitado' } },
      })
      if (error) throw error
    })

  const submitEmail = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      if (mode === 'signin') {
        const { error } = await supabase!.auth.signInWithPassword({ email, password })
        if (error) throw error
        return
      }
      const { data, error } = await supabase!.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name.trim() },
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw error
      // Con "Confirm email" activado en Supabase no hay sesión hasta confirmar
      if (!data.session) {
        setNotice('¡Listo! Te mandamos un mail para confirmar la cuenta. Después entrá desde acá.')
        setMode('signin')
        setPassword('')
      }
    })
  }

  const disabled = busy || !isSupabaseConfigured

  return (
    <main className="login">
      <header className="login-header">
        <h1 className="login-logo">EscabiARG</h1>
        <p className="login-tagline">La app para tomar con amigos</p>
      </header>

      <section className="login-card" aria-labelledby="login-title">
        {view === 'options' ? (
          <>
            <h2 id="login-title" className="login-title">¿Arrancamos la previa?</h2>
            <p className="login-subtitle">Elegí cómo querés entrar</p>

            <div className="login-buttons">
              {isDemoEnabled && !isSupabaseConfigured && (
                <>
                  <button type="button" className="login-btn login-btn--email" onClick={enterDemo}>
                    🍺 Probar sin cuenta (demo)
                  </button>
                  <p className="login-hint">
                    El login con cuenta todavía no está configurado. Mientras tanto, la demo te deja
                    recorrer toda la app con datos de prueba.
                  </p>
                </>
              )}
              {isGoogleAuthEnabled && (
                <button type="button" className="login-btn login-btn--google" onClick={signInWithGoogle} disabled={disabled}>
                  <GoogleIcon />
                  Continuar con Google
                </button>
              )}
              <button type="button" className="login-btn login-btn--email" onClick={() => setView('email')} disabled={!isSupabaseConfigured}>
                <MailIcon />
                Continuar con email
              </button>

              <div className="login-divider"><span>o</span></div>

              <button type="button" className="login-btn login-btn--guest" onClick={signInAsGuest} disabled={disabled}>
                {busy ? 'Entrando…' : 'Entrar como invitado'}
              </button>

              {isDemoEnabled && isSupabaseConfigured && (
                <button type="button" className="login-btn login-btn--demo" onClick={enterDemo}>
                  🍺 Probar sin cuenta (demo)
                </button>
              )}
            </div>
          </>
        ) : (
          <form className="login-form" onSubmit={submitEmail}>
            <h2 id="login-title" className="login-title">
              {mode === 'signin' ? 'Entrá con tu email' : 'Creá tu cuenta'}
            </h2>

            {mode === 'signup' && (
              <label className="field">
                <span>¿Cómo te dicen?</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: El Colo"
                  maxLength={40}
                  autoComplete="nickname"
                  required
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vos@mail.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
              />
            </label>

            <button type="submit" className="login-btn login-btn--email" disabled={disabled}>
              {busy ? 'Un segundo…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
            </button>

            <button
              type="button"
              className="login-link"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
              }}
            >
              {mode === 'signin' ? '¿No tenés cuenta? Creala acá' : '¿Ya tenés cuenta? Entrá'}
            </button>
            <button
              type="button"
              className="login-link login-link--muted"
              onClick={() => {
                setView('options')
                setError(null)
                setNotice(null)
              }}
            >
              ← Volver
            </button>
          </form>
        )}

        {error && (
          <p className="login-notice login-notice--error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="login-notice" role="status">
            {notice}
          </p>
        )}
      </section>

      <p className="login-legal">+18 · Tomá con moderación. Si manejás, no tomes.</p>
    </main>
  )
}
