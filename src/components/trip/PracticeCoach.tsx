import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TripDetail } from '../../lib/api'
import { practiceBotDrink, PRACTICE_BOT_ID } from '../../lib/demoApi'
import { OPTIONAL_FEATURES } from '../../lib/features'
import { formatPoints } from '../../lib/game'
import './PracticeCoach.css'

type Ctx = {
  detail: TripDetail
  me: string
  tab: string
  startedAt: number
}

type Step = {
  emoji: string
  title: string
  text: ReactNode
  /** Botón a resaltar ([data-tour="…"]) */
  target?: string
  /** Se completa solo cuando hacés lo que pide */
  done?: (c: Ctx) => boolean
  /** Mensaje al completarlo */
  success?: (c: Ctx) => string
  /** Algo que pasa al llegar a este paso */
  onEnter?: () => void
  next?: string
}

const myDrink = (c: Ctx) => c.detail.events.find((e) => e.kind === 'drink' && e.actor_id === c.me)
const botDrink = (c: Ctx) =>
  c.detail.events.find(
    (e) => e.kind === 'drink' && e.actor_id === PRACTICE_BOT_ID && Date.parse(e.created_at) >= c.startedAt - 5000,
  )
const didMy = (kind: string) => (c: Ctx) => c.detail.events.some((e) => e.kind === kind && e.actor_id === c.me && e.user_id !== c.me)

const STEPS: Step[] = [
  {
    emoji: '🍻',
    title: '¡Bienvenido a la sala de práctica!',
    text: 'Esta es una previa de mentira con Juli y Tincho, que juegan solos. Nada de lo que hagas acá cuenta ni lo ve nadie. Te guiamos paso a paso.',
    next: 'Arrancar',
  },
  {
    emoji: '🏆',
    title: '¿De qué se trata?',
    text: 'Lo que tomás y lo que hacés en la previa suma (o resta) puntos. Para que cuente lo probás con una foto y el resto del grupo lo valida. Gana el que tiene más puntos al final.',
    target: 'stats',
  },
  {
    emoji: '🍺',
    title: 'Cargá tu primer trago',
    text: 'Tocá «Cargar trago», elegí qué estás tomando y sacale una foto. En la práctica podés usar una foto de ejemplo.',
    target: 'drink',
    done: (c) => Boolean(myDrink(c)),
    success: () => '¡Listo! Tu trago quedó cargado.',
  },
  {
    emoji: '⏳',
    title: 'Ahora lo validan los demás',
    text: 'Tu trago quedó pendiente: Juli y Tincho miran la foto y votan si vale. Cuando la mayoría dice que sí, se suman los puntos. Esperá unos segundos…',
    target: 'stats',
    done: (c) => myDrink(c)?.status === 'approved',
    success: (c) => `¡Te lo validaron! ${formatPoints(myDrink(c)?.points ?? 0)} puntos 🎉`,
  },
  {
    emoji: '🗳️',
    title: 'Te toca validar a vos',
    text: 'Tincho cargó un fernet. Mirá su foto en «Pendientes» y votá si vale. Así se controla que nadie haga trampa.',
    target: 'pending',
    onEnter: practiceBotDrink,
    done: (c) => {
      const d = botDrink(c)
      return Boolean(d && (d.status !== 'pending' || c.detail.eventVotes.some((v) => v.event_id === d.id && v.voter_id === c.me)))
    },
    success: () => '¡Votaste! Así se valida todo en el grupo.',
  },
  {
    emoji: '🔥',
    title: 'Quemar',
    text: 'Si agarrás a alguien tomando algo que resta (agua, Alikal, té de boldo), sacale una foto y quemalo: le restan puntos. Probá quemar a Juli.',
    target: 'burn',
    done: didMy('burn'),
    success: () => '¡Quemaste a alguien! 🔥 Cuando lo validan, le restan los puntos.',
  },
  {
    emoji: '😵',
    title: 'Alguien quebró',
    text: 'Si alguien se pasa y quiebra, se reporta con foto y pierde puntos. Probá reportar a Tincho (es de mentira, tranqui).',
    target: 'quiebre',
    done: didMy('quiebre'),
    success: () => 'Reportado. Si el grupo lo valida, pierde puntos.',
  },
  {
    emoji: '🚨',
    title: 'Infracciones y prendas',
    text: 'Cada grupo tiene sus reglas (ej: «Tomar con la izquierda»). Si alguien rompe una, la reportás con foto y le toca una prenda: la escribís vos o sale una de la lista. Probá reportarle una a Juli.',
    target: 'infraction',
    done: didMy('infraction'),
    success: () => '¡Infracción reportada! Si la validan, tiene que cumplir la prenda.',
  },
  {
    emoji: '📊',
    title: 'La tabla',
    text: 'En «Tabla» ves cómo va cada uno, por día y en total. Tocala.',
    target: 'tab-board',
    done: (c) => c.tab === 'board',
    success: () => 'Acá se ve quién va ganando.',
  },
  {
    emoji: '✨',
    title: 'Extras opcionales',
    text: (
      <>
        Lo que probaste está siempre. Al crear un viaje o una previa podés sumar más juegos:
        <ul className="coach-extras">
          {OPTIONAL_FEATURES.map((f) => (
            <li key={f.key}>
              <span aria-hidden="true">{f.emoji}</span> <strong>{f.name}:</strong> {f.desc}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    emoji: '🎉',
    title: '¡Ya sabés jugar!',
    text: 'Ahora armá tu primer plan de verdad: agregá a tus amigos con su código en «Amigos» y creá un viaje o una previa.',
    next: 'Ir al inicio',
  },
]

type Props = {
  detail: TripDetail
  me: string
  tab: string
  onRefresh: () => void
  /** Terminó (o salió) */
  onFinish: () => void
}

/** Guía de la sala de práctica: va pidiendo cosas y se da cuenta sola cuando las hacés */
export default function PracticeCoach({ detail, me, tab, onRefresh, onFinish }: Props) {
  const [index, setIndex] = useState(0)
  const [minimized, setMinimized] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const step = STEPS[index]
  const ctx: Ctx = { detail, me, tab, startedAt }
  const completed = step.done ? step.done(ctx) : false
  const last = index === STEPS.length - 1
  const entered = useRef(-1)

  // Lo que pasa al entrar a un paso (ej: Tincho carga un trago para que lo valides)
  useEffect(() => {
    if (entered.current === index) return
    entered.current = index
    if (step.onEnter) {
      step.onEnter()
      onRefresh()
    }
  }, [index, step, onRefresh])

  // Resalta el botón del paso y lo trae a la vista
  useEffect(() => {
    if (!step.target || completed) return
    let el: HTMLElement | null = null
    const find = () => {
      el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      if (!el) return false
      el.classList.add('coach-target')
      // Arriba de la pantalla: abajo está la tarjeta de la guía
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return true
    }
    // Puede aparecer un poco después (ej: el trago de Tincho)
    let tries = 0
    const id = window.setInterval(() => {
      if (find() || ++tries > 20) window.clearInterval(id)
    }, 300)
    find()
    return () => {
      window.clearInterval(id)
      document.querySelectorAll('.coach-target').forEach((x) => x.classList.remove('coach-target'))
    }
  }, [step.target, completed, index])

  const go = () => {
    if (last) onFinish()
    else {
      setIndex(index + 1)
      setMinimized(false)
    }
  }

  if (minimized) {
    return (
      <button type="button" className="coach-pill" onClick={() => setMinimized(false)}>
        <span aria-hidden="true">{step.emoji}</span> Guía · {index + 1}/{STEPS.length}
      </button>
    )
  }

  return (
    <aside className="coach" aria-live="polite" aria-label="Guía de la sala de práctica">
      <div className="coach-top">
        <span className="coach-progress">
          Paso {index + 1} de {STEPS.length}
        </span>
        <span className="coach-top-actions">
          <button type="button" className="coach-link" onClick={() => setMinimized(true)}>
            Achicar
          </button>
          <button type="button" className="coach-link" onClick={onFinish}>
            Salir
          </button>
        </span>
      </div>
      <div className="coach-body">
        <span className="coach-emoji" aria-hidden="true">{completed ? '✅' : step.emoji}</span>
        <div>
          <h2 className="coach-title">{step.title}</h2>
          <div className="coach-text">{completed && step.success ? <strong>{step.success(ctx)}</strong> : step.text}</div>
        </div>
      </div>
      <div className="coach-actions">
        {step.done && !completed ? (
          <button type="button" className="coach-link" onClick={go}>
            Saltear este paso
          </button>
        ) : (
          <button type="button" className="btn btn--primary coach-next" onClick={go}>
            {step.next ?? (last ? 'Terminar' : 'Siguiente')}
          </button>
        )}
      </div>
    </aside>
  )
}
