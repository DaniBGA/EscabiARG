import { useEffect, useRef, useState } from 'react'

type Props = {
  /** Jugadores en la ruleta (en orden) */
  players: { id: string; name: string }[]
  /** A quién le tiene que tocar */
  targetId: string | null
  /** Girar con animación (si no, aparece directo en el resultado) */
  animate: boolean
  onDone?: () => void
}

const COLORS = ['#f2a71b', '#f3e7c9', '#d6442c', '#3a8a5f', '#3567a0', '#d9b23a']
const DARK = new Set(['#d6442c', '#3a8a5f', '#3567a0'])
const SPIN_MS = 4200

const point = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  return [r * Math.sin(a), -r * Math.cos(a)]
}

/** Ruleta con los nombres de los jugadores */
export default function NameWheel({ players, targetId, animate, onDone }: Props) {
  const n = Math.max(players.length, 1)
  const seg = 360 / n
  const idx = Math.max(0, players.findIndex((p) => p.id === targetId))
  const final = 360 * 5 + (360 - (idx * seg + seg / 2))
  const [rotation, setRotation] = useState(animate ? 0 : final)
  // Guardamos el callback en una ref: si el padre se re-renderiza (refresco cada
  // pocos segundos) no queremos reiniciar el giro
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (!animate || !targetId) return
    const raf = requestAnimationFrame(() => setRotation(final))
    const t = window.setTimeout(() => onDoneRef.current?.(), SPIN_MS + 100)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [animate, targetId, final])

  return (
    <svg viewBox="-110 -110 220 220" className="wheel wheel--names" role="img" aria-label="Ruleta de jugadores">
      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: animate ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.1, 1)` : 'none',
        }}
      >
        {players.map((p, i) => {
          const [x1, y1] = point(i * seg, 100)
          const [x2, y2] = point((i + 1) * seg, 100)
          const label = p.name.length > 9 ? `${p.name.slice(0, 8)}…` : p.name
          return (
            <g key={p.id}>
              {n === 1 ? (
                <circle r="100" fill={COLORS[0]} stroke="#16110c" strokeWidth="1.5" />
              ) : (
                <path
                  d={`M0 0 L${x1} ${y1} A100 100 0 ${seg > 180 ? 1 : 0} 1 ${x2} ${y2} Z`}
                  fill={COLORS[i % COLORS.length]}
                  stroke="#16110c"
                  strokeWidth="1.5"
                />
              )}
              <text
                transform={`rotate(${i * seg + seg / 2}) translate(0 -58) rotate(90)`}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={n > 6 ? 11 : 14}
                fontWeight="800"
                fill={DARK.has(COLORS[i % COLORS.length]) ? '#f3e7c9' : '#16110c'}
              >
                {label}
              </text>
            </g>
          )
        })}
        <circle r="16" fill="#16110c" />
        <circle r="9" fill="#f2a71b" />
      </g>
      <circle r="101" fill="none" stroke="#16110c" strokeWidth="4" />
      <path d="M-11 -112 L11 -112 L0 -88 Z" fill="#f3e7c9" stroke="#16110c" strokeWidth="2" />
    </svg>
  )
}
