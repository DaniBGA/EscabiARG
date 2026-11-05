import { useEffect, useRef, useState } from 'react'
import './BolicheOverlay.css'

type Props = {
  /** Quién la activó, ej: "Ana" (o "Vos") */
  by: string
  onClose: () => void
}

const SHOW_MS = 3800

/** Pantalla completa cuando arranca la Hora boliche: bola de espejos y luces */
export default function BolicheOverlay({ by, onClose }: Props) {
  const [leaving, setLeaving] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), SHOW_MS)
    const done = window.setTimeout(() => onCloseRef.current(), SHOW_MS + 350)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(done)
    }
  }, [])

  const close = () => {
    setLeaving(true)
    window.setTimeout(() => onCloseRef.current(), 250)
  }

  return (
    <div className={`boliche-overlay${leaving ? ' is-leaving' : ''}`} role="alertdialog" aria-label="¡Hora boliche!" onClick={close}>
      <div className="bo-beams" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`bo-beam bo-beam--${i}`} />
        ))}
      </div>
      <div className="bo-ball-wrap" aria-hidden="true">
        <span className="bo-string" />
        <span className="bo-ball" />
      </div>
      <p className="bo-sign">¡Hora boliche!</p>
      <p className="bo-sub">
        {by === 'Vos' ? 'La activaste vos' : `La activó ${by}`}: misiones, prendas y duelos de boliche
      </p>
      <p className="bo-hint">Tocá para cerrar</p>
    </div>
  )
}
