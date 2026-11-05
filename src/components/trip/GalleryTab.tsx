import { useEffect, useState } from 'react'
import type { TripEvent, TripMember } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { canShareFiles, fetchPhotos, photoFileName, savePhotos, type PhotoFile } from '../../lib/download'
import { friendlyError } from '../../lib/errors'
import { formatDay, formatPoints, formatTime } from '../../lib/game'
import Sheet from '../Sheet'

type Props = {
  events: TripEvent[]
  members: TripMember[]
  userId: string
  today: string
  tripName: string
}

/** El menú de compartir del celular no se banca demasiadas fotos juntas */
const MAX_SHARE = 40

type Filter = 'all' | 'drink' | 'quiebre' | 'burn' | 'mission' | 'more'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'drink', label: '🍺 Tragos' },
  { key: 'quiebre', label: '😵 Quebradas' },
  { key: 'burn', label: '🔥 Quemadas' },
  { key: 'mission', label: '🎯 Misiones' },
  { key: 'more', label: '🎰 Otras' },
]

const MAIN_KINDS = ['drink', 'quiebre', 'burn', 'mission']
const matches = (f: Filter, kind: string) =>
  f === 'all' || (f === 'more' ? !MAIN_KINDS.includes(kind) : kind === f)

type Photo = { path: string; event: TripEvent }

/** Todas las fotos del viaje: tragos, quebradas y pruebas de misiones */
export default function GalleryTab({ events, members, userId, today, tripName }: Props) {
  const api = useApi()
  const [filter, setFilter] = useState<Filter>('all')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Photo | null>(null)
  /** "3/20" mientras baja las fotos */
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareable] = useState(() => canShareFiles())

  const photos: Photo[] = events.flatMap((e) => e.photo_paths.map((path) => ({ path, event: e })))
  const shown = photos.filter((p) => matches(filter, p.event.kind))
  const pathsKey = photos.map((p) => p.path).join('|')

  useEffect(() => {
    if (!pathsKey) return
    let alive = true
    api
      .getPhotoUrls(pathsKey.split('|'))
      .then((r) => alive && setUrls((prev) => ({ ...prev, ...r })))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [api, pathsKey])

  const name = (id: string) =>
    id === userId ? 'Vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? 'Alguien'

  const count = (f: Filter) => photos.filter((p) => matches(f, p.event.kind)).length

  const describe = (e: TripEvent) => (e.kind === 'quiebre' ? 'quebró' : e.kind === 'burn' ? `quemada ${e.title}` : e.title)

  /** Baja las fotos (de a 4 por vez) con nombres que se entienden */
  const collect = async (list: Photo[]): Promise<PhotoFile[]> => {
    const taken = new Set<string>()
    // En el archivo va el nombre de verdad (no "Vos")
    const realName = (id: string) => members.find((m) => m.user_id === id)?.profile?.display_name ?? 'Alguien'
    const names = list.map((p) => photoFileName(p.event.created_at, realName(p.event.user_id), describe(p.event), taken))
    const missing = list.filter((p) => !urls[p.path]).map((p) => p.path)
    const fresh = missing.length > 0 ? await api.getPhotoUrls(missing) : {}
    const links = list.map((p) => urls[p.path] ?? fresh[p.path])
    if (links.some((u) => !u)) throw new Error('PHOTO_DOWNLOAD_FAILED')
    const blobs = await fetchPhotos(links, (done) => list.length > 1 && setProgress(`${done}/${list.length}`))
    return blobs.map((blob, i) => ({ name: names[i], blob }))
  }

  const save = async (list: Photo[], preferZip: boolean) => {
    if (progress !== null || list.length === 0) return
    setError(null)
    setProgress(list.length > 1 ? `0/${list.length}` : '…')
    try {
      const files = await collect(list)
      const label = FILTERS.find((f) => f.key === filter)?.label.replace(/^\S+\s/, '') ?? 'Fotos'
      await savePhotos(files, { preferZip, zipName: `${tripName} - ${filter === 'all' ? 'Fotos' : label}.zip` })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setProgress(null)
    }
  }

  return (
    <section className="card-box" aria-labelledby="gallery-title">
      <h3 id="gallery-title" className="box-title">Galería</h3>
      <div className="gallery-filters" role="group" aria-label="Filtrar fotos">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="chip-btn"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label} · {count(f.key)}
          </button>
        ))}
      </div>

      {shown.length > 0 && (
        <div className="gallery-export">
          {shareable && shown.length <= MAX_SHARE && (
            <button type="button" className="btn btn--ghost btn--sm" disabled={progress !== null} onClick={() => save(shown, false)}>
              📲 Guardar en el celu ({shown.length})
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" disabled={progress !== null} onClick={() => save(shown, true)}>
            ⬇️ Descargar .zip ({shown.length})
          </button>
          {progress !== null && shown.length > 1 && (
            <span className="gallery-progress" role="status">Bajando {progress}…</span>
          )}
        </div>
      )}
      {error && !open && <p className="notice notice--error" role="alert">{error}</p>}

      {shown.length === 0 ? (
        <p className="muted center hand">Todavía no hay fotos acá. ¡Que empiece la joda!</p>
      ) : (
        <ul className="gallery-grid">
          {shown.map((p) => (
            <li key={p.path}>
              <button type="button" className="gallery-item" onClick={() => setOpen(p)} aria-label={`${name(p.event.user_id)}: ${p.event.title}`}>
                {urls[p.path] ? (
                  <img src={urls[p.path]} alt="" loading="lazy" />
                ) : (
                  <span className="feed-photo--loading" style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />
                )}
                <span className="gallery-badge">{p.event.emoji}</span>
                {p.event.status !== 'approved' && (
                  <span className="gallery-status" title={p.event.status === 'pending' ? 'Esperando validación' : 'No validada'}>
                    {p.event.status === 'pending' ? '⏳' : '❌'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open !== null} title="Foto" onClose={() => setOpen(null)}>
        {open && (
          <>
            {urls[open.path] && <img className="lightbox-img" src={urls[open.path]} alt={open.event.title} />}
            <div className="gallery-caption">
              <p>
                <strong>{name(open.event.user_id)}</strong>{' '}
                {open.event.kind === 'quiebre' ? 'quebró 😵' : `· ${open.event.emoji} ${open.event.title}`}{' '}
                <span className={`pts-chip${open.event.points < 0 ? ' is-neg' : ''}${open.event.status !== 'approved' ? ' is-off' : ''}`}>
                  {formatPoints(open.event.points)}
                </span>
              </p>
              {open.event.detail && <p className="muted">“{open.event.detail}”</p>}
              <p className="muted small">
                {formatDay(open.event.day, today)} · {formatTime(open.event.created_at)}
                {open.event.kind === 'quiebre' && open.event.actor_id !== open.event.user_id && ` · la sacó ${name(open.event.actor_id)}`}
                {open.event.kind === 'burn' &&
                  (open.event.actor_id === userId ? ' · 🔥 quemada tuya' : ` · 🔥 quemada de ${name(open.event.actor_id)}`)}
                {open.event.status === 'pending' && ' · ⏳ esperando validación'}
                {open.event.status === 'rejected' && ' · ❌ no validada'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={progress !== null || !urls[open.path]}
              onClick={() => save([open], false)}
            >
              {progress !== null ? 'Bajando…' : shareable ? '📲 Guardar / compartir foto' : '⬇️ Descargar foto'}
            </button>
            {error && <p className="notice notice--error" role="alert">{error}</p>}
          </>
        )}
      </Sheet>
    </section>
  )
}
