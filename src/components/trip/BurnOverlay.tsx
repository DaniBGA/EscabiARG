import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '../Avatar'
import './BurnOverlay.css'

export type BurnInfo = {
  /** Cartel grande, ej: "¡Quemaste a Beto!" */
  title: string
  /** Qué estaba tomando, ej: "💧 Vaso de agua" */
  drink: string
  /** Puntos que le restan si se valida */
  points: number
  victimId: string
  victimName: string
  /** Quién lo quemó ("vos" si fuiste vos) */
  byName: string
}

const SHOW_MS = 4600

/** Número pseudoaleatorio estable (así las brasas no cambian en cada render) */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Pantalla completa cuando alguien quema a otro: llamas, brasas, humo y la foto chamuscándose */
export default function BurnOverlay({ info, onClose }: { info: BurnInfo; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    // Un sacudón en el celular (donde se puede)
    try {
      navigator.vibrate?.([70, 40, 140])
    } catch {
      // no pasa nada
    }
    const leave = window.setTimeout(() => setLeaving(true), SHOW_MS)
    const done = window.setTimeout(() => onCloseRef.current(), SHOW_MS + 450)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(done)
    }
  }, [])

  const close = () => {
    setLeaving(true)
    window.setTimeout(() => onCloseRef.current(), 300)
  }

  const embers = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        left: `${(rand(i, 1) * 100).toFixed(1)}%`,
        size: `${(3 + rand(i, 2) * 5).toFixed(1)}px`,
        delay: `${(rand(i, 3) * 2.4).toFixed(2)}s`,
        duration: `${(1.8 + rand(i, 4) * 1.8).toFixed(2)}s`,
        drift: `${((rand(i, 5) - 0.5) * 120).toFixed(0)}px`,
      })),
    [],
  )

  const flames = (layer: 'back' | 'mid' | 'front', count: number) =>
    Array.from({ length: count }, (_, i) => (
      <span
        key={i}
        className="bf-flame"
        style={
          {
            left: `${((i / (count - 1)) * 110 - 5).toFixed(1)}%`,
            '--h': `${(layer === 'back' ? 52 : layer === 'mid' ? 40 : 28) + rand(i, layer.length) * 14}vh`,
            animationDelay: `${(-rand(i, layer.length + 7) * 1.2).toFixed(2)}s`,
            animationDuration: `${(0.7 + rand(i, layer.length + 3) * 0.6).toFixed(2)}s`,
          } as React.CSSProperties
        }
      />
    ))

  return (
    <div className={`burn-overlay${leaving ? ' is-leaving' : ''}`} role="alertdialog" aria-label={info.title} onClick={close}>
      <span className="bf-flash" aria-hidden="true" />
      <span className="bf-glow" aria-hidden="true" />

      <div className="bf-smoke" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{ left: `${10 + i * 20}%`, animationDelay: `${0.6 + i * 0.35}s` }} />
        ))}
      </div>

      <div className="bf-wall bf-wall--back" aria-hidden="true">{flames('back', 8)}</div>
      <div className="bf-wall bf-wall--mid" aria-hidden="true">{flames('mid', 10)}</div>

      <div className="bf-embers" aria-hidden="true">
        {embers.map((e, i) => (
          <span
            key={i}
            style={
              {
                left: e.left,
                width: e.size,
                height: e.size,
                animationDelay: e.delay,
                animationDuration: e.duration,
                '--drift': e.drift,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="bf-content">
        <div className="bf-card">
          <span className="bf-card-photo">
            <Avatar id={info.victimId} name={info.victimName} size={116} />
            <span className="bf-char" aria-hidden="true" />
          </span>
          <span className="bf-card-name">{info.victimName}</span>
          <span className="bf-card-flames" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="bf-stamp">¡Quemado!</span>
        </div>

        <p className="bf-sign">{info.title}</p>
        <p className="bf-sub">
          Lo agarraron tomando <strong>{info.drink}</strong>
        </p>
        <p className="bf-points">
          <span>{info.points}</span> si la mayoría lo valida
        </p>
        <p className="bf-hint">Tocá para cerrar</p>
      </div>

      <div className="bf-wall bf-wall--front" aria-hidden="true">{flames('front', 12)}</div>
    </div>
  )
}
