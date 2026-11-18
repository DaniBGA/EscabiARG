import { useEffect, useState, type CSSProperties } from 'react'
import { LEFT_HAND, LETTERS, RAYS, RIGHT_HAND, type Box } from './logoPieces'
import './LogoAnimation.css'

type Props = {
  /** lg: pantalla de carga · md: cargas dentro de la app */
  size?: 'lg' | 'md'
  className?: string
}

// Del logo original se usa la franja con dibujo (arriba y abajo sobra lugar)
const TOP = 4
const SPAN = 82

const place = (b: Box): CSSProperties => ({
  left: `${b.x}%`,
  top: `${((b.y - TOP) / SPAN) * 100}%`,
  width: `${b.w}%`,
  height: `${(b.h / SPAN) * 100}%`,
})

const PIECES = 3 + LETTERS.length
/** Si alguna imagen tarda, la animación arranca igual */
const START_ANYWAY_MS = 1500

/**
 * El logo animado: se escribe "Escabiarg" letra por letra, entran las dos manos
 * con los chops y brindan una vez (después queda el logo armado).
 */
export default function LogoAnimation({ size = 'lg', className = '' }: Props) {
  const [loaded, setLoaded] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const ready = timedOut || loaded >= PIECES
  const onLoad = () => setLoaded((n) => n + 1)

  useEffect(() => {
    const id = window.setTimeout(() => setTimedOut(true), START_ANYWAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div
      className={`logo-anim logo-anim--${size}${ready ? ' is-ready' : ''} ${className}`.trim()}
      role="img"
      aria-label="EscabiARG"
    >
      <img className="la-piece la-rays" src={RAYS.src} alt="" style={place(RAYS.box)} onLoad={onLoad} onError={onLoad} />
      <img className="la-piece la-hand la-hand--l" src={LEFT_HAND.src} alt="" style={place(LEFT_HAND.box)} onLoad={onLoad} onError={onLoad} />
      <img className="la-piece la-hand la-hand--r" src={RIGHT_HAND.src} alt="" style={place(RIGHT_HAND.box)} onLoad={onLoad} onError={onLoad} />
      {/* Gotitas de espuma que saltan en el brindis */}
      <span className="la-splash" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </span>
      {LETTERS.map((l, i) => (
        <img
          key={i}
          className="la-piece la-letter"
          src={l.src}
          alt=""
          style={{ ...place(l.box), animationDelay: `${0.1 + i * 0.1}s` }}
          onLoad={onLoad}
          onError={onLoad}
        />
      ))}
    </div>
  )
}
