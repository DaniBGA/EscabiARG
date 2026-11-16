import { useEffect, useRef, useState } from 'react'
import './BurnOverlay.css'

export type BurnInfo = {
  /** Cartel grande, ej: "¡Quemaste a Beto!" */
  title: string
  /** Qué estaba tomando, ej: "💧 Vaso de agua" */
  drink: string
  /** Puntos que le restan si se valida */
  points: number
}

const SHOW_MS = 3800

/** Pantalla completa con llamas cuando alguien quema a otro */
export default function BurnOverlay({ info, onClose }: { info: BurnInfo; onClose: () => void }) {
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
    <div className={`burn-overlay${leaving ? ' is-leaving' : ''}`} role="alertdialog" aria-label={info.title} onClick={close}>
      <div className="burn-flames" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`burn-flame burn-flame--${i}`} />
        ))}
      </div>
      <span className="burn-emoji" aria-hidden="true">🔥</span>
      <p className="burn-sign">{info.title}</p>
      <p className="burn-sub">
        Tomando {info.drink} · <strong>{info.points}</strong> si la mayoría lo valida
      </p>
      <p className="burn-hint">Tocá para cerrar</p>
    </div>
  )
}
