import { useEffect, useMemo, useState } from 'react'
import { CameraIcon, CloseIcon } from '../icons'
import CameraCapture from './CameraCapture'

type Props = {
  photos: Blob[]
  onChange: (photos: Blob[]) => void
  /** Cantidad máxima de fotos */
  max?: number
  label?: string
}

/** Fotos sacadas con la cámara de la app (sin galería) + vista previa */
export default function PhotoPicker({ photos, onChange, max = 1, label = 'Sacar foto' }: Props) {
  const [camera, setCamera] = useState(false)
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

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
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length < max && (
        <button type="button" className="photo-take" onClick={() => setCamera(true)}>
          <CameraIcon />
          <span>{photos.length === 0 ? label : 'Sacar otra foto'}</span>
          {max > 1 && <small>{photos.length}/{max}</small>}
        </button>
      )}
      <p className="photo-note">📸 Solo con la cámara, en el momento. No se pueden subir fotos de la galería.</p>

      <CameraCapture
        open={camera}
        onClose={() => setCamera(false)}
        onCapture={(blob) => onChange(max === 1 ? [blob] : [...photos, blob].slice(0, max))}
      />
    </div>
  )
}
