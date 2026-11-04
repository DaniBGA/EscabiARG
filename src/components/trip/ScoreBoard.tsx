import { useState } from 'react'
import type { PlayerCard, TripEvent, TripMember } from '../../lib/api'
import { dayWinners, formatDay, scoreboard } from '../../lib/game'
import Avatar from '../Avatar'

type Props = {
  members: TripMember[]
  events: TripEvent[]
  cards: PlayerCard[]
  userId: string
  today: string
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function ScoreBoard({ members, events, cards, userId, today }: Props) {
  const [mode, setMode] = useState<'day' | 'all'>('day')
  const rows = scoreboard(members, events, mode === 'day' ? today : undefined)
  const names = new Map(members.map((m) => [m.user_id, m.profile?.display_name ?? '?']))
  const pastDays = [...new Set(events.map((e) => e.day))].filter((d) => d < today).sort().reverse()
  const cardsOf = (id: string) => cards.filter((c) => c.user_id === id && c.status !== 'used').length

  return (
    <section className="card-box" aria-labelledby="board-title">
      <div className="box-head">
        <h3 id="board-title" className="box-title">Tabla</h3>
        <div className="segmented" role="group" aria-label="Período">
          <button type="button" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Hoy</button>
          <button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>General</button>
        </div>
      </div>

      <ol className="board">
        {rows.map((r) => (
          <li key={r.userId} className={`board-row${r.userId === userId ? ' is-me' : ''}`}>
            <span className="board-rank">{r.points > 0 && r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</span>
            <Avatar id={r.userId} name={r.name} size={36} />
            <span className="board-name">
              {r.userId === userId ? `${r.name} (vos)` : r.name}
              {cardsOf(r.userId) > 0 && <small title="Comodines sin usar"> 🃏×{cardsOf(r.userId)}</small>}
            </span>
            <span className={`board-pts${r.points < 0 ? ' is-neg' : ''}`}>{r.points}</span>
          </li>
        ))}
      </ol>

      {mode === 'day' && (
        <p className="muted small">La jornada va de 6:00 a 6:00. El que más suma se lleva la ruleta.</p>
      )}

      {mode === 'all' && pastDays.length > 0 && (
        <>
          <h4 className="sub-title">Ganadores por jornada</h4>
          <ul className="winners">
            {pastDays.map((d) => {
              const w = dayWinners(events, d)
              return (
                <li key={d}>
                  <span className="winners-day">{formatDay(d, today)}</span>
                  <span>{w.length ? `🏆 ${w.map((id) => names.get(id) ?? '?').join(', ')}` : 'Sin ganador'}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
