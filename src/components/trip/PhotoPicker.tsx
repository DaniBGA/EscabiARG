import { useEffect, useMemo, useState } from 'react'
import { usePractice } from '../../lib/authContext'
import { MAX_VIDEO_SECONDS, canRecordVideo, isVideoBlob } from '../../lib/media'
import { samplePhoto } from '../../lib/samplePhoto'
import { CameraIcon, CloseIcon } from '../icons'
import CameraCapture from './CameraCapture'

type Props = {
  photos: Blob[]
  onChange: (photos: Blob[]) => void
  /** Cantidad máxima de fotos o videos */
  max?: number
  label?: string
  /** Se puede grabar video de prueba (hasta 15 s) */
  allowVideo?: boolean
}

/** Fotos (y videos cortos) sacados con la cámara de la app (sin galería) + vista previa */
export default function PhotoPicker({ photos, onChange, max = 1, label = 'Sacar foto', allowVideo = false }: Props) {
  const [camera, setCamera] = useState(false)
  const practice = usePractice()
  const previews = useMemo(() => photos.map((p) => ({ url: URL.createObjectURL(p), video: isVideoBlob(p) })), [photos])
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews])
  const video = allowVideo && canRecordVideo()

  return (
    <div className="photo-picker">
      {previews.length > 0 && (
        <div className="photo-previews">
          {previews.map((p, i) => (
            <div key={p.url} className="photo-preview">
              {p.video ? (
                <span className="media-video">
                  <video src={p.url} muted loop autoPlay playsInline aria-label={`Video ${i + 1}`} />
                  <span className="media-play" aria-hidden="true">▶</span>
                </span>
              ) : (
                <img src={p.url} alt={`Foto ${i + 1}`} />
              )}
              <button
                type="button"
                className="photo-remove"
                aria-label={p.video ? 'Sacar este video' : 'Sacar esta foto'}
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
          <span>{photos.length === 0 ? label : video ? 'Sacar otra foto o video' : 'Sacar otra foto'}</span>
          {max > 1 && <small>{photos.length}/{max}</small>}
        </button>
      )}
      {practice && photos.length < max && (
        <button
          type="button"
          className="photo-sample"
          onClick={async () => {
            const blob = await samplePhoto()
            onChange(max === 1 ? [blob] : [...photos, blob].slice(0, max))
          }}
        >
          🖼️ Usar una foto de ejemplo (solo en la práctica)
        </button>
      )}
      <p className="photo-note">
        {video
          ? `📸🎥 Foto o video de hasta ${MAX_VIDEO_SECONDS} s, solo con la cámara y en el momento.`
          : '📸 Solo con la cámara, en el momento. No se pueden subir fotos de la galería.'}
      </p>

      <CameraCapture
        open={camera}
        allowVideo={allowVideo}
        title="Sacá la foto"
        onClose={() => setCamera(false)}
        onCapture={(blob) => onChange(max === 1 ? [blob] : [...photos, blob].slice(0, max))}
      />
    </div>
  )
}
