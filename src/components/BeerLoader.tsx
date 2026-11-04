import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BeerRenderer } from './beer/BeerRenderer'
import './BeerLoader.css'

type Props = {
  /** Se llama una vez que la pantalla quedó llena de cerveza */
  onFilled?: () => void
  /** Arranca ya lleno, sin animación (ej: al cerrar sesión) */
  instant?: boolean
  /** Contenido que se muestra encima de la cerveza (ej: opciones de logueo) */
  children?: ReactNode
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function BeerLoader({ instant = false, onFilled, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<BeerRenderer | null>(null)
  const percentRef = useRef<HTMLSpanElement>(null)
  const onFilledRef = useRef(onFilled)
  const instantRef = useRef(instant)
  const [filled, setFilled] = useState(false)

  useEffect(() => {
    onFilledRef.current = onFilled
  }, [onFilled])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new BeerRenderer(canvas, {
      instant: instantRef.current,
      reducedMotion: prefersReducedMotion(),
      onProgress: (p) => {
        if (percentRef.current) percentRef.current.textContent = `${Math.round(p * 100)}%`
      },
      onFilled: () => {
        setFilled(true)
        onFilledRef.current?.()
      },
    })
    rendererRef.current = renderer
    return () => {
      renderer.destroy()
      rendererRef.current = null
    }
  }, [])

  return (
    <div
      className={`beer-scene${filled ? ' is-filled' : ''}`}
      onClick={filled ? undefined : () => rendererRef.current?.skip()}
    >
      <canvas ref={canvasRef} className="beer-canvas" aria-hidden="true" />

      {!filled && (
        <div className="loader-status" role="status" aria-live="polite">
          <span className="loader-title">EscabiARG</span>
          <span className="loader-text">
            Sirviendo… <span ref={percentRef}>0%</span>
          </span>
          <span className="loader-hint">Tocá para saltear</span>
        </div>
      )}

      {filled && <div className="beer-overlay">{children}</div>}
    </div>
  )
}
