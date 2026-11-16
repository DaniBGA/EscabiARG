import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { friendlyError } from '../../lib/errors'
import { MAX_VIDEO_SECONDS, VIDEO_BITS_PER_SECOND, canRecordVideo, formatSeconds, pickRecorderType } from '../../lib/media'
import { CloseIcon } from '../icons'

type Props = {
  open: boolean
  onClose: () => void
  /** Devuelve la foto (JPEG) o el video grabado */
  onCapture: (media: Blob) => void
  title?: string
  /** Se puede grabar video (hasta 15 s) además de sacar fotos */
  allowVideo?: boolean
}

type Mode = 'photo' | 'video'
type Shot = { blob: Blob; url: string; kind: Mode }

/** Menos que esto no cuenta como video (fue un toque, no "mantener") */
const MIN_VIDEO_MS = 700

/**
 * Cámara dentro de la app (getUserMedia): la foto o el video se sacan en el momento,
 * no hay forma de elegir algo de la galería.
 * Video: se graba manteniendo apretado el botón, hasta 15 segundos.
 */
export default function CameraCapture({ open, onClose, onCapture, title = 'Sacá la foto', allowVideo = false }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; started: number; timer: number } | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [mode, setMode] = useState<Mode>('photo')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [shot, setShot] = useState<Shot | null>(null)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torch, setTorch] = useState(false)
  const torchRef = useRef(false)
  const [recStart, setRecStart] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const videoMode = allowVideo && mode === 'video' && canRecordVideo()

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
    setTorchAvailable(false)
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  /** Prende o apaga la linterna del celu (si la cámara tiene) */
  const applyTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return false
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      return true
    } catch {
      return false
    }
  }, [])

  // Prender la cámara al abrir (y al cambiar de cámara o de foto a video)
  useEffect(() => {
    if (!open || shot) return
    let cancelled = false
    const start = async () => {
      setError(null)
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(friendlyError(window.isSecureContext ? 'CAMERA_MISSING' : 'CAMERA_INSECURE'))
        return
      }
      // En video se pide menos resolución (pesa menos) y el micrófono
      const video: MediaTrackConstraints = videoMode
        ? { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } }
        : { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } }
      try {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: videoMode })
        } catch (err) {
          // Sin permiso de micrófono: el video se graba sin sonido
          if (!videoMode) throw err
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const el = videoRef.current
        if (el) {
          el.srcObject = stream
          await el.play().catch(() => undefined)
          setReady(true)
        }
        const track = stream.getVideoTracks()[0]
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
        setTorchAvailable(Boolean(caps.torch))
        if (caps.torch && torchRef.current) await applyTorch(true)
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
  }, [open, facing, shot, videoMode, stop, applyTorch])

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url)
  }, [shot])

  // Reloj mientras graba
  useEffect(() => {
    if (recStart === null) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [recStart])

  const toggleTorch = async () => {
    const next = !torch
    if (await applyTorch(next)) {
      torchRef.current = next
      setTorch(next)
    } else {
      setHint('No se pudo prender el flash')
    }
  }

  const stopRecording = useCallback(() => {
    const r = recRef.current
    if (!r) return
    window.clearTimeout(r.timer)
    recRef.current = null
    setRecStart(null)
    if (r.rec.state !== 'inactive') r.rec.stop()
  }, [])

  const startRecording = () => {
    const stream = streamRef.current
    if (!ready || !stream || recRef.current) return
    setHint(null)
    const type = pickRecorderType()
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, {
        ...(type ? { mimeType: type } : {}),
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: 64_000,
      })
    } catch {
      try {
        rec = new MediaRecorder(stream)
      } catch {
        setHint(friendlyError('VIDEO_UNSUPPORTED'))
        return
      }
    }
    const chunks: Blob[] = []
    const started = Date.now()
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = () => {
      if (Date.now() - started < MIN_VIDEO_MS || chunks.length === 0) {
        setHint('Mantené apretado el botón para grabar')
        return
      }
      const blob = new Blob(chunks, { type: (rec.mimeType || type || 'video/webm').split(';')[0] })
      stop()
      setShot({ blob, url: URL.createObjectURL(blob), kind: 'video' })
    }
    rec.start(250)
    const timer = window.setTimeout(stopRecording, MAX_VIDEO_SECONDS * 1000)
    recRef.current = { rec, chunks, started, timer }
    setNow(started)
    setRecStart(started)
  }

  // Cerrar la cámara corta la grabación
  useEffect(() => {
    if (!open) stopRecording()
  }, [open, stopRecording])

  const close = () => {
    stopRecording()
    stop()
    setShot(null)
    setError(null)
    setHint(null)
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
        setShot({ blob, url: URL.createObjectURL(blob), kind: 'photo' })
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

  // Grabar: mantener apretado (mouse, dedo o tecla)
  const onPressStart = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    startRecording()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault()
      startRecording()
    }
  }
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') stopRecording()
  }

  const recording = recStart !== null
  const elapsed = recording ? now - recStart : 0
  const progress = Math.min(1, elapsed / (MAX_VIDEO_SECONDS * 1000))
  const RING = 2 * Math.PI * 44

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
            <span>{shot ? (shot.kind === 'video' ? 'Mirá el video' : 'Mirá la foto') : videoMode ? 'Grabá un video' : title}</span>
            <span className="camera-top-actions">
              {torchAvailable && !shot && (
                <button
                  type="button"
                  className={`camera-round camera-torch${torch ? ' is-on' : ''}`}
                  onClick={toggleTorch}
                  aria-label={torch ? 'Apagar flash' : 'Prender flash'}
                  aria-pressed={torch}
                >
                  ⚡
                </button>
              )}
              <button type="button" className="camera-round" onClick={close} aria-label="Cerrar cámara">
                <CloseIcon />
              </button>
            </span>
          </header>

          <div className="camera-view">
            {shot ? (
              shot.kind === 'video' ? (
                <video src={shot.url} controls autoPlay muted loop playsInline aria-label="Video recién grabado" />
              ) : (
                <img src={shot.url} alt="Foto recién sacada" />
              )
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={facing === 'user' ? 'is-mirrored' : undefined}
              />
            )}
            {recording && (
              <span className="camera-rec" role="status">
                <span className="camera-rec-dot" aria-hidden="true" /> {formatSeconds(elapsed)} / 0:{MAX_VIDEO_SECONDS}
              </span>
            )}
            {error && <p className="camera-error" role="alert">{error}</p>}
            {!error && !ready && !shot && <p className="camera-hint">Abriendo cámara…</p>}
          </div>

          <footer className={`camera-bottom${!shot ? ' camera-bottom--live' : ''}`}>
            {shot ? (
              <>
                <button type="button" className="btn btn--ghost camera-wide" onClick={() => setShot(null)}>
                  {shot.kind === 'video' ? 'Otro' : 'Otra'}
                </button>
                <button type="button" className="btn btn--primary camera-wide" onClick={use}>
                  {shot.kind === 'video' ? 'Usar video' : 'Usar foto'}
                </button>
              </>
            ) : (
              <>
                {allowVideo && canRecordVideo() && (
                  <div className="camera-modes" role="group" aria-label="Foto o video">
                    {(['photo', 'video'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`camera-mode${mode === m ? ' is-selected' : ''}`}
                        aria-pressed={mode === m}
                        disabled={recording}
                        onClick={() => {
                          setMode(m)
                          setHint(null)
                        }}
                      >
                        {m === 'photo' ? 'Foto' : 'Video'}
                      </button>
                    ))}
                  </div>
                )}
                <div className="camera-controls">
                  <span className="camera-spacer" />
                  {videoMode ? (
                    <button
                      type="button"
                      className={`camera-shutter camera-shutter--video${recording ? ' is-recording' : ''}`}
                      onPointerDown={onPressStart}
                      onPointerUp={stopRecording}
                      onPointerCancel={stopRecording}
                      onKeyDown={onKeyDown}
                      onKeyUp={onKeyUp}
                      onContextMenu={(e) => e.preventDefault()}
                      disabled={!ready}
                      aria-label={`Mantené apretado para grabar (hasta ${MAX_VIDEO_SECONDS} segundos)`}
                    >
                      <svg viewBox="0 0 100 100" aria-hidden="true">
                        <circle cx="50" cy="50" r="44" className="camera-ring-bg" />
                        <circle
                          cx="50"
                          cy="50"
                          r="44"
                          className="camera-ring"
                          strokeDasharray={RING}
                          strokeDashoffset={RING * (1 - progress)}
                        />
                      </svg>
                      <span className="camera-rec-core" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="camera-shutter"
                      onClick={capture}
                      disabled={!ready}
                      aria-label="Sacar foto"
                    />
                  )}
                  <button
                    type="button"
                    className="camera-round"
                    onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}
                    aria-label="Cambiar de cámara"
                    disabled={!!error || recording}
                  >
                    🔄
                  </button>
                </div>
                <p className="camera-tip" role="status">
                  {hint ?? (videoMode ? `Mantené apretado para grabar · máximo ${MAX_VIDEO_SECONDS} s` : ' ')}
                </p>
              </>
            )}
          </footer>
        </div>
      )}
    </dialog>
  )
}
