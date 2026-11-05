import type { TripDetail } from './api'
import type { LiveChange } from './realtime'

type Row = Record<string, unknown>
type ListKey = Exclude<keyof TripDetail, 'trip' | 'serverTime'>

type TableSpec = {
  key: ListKey
  id: (row: Row) => string
  /** Dónde va una fila nueva: al principio (lo más nuevo primero) o al final */
  newest: 'first' | 'last'
  /** Filas que no se muestran (ej. tragos archivados) */
  hidden?: (row: Row) => boolean
  /** Lista ordenada por otro campo que puede cambiar */
  sort?: (a: Row, b: Row) => number
}

const byId = (row: Row) => String(row.id)
const pair = (a: string, b: string) => (row: Row) => `${String(row[a])}:${String(row[b])}`
const archived = (row: Row) => row.archived === true

const TABLES: Record<string, TableSpec> = {
  trip_drinks: {
    key: 'drinks',
    id: byId,
    newest: 'last',
    hidden: archived,
    sort: (a, b) => Number(a.points) - Number(b.points),
  },
  trip_events: { key: 'events', id: byId, newest: 'first' },
  daily_missions: { key: 'missions', id: byId, newest: 'last' },
  player_cards: { key: 'cards', id: byId, newest: 'last' },
  event_votes: { key: 'eventVotes', id: pair('event_id', 'voter_id'), newest: 'last' },
  mission_challenges: { key: 'challenges', id: byId, newest: 'first' },
  challenge_bad_votes: { key: 'badVotes', id: pair('challenge_id', 'voter_id'), newest: 'last' },
  challenge_options: { key: 'options', id: byId, newest: 'last' },
  challenge_option_votes: { key: 'optionVotes', id: pair('challenge_id', 'voter_id'), newest: 'last' },
  trip_infractions: { key: 'infractions', id: byId, newest: 'last', hidden: archived },
  trip_forfeits: { key: 'forfeits', id: byId, newest: 'last', hidden: archived },
  player_forfeits: { key: 'playerForfeits', id: byId, newest: 'first' },
  chef_spins: { key: 'chefSpins', id: byId, newest: 'first' },
  chef_spin_players: { key: 'chefPlayers', id: pair('spin_id', 'user_id'), newest: 'last' },
  chef_votes: { key: 'chefVotes', id: pair('spin_id', 'voter_id'), newest: 'last' },
  casino_sessions: { key: 'casinoSessions', id: byId, newest: 'first' },
  casino_players: { key: 'casinoPlayers', id: pair('session_id', 'user_id'), newest: 'last' },
  duels: { key: 'duels', id: byId, newest: 'first' },
  duel_results: { key: 'duelResults', id: pair('duel_id', 'user_id'), newest: 'last' },
  duel_votes: { key: 'duelVotes', id: pair('duel_id', 'voter_id'), newest: 'last' },
}

/** Cambios que no se pueden aplicar sueltos: hay que volver a pedir el viaje */
export function needsReload(change: LiveChange): boolean {
  if (change.t === 'trips') return change.op === 'DELETE'
  return !(change.t in TABLES)
}

function upsert(list: Row[], row: Row, spec: TableSpec): Row[] {
  const id = spec.id(row)
  const index = list.findIndex((item) => spec.id(item) === id)
  let next: Row[]
  if (spec.hidden?.(row)) {
    if (index === -1) return list
    next = list.filter((_, i) => i !== index)
  } else if (index === -1) {
    next = spec.newest === 'first' ? [row, ...list] : [...list, row]
  } else {
    next = list.slice()
    next[index] = { ...list[index], ...row }
  }
  return spec.sort ? next.slice().sort(spec.sort) : next
}

/**
 * Aplica un cambio que llegó en vivo al estado del viaje, sin pedir nada al servidor.
 * Para cambios que no sabe aplicar devuelve el mismo estado (ver needsReload).
 */
export function applyTripChange(detail: TripDetail, change: LiveChange): TripDetail {
  const row = change.row ?? {}

  if (change.t === 'trips') {
    if (change.op !== 'UPDATE' || row.id !== detail.trip.id) return detail
    return { ...detail, trip: { ...detail.trip, ...row, members: detail.trip.members } as TripDetail['trip'] }
  }

  const spec = TABLES[change.t]
  if (!spec) return detail
  if (row.trip_id !== undefined && row.trip_id !== detail.trip.id) return detail

  const list = detail[spec.key] as unknown as Row[]
  let next: Row[]
  if (change.op === 'DELETE') {
    const id = spec.id(row)
    next = list.filter((item) => spec.id(item) !== id)
    if (next.length === list.length) return detail
  } else {
    next = upsert(list, row, spec)
    if (next === list) return detail
  }
  return { ...detail, [spec.key]: next }
}

const INVITE_MS = 10 * 60_000

/**
 * Próxima hora (del servidor, en ms) en la que vence algo abierto: una votación de
 * misión, el casino o un duelo. Ahí hay que avisarle al servidor para que lo cierre.
 */
export function nextDeadline(detail: TripDetail): number | null {
  const times: number[] = []
  for (const c of detail.challenges) {
    const until =
      c.phase === 'vote_bad' ? c.bad_until
      : c.phase === 'proposals' ? c.proposals_until
      : c.phase === 'vote_option' ? c.voting_until
      : null
    if (until) times.push(Date.parse(until))
  }
  for (const s of detail.casinoSessions) {
    if (s.status === 'running') times.push(Date.parse(s.ends_at))
    else if (s.status === 'reporting') times.push(Date.parse(s.report_until))
  }
  for (const d of detail.duels) {
    if (d.status === 'invited') times.push(Date.parse(d.created_at) + INVITE_MS)
    else if (d.status === 'live' && d.ends_at) times.push(Date.parse(d.ends_at))
    else if (d.status === 'voting' && d.voting_until) times.push(Date.parse(d.voting_until))
  }
  const valid = times.filter((t) => Number.isFinite(t))
  return valid.length > 0 ? Math.min(...valid) : null
}
