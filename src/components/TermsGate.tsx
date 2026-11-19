import { useEffect, useState, type ReactNode } from 'react'
import { useApi, useAuth, type AppUser } from '../lib/authContext'
import { friendlyError } from '../lib/errors'
import { TERMS_VERSION } from '../lib/terms'
import TermsContent from './TermsContent'
import './TermsGate.css'
import AppLoading from './AppLoading'

type Status = { userId: string; accepted: boolean } | null

/**
 * Antes de entrar (al registrarse o como invitado) hay que aceptar los términos:
 * aparece un cartel de ¡PELIGRO! y después el texto para confirmar +18 y aceptar.
 */
export default function TermsGate({ user, children }: { user: AppUser; children: ReactNode }) {
  const api = useApi()
  const { signOut } = useAuth()
  const [status, setStatus] = useState<Status>(null)
  const [adult, setAdult] = useState(false)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .getTermsVersion(user.id)
      .then((v) => alive && setStatus({ userId: user.id, accepted: v >= TERMS_VERSION }))
      .catch(() => alive && setStatus({ userId: user.id, accepted: false }))
    return () => {
      alive = false
    }
  }, [api, user.id])

  const current = status?.userId === user.id ? status : null
  if (!current) {
    return (
      <div className="home home--center">
        <AppLoading text="Un segundo…" />
      </div>
    )
  }
  if (current.accepted) return <>{children}</>

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.acceptTerms(user.id, TERMS_VERSION)
      setStatus({ userId: user.id, accepted: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="terms-gate" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <span className="tg-siren" aria-hidden="true" />
      <div className="tg-tape tg-tape--top" aria-hidden="true">
        <span>PELIGRO · WARNING · PELIGRO · WARNING · PELIGRO · WARNING · PELIGRO · WARNING ·</span>
      </div>

      <div className="tg-hero" aria-hidden="true">
        <svg className="tg-triangle" viewBox="0 0 120 106">
          <path d="M60 6 L114 100 H6 Z" fill="#ffd21a" stroke="#16110c" strokeWidth="7" strokeLinejoin="round" />
          <rect x="54" y="34" width="12" height="38" rx="5" fill="#16110c" />
          <circle cx="60" cy="85" r="7" fill="#16110c" />
        </svg>
        <p className="tg-word">
          <span className="tg-word-es">¡PELIGRO!</span>
          <span className="tg-word-en">WARNING</span>
        </p>
        <span className="tg-badge">+18</span>
      </div>

      <section className="tg-card">
        <h2 id="terms-title" className="tg-title">Términos y condiciones</h2>
        <p className="tg-lead">
          Antes de entrar, leé esto: <strong>la responsabilidad por lo que hacés y consumís es tuya.</strong>
        </p>
        <div className="tg-scroll" tabIndex={0}>
          <TermsContent />
        </div>

        <label className="tg-check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>Tengo <strong>18 años o más</strong>.</span>
        </label>
        <label className="tg-check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            Leí y acepto los términos. Entiendo que <strong>la responsabilidad recae en mí</strong>, no en la app.
          </span>
        </label>

        {error && <p className="notice notice--error" role="alert">{error}</p>}

        <button type="button" className="btn btn--primary btn--block" disabled={busy || !adult || !agree} onClick={accept}>
          {busy ? 'Guardando…' : 'Acepto, entrar'}
        </button>
        <button type="button" className="tg-exit" onClick={signOut} disabled={busy}>
          No acepto (salir)
        </button>
      </section>

      <div className="tg-tape tg-tape--bottom" aria-hidden="true">
        <span>PELIGRO · WARNING · PELIGRO · WARNING · PELIGRO · WARNING · PELIGRO · WARNING ·</span>
      </div>
    </div>
  )
}
