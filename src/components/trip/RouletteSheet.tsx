import { useRef, useState } from 'react'
import type { CardKey } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { CARDS, cardDef, formatDay } from '../../lib/game'
import Sheet from '../Sheet'

type Props = {
  open: boolean
  onClose: () => void
  tripId: string
  day: string | null
  today: string
  onDone: (message: string) => void
}

const SEG = 360 / CARDS.length
const COLORS = ['#f2a71b', '#f3e7c9', '#d6442c', '#f3e7c9', '#3567a0', '#f3e7c9']
const SPIN_MS = 4600

const point = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  return [r * Math.sin(a), -r * Math.cos(a)]
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function RouletteSheet({ open, onClose, tripId, day, today, onDone }: Props) {
  const api = useApi()
  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'result'>('idle')
  const [won, setWon] = useState<CardKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const spin = async () => {
    if (!day || phase !== 'idle') return
    setPhase('spinning')
    setError(null)
    try {
      const key = await api.spinRoulette(tripId, day)
      const idx = Math.max(0, CARDS.findIndex((c) => c.key === key))
      const center = idx * SEG + SEG / 2
      const jitter = (Math.random() - 0.5) * SEG * 0.6
      const base = rotation - (rotation % 360)
      setRotation(base + 360 * 6 + (360 - center) + jitter)
      setWon(key)
      timer.current = window.setTimeout(() => setPhase('result'), reducedMotion() ? 50 : SPIN_MS + 150)
    } catch (err) {
      setError(friendlyError(err))
      setPhase('idle')
    }
  }

  const close = () => {
    if (phase === 'spinning') return
    window.clearTimeout(timer.current)
    const result = won
    setPhase('idle')
    setWon(null)
    setError(null)
    onClose()
    if (result) {
      const def = cardDef(result)
      onDone(`${def.emoji} ¡Ganaste el comodín "${def.name}"!`)
    }
  }

  const def = won ? cardDef(won) : null

  return (
    <Sheet open={open} title="Ruleta del ganador" onClose={close}>
      <div className="sheet-stack roulette">
        {day && <p className="muted center">Ganaste la jornada de <strong>{formatDay(day, today).toLowerCase()}</strong>. Girá y llevate un comodín.</p>}

        <div className="wheel-wrap">
          <svg viewBox="-110 -110 220 220" className="wheel" role="img" aria-label="Ruleta de comodines">
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: phase === 'spinning' && !reducedMotion()
                  ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.1, 1)`
                  : 'none',
              }}
            >
              {CARDS.map((c, i) => {
                const [x1, y1] = point(i * SEG, 100)
                const [x2, y2] = point((i + 1) * SEG, 100)
                return (
                  <g key={c.key}>
                    <path
                      d={`M0 0 L${x1} ${y1} A100 100 0 0 1 ${x2} ${y2} Z`}
                      fill={COLORS[i % COLORS.length]}
                      stroke="#16110c"
                      strokeWidth="1.5"
                    />
                    <text
                      transform={`rotate(${i * SEG + SEG / 2}) translate(0 -64)`}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="26"
                    >
                      {c.emoji}
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
        </div>

        {phase === 'result' && def ? (
          <div className="won-card" role="status">
            <span className="won-emoji" aria-hidden="true">{def.emoji}</span>
            <strong>{def.name}</strong>
            <span>{def.description}</span>
            <small>Quedó guardado en tus comodines: usalo cuando quieras.</small>
          </div>
        ) : (
          <ul className="wheel-legend">
            {CARDS.map((c) => (
              <li key={c.key}><span aria-hidden="true">{c.emoji}</span> {c.name}</li>
            ))}
          </ul>
        )}

        {error && <p className="notice notice--error" role="alert">{error}</p>}

        {phase === 'result' ? (
          <button type="button" className="btn btn--primary btn--block" onClick={close}>¡Genial!</button>
        ) : (
          <button type="button" className="btn btn--primary btn--block" disabled={phase === 'spinning' || !day} onClick={spin}>
            {phase === 'spinning' ? 'Girando…' : '🎡 Girar la ruleta'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
