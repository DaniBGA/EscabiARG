import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from '../../lib/errors'
import { CloseIcon } from '../icons'

type Props = {
  open: boolean
  onClose: () => void
  onCapture: (photo: Blob) => void
  title?: string
}

/**
 * Cámara dentro de la app (getUserMedia): la foto se saca en el momento,
 * no hay forma de elegir una imagen de la galería.
 */
export default function CameraCapture({ open, onClose, onCapture, title = 'Sacá la foto' }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Prender la cámara al abrir (y al cambiar de frontal a trasera)
  useEffect(() => {
    if (!open || shot) return
    let cancelled = false
    const start = async () => {
      setError(null)
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(friendlyError(window.isSecureContext ? 'CAMERA_MISSING' : 'CAMERA_INSECURE'))
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
          setReady(true)
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ''
        setError(
          friendlyError(
            name === 'NotAllowedError' || name === 'SecurityError'
              ? 'CAMERA_DENIED'
              : name === 'NotFoundError' || name === 'OverconstrainedError'
                ? 'CAMERA_MISSING'
                : 'CAMERA_ERROR',
          ),
        )
      }
    }
    start()
    return () => {
      cancelled = true
      stop()
    }
  }, [open, facing, shot, stop])

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url)
  }, [shot])

  const close = () => {
    stop()
    setShot(null)
    setError(null)
    onClose()
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (facing === 'user') {
      // La cámara frontal se ve espejada: guardamos la foto como se ve
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stop()
        setShot({ blob, url: URL.createObjectURL(blob) })
      },
      'image/jpeg',
      0.9,
    )
  }

  const use = () => {
    if (!shot) return
    onCapture(shot.blob)
    setShot(null)
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="camera"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        e.stopPropagation()
        close()
      }}
      onClose={(e) => e.stopPropagation()}
    >
      {open && (
        <div className="camera-body">
          <header className="camera-top">
            <span>{title}</span>
            <button type="button" className="camera-round" onClick={close} aria-label="Cerrar cámara">
              <CloseIcon />
            </button>
          </header>

          <div className="camera-view">
            {shot ? (
              <img src={shot.url} alt="Foto recién sacada" />
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={facing === 'user' ? 'is-mirrored' : undefined}
              />
            )}
            {error && <p className="camera-error" role="alert">{error}</p>}
            {!error && !ready && !shot && <p className="camera-hint">Abriendo cámara…</p>}
          </div>

          <footer className="camera-bottom">
            {shot ? (
              <>
                <button type="button" className="btn btn--ghost camera-wide" onClick={() => setShot(null)}>
                  Otra
                </button>
                <button type="button" className="btn btn--primary camera-wide" onClick={use}>
                  Usar foto
                </button>
              </>
            ) : (
              <>
                <span className="camera-spacer" />
                <button
                  type="button"
                  className="camera-shutter"
                  onClick={capture}
                  disabled={!ready}
                  aria-label="Sacar foto"
                />
                <button
                  type="button"
                  className="camera-round"
                  onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}
                  aria-label="Cambiar de cámara"
                  disabled={!!error}
                >
                  🔄
                </button>
              </>
            )}
          </footer>
        </div>
      )}
    </dialog>
  )
}
