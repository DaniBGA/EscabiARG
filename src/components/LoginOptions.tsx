import { useState } from 'react'
import './LoginOptions.css'

export type LoginMethod = 'google' | 'email' | 'guest'

type Props = {
  onSelect?: (method: LoginMethod) => void
}

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

export default function LoginOptions({ onSelect }: Props) {
  const [notice, setNotice] = useState<string | null>(null)

  const handle = (method: LoginMethod) => {
    onSelect?.(method)
    // TODO: conectar con el proveedor de autenticación (próxima etapa)
    setNotice('¡Próximamente! Estamos terminando de enfriar esta opción 🍻')
  }

  return (
    <main className="login">
      <header className="login-header">
        <h1 className="login-logo">EscabiARG</h1>
        <p className="login-tagline">La app para tomar con amigos</p>
      </header>

      <section className="login-card" aria-labelledby="login-title">
        <h2 id="login-title" className="login-title">¿Arrancamos la previa?</h2>
        <p className="login-subtitle">Elegí cómo querés entrar</p>

        <div className="login-buttons">
          <button type="button" className="login-btn login-btn--google" onClick={() => handle('google')}>
            <GoogleIcon />
            Continuar con Google
          </button>
          <button type="button" className="login-btn login-btn--email" onClick={() => handle('email')}>
            <MailIcon />
            Continuar con email
          </button>

          <div className="login-divider"><span>o</span></div>

          <button type="button" className="login-btn login-btn--guest" onClick={() => handle('guest')}>
            Entrar como invitado
          </button>
        </div>

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
