import { useEffect, useRef, useState } from 'react'
import QuiebreGuy from './QuiebreGuy'

type Props = {
  /** Texto del cartel, ej: "¡Juli quebró!" */
  title: string
  onClose: () => void
}

const SHOW_MS = 4200

/** Animación a pantalla completa cuando alguien quiebra */
export default function QuiebreOverlay({ title, onClose }: Props) {
  const [leaving, setLeaving] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), SHOW_MS)
    const done = window.setTimeout(() => onCloseRef.current(), SHOW_MS + 300)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(done)
    }
  }, [])

  const close = () => {
    setLeaving(true)
    window.setTimeout(() => onCloseRef.current(), 250)
  }

  return (
    <div
      className={`quiebre-overlay${leaving ? ' is-leaving' : ''}`}
      role="alertdialog"
      aria-label={title}
      onClick={close}
    >
      <QuiebreGuy size={230} />
      <p className="quiebre-overlay-sign">{title}</p>
      <p className="quiebre-overlay-sub">Que alguien le alcance un vaso de agua</p>
      <p className="quiebre-overlay-hint">Tocá para cerrar</p>
    </div>
  )
}
