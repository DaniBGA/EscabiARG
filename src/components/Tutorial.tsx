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
    emoji: '👋',
    title: '¡Bienvenido a EscabiARG!',
    text: 'Arman viajes o salidas con amigos, suman puntos con tragos, misiones y retos, y todo se actualiza en vivo en los celulares de todos. Te lo mostramos en un minuto.',
  },
  {
    target: 'profile',
    emoji: '🙋',
    title: 'Tu perfil',
    text: 'Tocá acá para cambiar tu nombre, ver tu código para que te agreguen, releer los términos, volver a ver este tutorial o cerrar sesión.',
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
    text: '“Crear viaje” es para varios días; “Previa y salida”, para una sola noche. Elegís a qué amigos invitar y después podés sumar a los que te olvidaste.',
  },
  {
    target: 'trips',
    emoji: '📋',
    title: 'Tus planes',
    text: 'Acá aparecen tus viajes y salidas. Tocá uno para entrar. Si hay algo para validar o votar, te lo marca con un número.',
  },
  {
    emoji: '🍺',
    title: 'Cargar trago',
    text: 'Adentro de un plan, sacale una foto a lo que tomás (con la cámara de la app, en el momento). Suma cuando la mayoría del grupo la valida en “Pendientes”.',
  },
  {
    emoji: '🎯',
    title: 'Misión del día',
    text: 'Elegí fácil, intermedia o extrema y te toca una al azar. Si al grupo le parece mala, la pueden votar y cambiar. Se prueba con foto o con un video de hasta 15 segundos.',
  },
  {
    emoji: '😵',
    title: 'Quebró y Quemar',
    text: 'Si alguien quiebra, se reporta con foto y le restan puntos. Y si agarrás a alguien tomando agua o un Alikal, lo quemás con una foto 🔥.',
  },
  {
    emoji: '⚔️',
    title: 'Duelos y ruletas',
    text: 'Retá a alguien a fondo blanco o shots (el otro decide si acepta y se puede bajar cuando quiera). La ruleta elige quién cocina o prepara el trago, y el grupo vota si salió bueno.',
  },
  {
    emoji: '🎰',
    title: 'Casino, infracciones y prendas',
    text: 'En el casino, el que pierde todo toca “Quedé en 0” y el último con plata gana. Las infracciones (llegar tarde, dormirse…) se pagan con una prenda que elige quien la reporta.',
  },
  {
    emoji: '🪩',
    title: 'Hora boliche',
    text: 'El organizador puede activarla: las misiones, prendas y duelos pasan a ser de boliche, incluido el duelo de baile que vota el grupo.',
  },
  {
    emoji: '🏆',
    title: 'Tabla, comodines y galería',
    text: 'El que gana la jornada gira la ruleta de comodines. En “Galería” quedan todas las fotos y videos para descargar. Y acordate: el límite lo ponés vos, podés parar cuando quieras.',
  },
]

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8

/** Tutorial de la primera vez, con el botón resaltado en cada paso y opción de saltearlo */
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
