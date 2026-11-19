import { PRACTICE_PATH } from '../lib/router'
import './PracticeInvite.css'

type Props = {
  /** Saltear la práctica (muestra el recorrido del inicio) */
  onSkip: () => void
  /** Al entrar a la práctica */
  onStart: () => void
}

/** Primera vez: invitación a jugar una previa de práctica antes de arrancar */
export default function PracticeInvite({ onSkip, onStart }: Props) {
  return (
    <div className="pinvite" role="dialog" aria-modal="true" aria-labelledby="pinvite-title">
      <div className="pinvite-card">
        <span className="pinvite-emoji" aria-hidden="true">🍻</span>
        <h2 id="pinvite-title" className="pinvite-title">¿Jugamos una de práctica?</h2>
        <p className="pinvite-text">
          Antes de armar tu primer plan, jugá una <strong>previa de práctica</strong> con Juli y Tincho.
          Te mostramos paso a paso cómo se juega: cargar tragos, validar, quemar, quebrar e infracciones.
        </p>
        <p className="pinvite-small">Son unos 3 minutos y no cuenta para nada.</p>
        <a
          className="btn btn--primary btn--block pinvite-start"
          href={PRACTICE_PATH}
          onClick={onStart}
        >
          Empezar la práctica
        </a>
        <button type="button" className="pinvite-skip" onClick={onSkip}>
          Ya sé jugar, saltear
        </button>
      </div>
    </div>
  )
}
