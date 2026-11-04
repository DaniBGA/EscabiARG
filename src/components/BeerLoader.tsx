import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import './BeerLoader.css'

type Props = {
  /** Duración del llenado en ms */
  duration?: number
  /** Se llama una vez que la pantalla quedó llena de cerveza */
  onFilled?: () => void
  /** Contenido que se muestra encima de la cerveza (ej: opciones de logueo) */
  children?: ReactNode
}

const BUBBLE_COUNT = 28

// Burbujas con posiciones/tiempos aleatorios (se generan una sola vez)
const BUBBLES = Array.from({ length: BUBBLE_COUNT }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  size: 4 + Math.random() * 10,
  duration: 3 + Math.random() * 5,
  delay: -Math.random() * 8,
  drift: (Math.random() - 0.5) * 30,
}))

/** Curva de llenado: arranca rápido (chorro fuerte) y frena al final */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function BeerLoader({ duration = 3600, onFilled, children }: Props) {
  const liquidRef = useRef<HTMLDivElement>(null)
  const percentRef = useRef<HTMLSpanElement>(null)
  const skipRef = useRef(false)
  const onFilledRef = useRef(onFilled)
  const [filled, setFilled] = useState(false)

  useEffect(() => {
    onFilledRef.current = onFilled
  }, [onFilled])

  useEffect(() => {
    const liquid = liquidRef.current
    if (!liquid) return

    const render = (p: number) => {
      liquid.style.transform = `translate3d(0, ${(1 - p) * 100}%, 0)`
      if (percentRef.current) percentRef.current.textContent = `${Math.round(p * 100)}%`
    }

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      render(1)
      setFilled(true)
      onFilledRef.current?.()
    }

    if (prefersReducedMotion()) {
      finish()
      return
    }

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      if (skipRef.current || t >= 1) {
        finish()
        return
      }
      render(easeOutCubic(t))
      raf = requestAnimationFrame(tick)
    }
    render(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration])

  const skip = () => {
    skipRef.current = true
  }

  return (
    <div
      className={`beer-scene${filled ? ' is-filled' : ''}`}
      onClick={filled ? undefined : skip}
    >
      {/* Chorro de cerveza que cae desde arriba */}
      <div className="pour-stream" aria-hidden="true" />

      <div className="liquid" ref={liquidRef} aria-hidden="true">
        <div className="foam">
          <div className="foam-lumps" />
          <div className="foam-lumps foam-lumps--back" />
          <span className="foam-dot" style={{ left: '12%', top: '45%' }} />
          <span className="foam-dot" style={{ left: '38%', top: '62%' }} />
          <span className="foam-dot" style={{ left: '64%', top: '40%' }} />
          <span className="foam-dot" style={{ left: '86%', top: '58%' }} />
        </div>
        <div className="beer">
          <div className="beer-shine" />
          {BUBBLES.map((b) => (
            <span
              key={b.id}
              className="bubble"
              style={
                {
                  left: `${b.left}%`,
                  width: b.size,
                  height: b.size,
                  animationDuration: `${b.duration}s`,
                  animationDelay: `${b.delay}s`,
                  '--drift': `${b.drift}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>

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
