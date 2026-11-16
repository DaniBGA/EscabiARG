import { isVideoPath } from '../../lib/media'

/** Miniatura: foto, o primer cuadro del video con un ▶ */
export function MediaThumb({ path, url, alt }: { path: string; url: string; alt: string }) {
  if (!isVideoPath(path)) return <img src={url} alt={alt} loading="lazy" />
  return (
    <span className="media-video" role="img" aria-label={`Video: ${alt}`}>
      <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
      <span className="media-play" aria-hidden="true">▶</span>
    </span>
  )
}

/** En grande: la foto, o el video con controles */
export function MediaFull({ path, url, alt }: { path: string; url: string; alt: string }) {
  if (!isVideoPath(path)) return <img className="lightbox-img" src={url} alt={alt} />
  return <video className="lightbox-img" src={url} controls autoPlay playsInline aria-label={`Video: ${alt}`} />
}
