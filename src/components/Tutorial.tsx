import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import './Tutorial.css'

type Step = {
  /** Elemento a resaltar: [data-tour="…"] (si no hay, la tarjeta va al centro) */
  target?: string
  emoji: string
  title: string
  text: string
}

const STEPS: Step[] = [
  {
    emoji: '🏠',
    title: 'Tu inicio',
    text: 'Ya sabés cómo se juega. Te mostramos dónde está cada cosa para armar tu primer plan.',
  },
  {
    target: 'profile',
    emoji: '🙋',
    title: 'Tu perfil',
    text: 'Cambiá tu nombre y tu foto, mirá tu código para que te agreguen, activá las notificaciones o volvé a la sala de práctica cuando quieras.',
  },
  {
    target: 'friends',
    emoji: '👥',
    title: 'Amigos',
    text: 'Agregá amigos con su código de 6 letras y compartí el tuyo. Solo podés invitar a tus amigos a los planes.',
  },
  {
    target: 'create',
    emoji: '✈️',
    title: 'Armá un plan',
    text: '“Crear viaje” es para varios días (con ida y vuelta); “Previa y salida”, para una sola noche. Elegís qué extras se juegan y a qué amigos invitar.',
  },
  {
    target: 'trips',
    emoji: '📋',
    title: 'Tus planes',
    text: 'Acá aparecen tus viajes y salidas. Tocá uno para entrar. Si hay algo para validar o votar, te lo marca con un número.',
  },
  {
    emoji: '🍻',
    title: '¡A jugar!',
    text: 'Y acordate: el límite lo ponés vos, podés parar cuando quieras. ¡Salud!',
  },
]

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8

/** Recorrido del inicio (después de la sala de práctica), con el botón resaltado en cada paso */
export default function Tutorial({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const measure = useCallback(() => {
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [step.target])

  // Llevar el elemento a la vista y medirlo
  useLayoutEffect(() => {
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
    el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
    measure()
  }, [step.target, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(STEPS.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // La tarjeta va debajo del elemento si está arriba de la pantalla, y si no, arriba
  const below = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : false
  const cardStyle = rect
    ? below
      ? { top: Math.min(rect.top + rect.height + 14, window.innerHeight - 280) }
      : { bottom: Math.max(14, window.innerHeight - rect.top + 14) }
    : undefined

  return (
    <div className={`tutorial${rect ? ' has-target' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      {rect ? (
        <span
          className="tutorial-hole"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      ) : (
        <span className="tutorial-dim" aria-hidden="true" />
      )}

      <section key={index} className={`tutorial-card${rect ? (below ? ' is-below' : ' is-above') : ' is-center'}`} style={cardStyle}>
        <span className="tutorial-emoji" aria-hidden="true">{step.emoji}</span>
        <h2 id="tutorial-title" className="tutorial-title">{step.title}</h2>
        <p className="tutorial-text">{step.text}</p>

        <div className="tutorial-dots" aria-label={`Paso ${index + 1} de ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s.title} className={i === index ? 'is-on' : i < index ? 'is-done' : ''} />
          ))}
        </div>

        <div className="tutorial-actions">
          {index > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={() => setIndex(index - 1)}>
              Atrás
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn btn--primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? '¡A jugar!' : 'Siguiente'}
          </button>
        </div>
        {!last && (
          <button type="button" className="tutorial-skip" onClick={onClose}>
            Saltar tutorial
          </button>
        )}
      </section>
    </div>
  )
}
