import { useEffect, useState } from 'react'
import { earlyAccessStatus, type EarlyAccessStatus } from '../lib/earlyAccess'
import { friendlyError } from '../lib/errors'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import './LoginOptions.css'

/** Cada cuánto se actualiza el contador mientras estás en esta pantalla */
const REFRESH_MS = 15_000

/**
 * Entrada del early access: un solo botón (entra como invitado) y el contador de
 * lugares. El cupo lo controla la base (supabase/early_access.sql): con el cupo
 * lleno no se puede crear ninguna cuenta más.
 */
export default function EarlyAccessLogin() {
  /** undefined = cargando · null = la base no tiene cupo configurado */
  const [status, setStatus] = useState<EarlyAccessStatus | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(isSupabaseConfigured ? null : friendlyError('SUPABASE_NOT_CONFIGURED'))

  useEffect(() => {
    let alive = true
    const load = () => earlyAccessStatus().then((s) => alive && setStatus(s))
    load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  const isFull = (s: EarlyAccessStatus | null | undefined) => Boolean(s && s.registered >= s.max)
  const full = isFull(status)

  const start = async () => {
    if (!supabase) return
    setBusy(true)
    setError(null)
    try {
      const before = await earlyAccessStatus()
      if (before) setStatus(before)
      if (isFull(before)) throw new Error('EARLY_ACCESS_FULL')
      const { error: signInError } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: 'Invitado' } },
      })
      if (signInError) {
        // Si justo se llenó mientras tocabas, la base lo rechaza
        const after = await earlyAccessStatus()
        if (after) setStatus(after)
        throw isFull(after) ? new Error('EARLY_ACCESS_FULL') : signInError
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const left = status ? Math.max(0, status.max - status.registered) : 0
  const pct = status ? Math.min(100, Math.round((status.registered / Math.max(1, status.max)) * 100)) : 0

  return (
    <main className="login">
      <header className="login-header">
        <h1 className="login-logo">EscabiARG</h1>
        <p className="login-tagline">La app para tomar con amigos</p>
        <p className="ea-badge">Early access</p>
      </header>

      <section className="login-card" aria-labelledby="login-title">
        <h2 id="login-title" className="login-title">¿Arrancamos la previa?</h2>
        <p className="login-subtitle">Sos de los primeros en probarla</p>

        <div className="login-buttons">
          <button
            type="button"
            className="login-btn login-btn--email"
            onClick={start}
            disabled={busy || full || !isSupabaseConfigured}
          >
            {busy ? 'Entrando…' : full ? 'Cupos completos' : 'Comenzá la previa'}
          </button>
        </div>

        {status !== null && (
          <div className={full ? 'ea-counter is-full' : 'ea-counter'} role="status" aria-live="polite">
            {status === undefined ? (
              <p className="ea-counter-text">Contando lugares…</p>
            ) : (
              <>
                <p className="ea-counter-head">
                  <strong>{status.registered}</strong> de {status.max} ya se sumaron
                </p>
                <div className="ea-bar" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="ea-counter-text">
                  {full
                    ? '¡Se llenó el early access! Gracias por querer sumarte.'
                    : left === 1
                      ? '¡Queda 1 solo lugar!'
                      : `Quedan ${left} lugares`}
                </p>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="login-notice login-notice--error" role="alert">
            {error}
          </p>
        )}
      </section>

      <p className="login-legal">+18 · Tomá con moderación. Si manejás, no tomes.</p>
    </main>
  )
}
