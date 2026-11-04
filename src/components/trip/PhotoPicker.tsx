import { useEffect, useMemo, useRef, useState } from 'react'
import { isFreshPhoto } from '../../lib/photos'
import { friendlyError } from '../../lib/errors'
import { CameraIcon, CloseIcon } from '../icons'

type Props = {
  files: File[]
  onChange: (files: File[]) => void
  /** Cantidad máxima de fotos */
  max?: number
  label?: string
}

/** Abre la cámara (en el celu) y muestra la vista previa de las fotos */
export default function PhotoPicker({ files, onChange, max = 1, label = 'Sacar foto' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const pick = (list: FileList | null) => {
    setError(null)
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
    if (picked.length === 0) return
    if (picked.some((f) => !isFreshPhoto(f))) {
      setError(friendlyError('PHOTO_TOO_OLD'))
      return
    }
    onChange(max === 1 ? picked.slice(0, 1) : [...files, ...picked].slice(0, max))
  }

  return (
    <div className="photo-picker">
      {previews.length > 0 && (
        <div className="photo-previews">
          {previews.map((src, i) => (
            <div key={src} className="photo-preview">
              <img src={src} alt={`Foto ${i + 1}`} />
              <button
                type="button"
                className="photo-remove"
                aria-label="Sacar esta foto"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length < max && (
        <button type="button" className="photo-take" onClick={() => inputRef.current?.click()}>
          <CameraIcon />
          <span>{files.length === 0 ? label : 'Agregar otra foto'}</span>
          {max > 1 && <small>{files.length}/{max}</small>}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={max > 1}
        hidden
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </div>
  )
}
