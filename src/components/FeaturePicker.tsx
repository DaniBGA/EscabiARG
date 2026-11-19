import { CORE_PARTS, OPTIONAL_FEATURES, type Feature } from '../lib/features'
import { CheckIcon } from './icons'
import './FeaturePicker.css'

type Props = {
  value: Feature[]
  onChange: (features: Feature[]) => void
  disabled?: boolean
  /** Muestra también lo que viene siempre (al crear el plan) */
  showCore?: boolean
}

/** Elegir qué extras se juegan en un viaje o previa */
export default function FeaturePicker({ value, onChange, disabled = false, showCore = true }: Props) {
  const toggle = (f: Feature) =>
    onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f])

  return (
    <fieldset className="features" disabled={disabled}>
      <legend className={showCore ? 'invite-legend' : 'sr-only'}>
        <span>¿Qué se juega?</span>
      </legend>

      {showCore && (
        <>
          <p className="features-sub">Siempre</p>
          <ul className="features-core">
            {CORE_PARTS.map((c) => (
              <li key={c.name} title={c.desc}>
                <span aria-hidden="true">{c.emoji}</span> {c.name}
              </li>
            ))}
          </ul>
          <p className="features-sub">Extras (prendé los que quieran jugar)</p>
        </>
      )}

      <ul className="invite-list features-list">
        {OPTIONAL_FEATURES.map((f) => {
          const checked = value.includes(f.key)
          return (
            <li key={f.key}>
              <label className={`invite-item feature-item${checked ? ' is-checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(f.key)} />
                <span className="feature-emoji" aria-hidden="true">{f.emoji}</span>
                <span className="feature-text">
                  <strong>{f.name}</strong>
                  <small>{f.desc}</small>
                </span>
                <span className="invite-check" aria-hidden="true">
                  {checked && <CheckIcon />}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
