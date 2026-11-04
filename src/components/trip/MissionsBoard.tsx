import { useState } from 'react'
import type { TripDetail } from '../../lib/api'
import { useApi } from '../../lib/authContext'
import { friendlyError } from '../../lib/errors'
import { DIFFICULTIES, isActiveChallenge, myPendingItems } from '../../lib/game'
import Avatar from '../Avatar'
import ChallengeCard from './ChallengeCard'

type Props = {
  detail: TripDetail
  me: string
  today: string
  now: number
  onChange: (message?: string) => void
}

/** Las misiones de hoy de todos los jugadores, con la opción de votar que una es mala */
export default function MissionsBoard({ detail, me, today, now, onChange }: Props) {
  const api = useApi()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const members = detail.trip.members
  // Las que esperan tu voto ya se muestran arriba, en "Pendientes"
  const pendingIds = new Set(
    myPendingItems(detail, me, now).flatMap((i) => (i.type === 'challenge' ? [i.challenge.id] : [])),
  )

  const challenge = async (missionId: string) => {
    setBusy(missionId)
    setError(null)
    try {
      await api.startMissionChallenge(missionId)
      onChange('🗳️ Votación abierta: si la mayoría dice que es mala, la cambian entre todos')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card-box card-box--missions" aria-labelledby="missions-title">
      <h3 id="missions-title" className="box-title">Misiones de hoy</h3>
      <ul className="missions-list">
        {members.map((m) => {
          const mission = detail.missions.find((x) => x.user_id === m.user_id && x.day === today)
          const c = mission ? detail.challenges.find((x) => x.mission_id === mission.id) : undefined
          const diff = mission ? DIFFICULTIES.find((d) => d.key === mission.difficulty) : undefined
          const isMe = m.user_id === me
          const name = m.profile?.display_name ?? '?'
          return (
            <li key={m.user_id} className="mission-row">
              <div className="mission-row-head">
                <Avatar id={m.user_id} name={name} size={32} />
                <strong>{isMe ? `${name} (vos)` : name}</strong>
                {diff && mission && (
                  <span className={`mission-chip difficulty--${mission.difficulty}`}>
                    {diff.emoji} {diff.label} · +{mission.points}
                  </span>
                )}
              </div>
              {!mission ? (
                <p className="muted small">Todavía no eligió su misión.</p>
              ) : (
                <>
                  <p className="mission-row-text">
                    {mission.mission}
                    {mission.group_assigned && <span className="badge-group">elegida por el grupo</span>}
                  </p>
                  {mission.completed_at ? (
                    <p className="mission-done small">✅ Cumplida</p>
                  ) : !isMe && !c ? (
                    <button
                      type="button"
                      className="link-btn"
                      disabled={busy !== null}
                      onClick={() => challenge(mission.id)}
                    >
                      Votar que es mala
                    </button>
                  ) : null}
                  {c && !pendingIds.has(c.id) && (isActiveChallenge(c) || c.phase === 'replaced' || c.phase === 'kept') && (
                    <ChallengeCard challenge={c} detail={detail} me={me} now={now} onChange={onChange} />
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </section>
  )
}
