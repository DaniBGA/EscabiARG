import { useEffect, useRef, useState } from 'react'
import { colorFor, initials } from '../../lib/avatarStyle'
import { BURN_TIMES, startBurnFx } from './burnFx'
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

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const vibrate = (pattern: number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // no pasa nada
  }
}

/**
 * Pantalla completa cuando alguien quema a otro: sube el fuego, cae la foto del quemado
 * con el sello, una llama trepa hasta la foto y la quema hasta dejarla en cenizas.
 */
export default function BurnOverlay({ info, onClose }: { info: BurnInfo; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const onCloseRef = useRef(onClose)
  const backRef = useRef<HTMLCanvasElement>(null)
  const frontRef = useRef<HTMLCanvasElement>(null)
  const cardRef = useRef<HTMLCanvasElement>(null)
  const stampRef = useRef<HTMLSpanElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    vibrate([70, 40, 140])
    const reduced = reducedMotion()
    const stop =
      backRef.current && frontRef.current && cardRef.current
        ? startBurnFx({
            back: backRef.current,
            front: frontRef.current,
            card: cardRef.current,
            stamp: stampRef.current,
            cardWrap: wrapRef.current,
            info: { color: colorFor(info.victimId), initials: initials(info.victimName), name: info.victimName },
            reducedMotion: reduced,
            onIgnite: () => vibrate([40, 30, 40, 30, 220]),
          })
        : () => undefined
    const showMs = (reduced ? 3.5 : BURN_TIMES.total) * 1000
    const leave = window.setTimeout(() => setLeaving(true), showMs)
    const done = window.setTimeout(() => onCloseRef.current(), showMs + 450)
    return () => {
      stop()
      window.clearTimeout(leave)
      window.clearTimeout(done)
    }
  }, [info.victimId, info.victimName])

  const close = () => {
    setLeaving(true)
    window.setTimeout(() => onCloseRef.current(), 300)
  }

  return (
    <div className={`burn-overlay${leaving ? ' is-leaving' : ''}`} role="alertdialog" aria-label={info.title} onClick={close}>
      <span className="bf-glow" aria-hidden="true" />
      <canvas ref={backRef} className="bf-canvas" aria-hidden="true" />
      <span className="bf-flash" aria-hidden="true" />

      <div className="bf-content">
        <div className="bf-card" ref={wrapRef}>
          <canvas ref={cardRef} className="bf-card-canvas" role="img" aria-label={`Foto de ${info.victimName}`} />
          <span className="bf-stamp" ref={stampRef} aria-hidden="true">¡Quemado!</span>
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

      <canvas ref={frontRef} className="bf-canvas bf-canvas--front" aria-hidden="true" />
    </div>
  )
}
