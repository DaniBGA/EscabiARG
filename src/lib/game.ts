import type {
  CardKey,
  CasinoSession,
  ChefSpin,
  Duel,
  PlayerForfeit,
  DailyMission,
  Difficulty,
  MissionChallenge,
  PlayerCard,
  TripDetail,
  TripEvent,
  TripMember,
  TripRules,
} from './api'

// ---------- Comodines (las claves coinciden con card_catalog en la base) ----------

export type CardEffect = 'bonus' | 'steal' | 'double' | 'shield' | 'social'

export type CardDef = {
  key: CardKey
  emoji: string
  name: string
  description: string
  effect: CardEffect
  value: number
  weight: number
}

export const CARDS: CardDef[] = [
  { key: 'ronda_casa', emoji: '🎁', name: 'Ronda de la casa', description: '+20 puntos para vos al toque.', effect: 'bonus', value: 20, weight: 3 },
  { key: 'manotazo', emoji: '🦹', name: 'Manotazo', description: 'Le sacás 15 puntos a otro jugador y te los quedás.', effect: 'steal', value: 15, weight: 2 },
  { key: 'doble', emoji: '✌️', name: 'Doble o nada', description: 'Tu próximo trago suma el doble.', effect: 'double', value: 0, weight: 3 },
  { key: 'escudo', emoji: '🛡️', name: 'Escudo anti-quiebre', description: 'Si quebrás, esa vez no te restan puntos.', effect: 'shield', value: 0, weight: 2 },
  { key: 'dj', emoji: '🎧', name: 'DJ de la noche', description: 'Elegís la música durante una hora.', effect: 'social', value: 0, weight: 2 },
  { key: 'brindis', emoji: '🥂', name: 'Brindis en tu honor', description: 'Todos brindan por vos. Sí, todos.', effect: 'social', value: 0, weight: 2 },
]

export const cardDef = (key: CardKey) => CARDS.find((c) => c.key === key) ?? CARDS[0]

// ---------- Misiones ----------

export const DIFFICULTIES: { key: Difficulty; label: string; emoji: string; hint: string }[] = [
  { key: 'easy', label: 'Fácil', emoji: '🎯', hint: 'Tranqui, pocos puntos' },
  { key: 'medium', label: 'Intermedia', emoji: '🔥', hint: 'Un poco más de puntos' },
  { key: 'extreme', label: 'Extrema', emoji: '💀', hint: 'Muchos puntos' },
]

export const difficultyLabel = (d: Difficulty) => DIFFICULTIES.find((x) => x.key === d)?.label ?? d

export function missionPoints(rules: TripRules, d: Difficulty) {
  return d === 'easy' ? rules.mission_points_easy : d === 'medium' ? rules.mission_points_medium : rules.mission_points_extreme
}

// ---------- Jornadas (terminan a la hora que elige el organizador, hora Argentina = UTC-3) ----------

export const DEFAULT_CUTOFF_HOUR = 6

/** Jornada en formato YYYY-MM-DD (igual que trip_day_for() en la base) */
export function tripDay(cutoffHour = DEFAULT_CUTOFF_HOUR, at: Date | number = Date.now()) {
  const t = typeof at === 'number' ? at : at.getTime()
  return new Date(t - (3 + cutoffHour) * 3600_000).toISOString().slice(0, 10)
}

export const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`

// ---------- Previa y salida (dura una sola jornada) ----------

export type OutingState = 'open' | 'upcoming' | 'finished'

/** Igual que outing_state() en la base. Los viajes siempre están 'open'. */
export function outingState(
  trip: { kind?: string; trip_date: string | null; day_cutoff_hour?: number },
  now: Date | number = Date.now(),
): OutingState {
  if (trip.kind !== 'salida' || !trip.trip_date) return 'open'
  const today = tripDay(trip.day_cutoff_hour ?? DEFAULT_CUTOFF_HOUR, now)
  if (today < trip.trip_date) return 'upcoming'
  if (today > trip.trip_date) return 'finished'
  return 'open'
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function formatDay(day: string, today: string) {
  if (day === today) return 'Hoy'
  if (day === addDays(today, -1)) return 'Ayer'
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ---------- Puntajes ----------

export type ScoreRow = { userId: string; name: string; points: number; rank: number }

export function scoreboard(members: TripMember[], events: TripEvent[], day?: string): ScoreRow[] {
  const totals = new Map<string, number>(members.map((m) => [m.user_id, 0]))
  for (const e of events) {
    if (e.status !== 'approved' || (day && e.day !== day)) continue
    totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + e.points)
  }
  const names = new Map(members.map((m) => [m.user_id, m.profile?.display_name ?? '?']))
  const rows = [...totals.entries()]
    .map(([userId, points]) => ({ userId, name: names.get(userId) ?? '?', points, rank: 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es'))
  // Empates comparten puesto
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1
  })
  return rows
}

/** Ganadores de una jornada (puede haber empate). Hace falta sumar más de 0. */
export function dayWinners(events: TripEvent[], day: string): string[] {
  const totals = new Map<string, number>()
  for (const e of events) {
    if (e.day === day && e.status === 'approved') totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + e.points)
  }
  const top = Math.max(0, ...totals.values())
  if (top <= 0) return []
  return [...totals.entries()].filter(([, p]) => p === top).map(([id]) => id)
}

/** Jornadas terminadas que ganaste y todavía no giraste la ruleta */
export function pendingSpins(events: TripEvent[], cards: PlayerCard[], me: string, today: string) {
  const days = [...new Set(events.map((e) => e.day))].filter((d) => d < today).sort()
  const spun = new Set(cards.filter((c) => c.user_id === me).map((c) => c.won_day))
  return days.filter((d) => !spun.has(d) && dayWinners(events, d).includes(me))
}

export function myMissionToday(missions: DailyMission[], me: string, today: string) {
  return missions.find((m) => m.user_id === me && m.day === today) ?? null
}

export const formatPoints = (p: number) => (p > 0 ? `+${p}` : `${p}`)

// ---------- Validación de fotos ----------

/** Quiénes votan un trago/quiebre: todos menos quien lo cargó y a quien afecta */
export function eventVoters(e: TripEvent, members: TripMember[]) {
  return members.map((m) => m.user_id).filter((id) => id !== e.actor_id && id !== e.user_id)
}

export function eventTally(e: TripEvent, detail: Pick<TripDetail, 'eventVotes'>, members: TripMember[]) {
  const votes = detail.eventVotes.filter((v) => v.event_id === e.id)
  const eligible = eventVoters(e, members).length
  return {
    yes: votes.filter((v) => v.valid).length,
    no: votes.filter((v) => !v.valid).length,
    eligible,
    /** Votos "vale" que hacen falta para aprobar (más de la mitad) */
    needed: Math.floor(eligible / 2) + 1,
  }
}

// ---------- Votación de misiones ----------

export const ACTIVE_PHASES = ['vote_bad', 'proposals', 'vote_option'] as const

export const isActiveChallenge = (c: MissionChallenge) =>
  (ACTIVE_PHASES as readonly string[]).includes(c.phase)

export function phaseDeadline(c: MissionChallenge) {
  const iso = c.phase === 'vote_bad' ? c.bad_until : c.phase === 'proposals' ? c.proposals_until : c.voting_until
  return iso ? new Date(iso).getTime() : 0
}

export const secondsLeft = (deadline: number, now: number) => Math.max(0, Math.round((deadline - now) / 1000))

export function formatCountdown(sec: number) {
  const m = Math.floor(sec / 60)
  const s2 = sec % 60
  return m > 0 ? `${m}:${String(s2).padStart(2, '0')}` : `${s2}s`
}

/** Qué espera una acción tuya en este viaje */
export type PendingItem =
  | { type: 'event'; event: TripEvent }
  | { type: 'challenge'; challenge: MissionChallenge }
  | { type: 'chefJoin'; spin: ChefSpin }
  | { type: 'chefVote'; spin: ChefSpin }
  | { type: 'casinoReport'; session: CasinoSession }
  | { type: 'forfeit'; forfeit: PlayerForfeit }
  | { type: 'duelInvite'; duel: Duel }
  | { type: 'duelVote'; duel: Duel }

export function myPendingItems(detail: TripDetail, me: string, now = Date.now()): PendingItem[] {
  const members = detail.trip.members
  const items: PendingItem[] = []
  for (const e of detail.events) {
    if (e.status !== 'pending' || !eventVoters(e, members).includes(me)) continue
    if (detail.eventVotes.some((v) => v.event_id === e.id && v.voter_id === me)) continue
    items.push({ type: 'event', event: e })
  }
  for (const c of detail.challenges) {
    if (!isActiveChallenge(c) || c.target_user_id === me || phaseDeadline(c) <= now) continue
    const done =
      c.phase === 'vote_bad'
        ? detail.badVotes.some((v) => v.challenge_id === c.id && v.voter_id === me)
        : c.phase === 'proposals'
          ? detail.options.some((o) => o.challenge_id === c.id && o.author_id === me)
          : detail.optionVotes.some((v) => v.challenge_id === c.id && v.voter_id === me) ||
            !detail.options.some((o) => o.challenge_id === c.id && o.author_id !== me)
    if (!done) items.push({ type: 'challenge', challenge: c })
  }
  for (const s of detail.chefSpins) {
    if (s.status === 'joining' && !detail.chefPlayers.some((p) => p.spin_id === s.id && p.user_id === me)) {
      items.push({ type: 'chefJoin', spin: s })
    }
    if (
      s.status === 'voting' &&
      s.chosen_user_id !== me &&
      !detail.chefVotes.some((v) => v.spin_id === s.id && v.voter_id === me)
    ) {
      items.push({ type: 'chefVote', spin: s })
    }
  }
  for (const c of detail.casinoSessions) {
    const mine = detail.casinoPlayers.find((p) => p.session_id === c.id && p.user_id === me)
    const over = c.status === 'reporting' || (c.status === 'running' && Date.parse(c.ends_at) <= now)
    if (mine && !mine.reported_at && over && Date.parse(c.report_until) > now) {
      items.push({ type: 'casinoReport', session: c })
    }
  }
  for (const f of detail.playerForfeits) {
    if (f.user_id === me && f.status === 'to_do') items.push({ type: 'forfeit', forfeit: f })
  }
  for (const d of detail.duels) {
    if (d.status === 'invited' && d.opponent_id === me && Date.parse(d.created_at) + DUEL_INVITE_MS > now) {
      items.push({ type: 'duelInvite', duel: d })
    }
    if (isDanceVoting(d, now) && d.challenger_id !== me && d.opponent_id !== me &&
        !(detail.duelVotes ?? []).some((v) => v.duel_id === d.id && v.voter_id === me)) {
      items.push({ type: 'duelVote', duel: d })
    }
  }
  return items
}

// ---------- Duelos ----------

export const DUEL_INVITE_MS = 10 * 60_000
export const DUEL_MAX_SHOTS = 3
export const DUELS_PER_DAY = 3
export const FONDO_SECONDS = [15, 30, 60, 120]
export const SHOTS_SECONDS = [30, 60, 120, 180]
export const DANCE_SECONDS = [30, 60, 90]
/** Después del baile, el resto vota durante esto */
export const DANCE_VOTE_MS = 90_000

/** Cuándo termina la votación de un duelo de baile */
export const danceVoteUntil = (d: Duel) =>
  d.voting_until ? Date.parse(d.voting_until) : d.ends_at ? Date.parse(d.ends_at) + DANCE_VOTE_MS : 0

/** Duelo de baile en votación (o que terminó de bailarse y todavía no lo cerró nadie) */
export const isDanceVoting = (d: Duel, now = Date.now()) =>
  d.kind === 'baile' &&
  (d.status === 'voting' || (d.status === 'live' && !!d.ends_at && Date.parse(d.ends_at) <= now)) &&
  danceVoteUntil(d) > now

/** Duelo en vivo (o por arrancar, o en votación) donde participás */
export const myLiveDuel = (duels: Duel[], me: string) =>
  duels.find((d) => (d.status === 'live' || d.status === 'voting') && (d.challenger_id === me || d.opponent_id === me)) ?? null

/** Nombre del duelo según el modo */
export const duelLabel = (kind: Duel['kind'], boliche = false) =>
  kind === 'baile' ? 'duelo de baile' : kind === 'fondo' ? (boliche ? 'fondo blanco en la barra' : 'fondo blanco') : boliche ? 'shots en la barra' : 'shots'

export const formatDuelTime = (s: number) => (s < 60 ? `${s} s` : `${s / 60} min`)

export const activeChefSpin = (spins: ChefSpin[]) =>
  spins.find((s) => s.status === 'joining' || s.status === 'cooking' || s.status === 'voting') ?? null

export const activeCasino = (sessions: CasinoSession[]) =>
  sessions.find((c) => c.status === 'running' || c.status === 'reporting') ?? null

/** Puntos que todavía esperan validación */
export function pendingPoints(events: TripEvent[], me: string) {
  return events.filter((e) => e.status === 'pending' && e.user_id === me).reduce((sum, e) => sum + e.points, 0)
}
