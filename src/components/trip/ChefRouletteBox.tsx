import { useState } from 'react'
import type { ChefKind, TripDetail } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { activeChefSpin } from '../../lib/game'
import Avatar from '../Avatar'
import NameWheel from './NameWheel'
import PhotoPicker from './PhotoPicker'
import { uploadPhotos } from './uploadPhotos'

type Props = {
  detail: TripDetail
  me: string
  onChange: (message?: string) => void
}

const seenKey = (id: string) => `escabiarg:seen-spin:${id}`

function wasSeen(id: string) {
  try {
    return localStorage.getItem(seenKey(id)) === '1'
  } catch {
    return true
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(seenKey(id), '1')
  } catch {
    // nada
  }
}

/** "¿Quién cocina?" / "¿Quién prepara el trago?" */
export default function ChefRouletteBox({ detail, me, onChange }: Props) {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Blob[]>([])
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const members = detail.trip.members
  const name = (id: string | null) =>
    id === me ? 'vos' : members.find((m) => m.user_id === id)?.profile?.display_name ?? 'alguien'
  const spin = activeChefSpin(detail.chefSpins)
  const last = detail.chefSpins.find((s) => s.status === 'good' || s.status === 'bad')
  const lastChosen = detail.chefSpins.find((s) => s.chosen_user_id)?.chosen_user_id ?? null
  const what = (k: ChefKind) => (k === 'comida' ? 'cocina' : 'prepara el trago')

  // La primera vez que ves el resultado, la ruleta gira
  const spinning = Boolean(spin && spin.chosen_user_id && !revealed[spin.id] && !wasSeen(spin.id))

  const run = async (fn: () => Promise<void>, message?: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChange(message)
      return true
    } catch (err) {
      setError(friendlyError(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const joined = spin ? detail.chefPlayers.filter((p) => p.spin_id === spin.id).map((p) => p.user_id) : []
  const votes = spin ? detail.chefVotes.filter((v) => v.spin_id === spin.id) : []
  const eligible = spin ? members.filter((m) => m.user_id !== spin.chosen_user_id).length : 0
  const needed = Math.floor(eligible / 2) + 1
  const wheelPlayers = members.map((m) => ({ id: m.user_id, name: m.profile?.display_name ?? '?' }))

  return (
    <section className="card-box" id="chef" aria-labelledby="chef-title">
      <h3 id="chef-title" className="box-title">👨‍🍳 ¿Quién cocina?</h3>

      {!spin && (
        <>
          <p className="muted">
            La ruleta elige quién cocina o prepara el trago. Se tienen que meter <strong>todos</strong> para que gire y
            nunca le toca al mismo que la vez anterior.
            {lastChosen && (lastChosen === me
              ? <> Esta vez zafás <strong>vos</strong>.</>
              : <> Esta vez zafa <strong>{name(lastChosen)}</strong>.</>)}
          </p>
          <div className="vote-row chef-start">
            <button type="button" className="btn btn--primary" disabled={busy}
              onClick={() => run(() => api.startChefSpin(detail.trip.id, 'comida'), '🍳 ¡Ruleta armada! Que se metan todos')}>
              🍳 ¿Quién cocina?
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy}
              onClick={() => run(() => api.startChefSpin(detail.trip.id, 'trago'), '🍹 ¡Ruleta armada! Que se metan todos')}>
              🍹 ¿Quién prepara el trago?
            </button>
          </div>
          {last && (
            <p className="muted small">
              La última: le tocó a {name(last.chosen_user_id)}{' '}
              {last.status === 'good' ? `y salió bueno (+${detail.trip.chef_points}) 👏` : 'y no salió bueno: le tocó prenda 🙈'}
            </p>
          )}
        </>
      )}

      {spin?.status === 'joining' && (
        <>
          <p className="chef-q">Ruleta: ¿quién {what(spin.kind)}?</p>
          <ul className="joined-list">
            {members.map((m) => (
              <li key={m.user_id} className={joined.includes(m.user_id) ? 'is-in' : ''}>
                <Avatar id={m.user_id} name={m.profile?.display_name ?? '?'} size={30} />
                <span>{m.user_id === me ? 'Vos' : m.profile?.display_name}</span>
                <span aria-label={joined.includes(m.user_id) ? 'adentro' : 'falta'}>{joined.includes(m.user_id) ? '✅' : '⏳'}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Faltan {members.length - joined.length}. Gira sola cuando se metan todos.</p>
          <div className="vote-row">
            {!joined.includes(me) && (
              <button type="button" className="btn btn--primary" disabled={busy}
                onClick={() => run(() => api.joinChefSpin(spin.id), '🎡 Adentro de la ruleta')}>
                🎡 Meterme a la ruleta
              </button>
            )}
            {(spin.started_by === me || detail.trip.owner_id === me) && (
              <button type="button" className="btn btn--ghost" disabled={busy}
                onClick={() => run(() => api.cancelChefSpin(spin.id), 'Ruleta cancelada')}>
                Cancelar
              </button>
            )}
          </div>
        </>
      )}

      {spin && (spin.status === 'cooking' || spin.status === 'voting') && (
        <>
          {spinning && (
            <div className="wheel-wrap">
              <NameWheel
                players={wheelPlayers}
                targetId={spin.chosen_user_id}
                animate
                onDone={() => {
                  markSeen(spin.id)
                  setRevealed((r) => ({ ...r, [spin.id]: true }))
                }}
              />
            </div>
          )}
          {!spinning && (
            <p className="chef-result">
              {spin.kind === 'comida' ? '🍳' : '🍹'} Le tocó a <strong>{name(spin.chosen_user_id)}</strong>
            </p>
          )}

          {spin.status === 'cooking' && !spinning && (
            spin.chosen_user_id === me ? (
              <div className="sheet-stack">
                <p className="muted">Cuando esté listo, avisá y el grupo vota si salió bueno.</p>
                <PhotoPicker photos={photos} onChange={setPhotos} label={spin.kind === 'comida' ? 'Foto del plato (opcional)' : 'Foto del trago (opcional)'} />
                <button type="button" className="btn btn--primary btn--block" disabled={busy}
                  onClick={async () => {
                    const ok = await run(async () => {
                      const [path] = photos.length ? await uploadPhotos(api, detail.trip.id, me, photos) : [null]
                      await api.chefReady(spin.id, path)
                    }, '🗳️ ¡A votar si salió bueno!')
                    if (ok) setPhotos([])
                  }}>
                  ¡Está listo! Que voten
                </button>
              </div>
            ) : (
              <p className="muted">Esperando que {name(spin.chosen_user_id)} termine… 👀</p>
            )
          )}

          {spin.status === 'voting' && (
            <>
              <p className="muted small">
                {votes.filter((v) => v.good).length} de {needed} votos "salió bueno" · Si sale bueno suma +{detail.trip.chef_points}, si no, prenda.
              </p>
              {spin.chosen_user_id === me ? (
                <p className="muted">Tus amigos están probando… 🤞</p>
              ) : (
                <div className="vote-row">
                  <button type="button" className="btn btn--primary" disabled={busy}
                    onClick={() => run(() => api.voteChef(spin.id, true), '😋 Votaste que salió bueno')}>
                    😋 Salió bueno
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={busy}
                    onClick={() => run(() => api.voteChef(spin.id, false), '🤢 Votaste que salió malo')}>
                    🤢 Salió malo
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </section>
  )
}
