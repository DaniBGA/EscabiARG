import type {
  Api,
  CardKey,
  CasinoPlayer,
  CasinoSession,
  ChefSpin,
  ChefSpinPlayer,
  ChefVote,
  Duel,
  DuelResult,
  Forfeit,
  Infraction,
  PlayerForfeit,
  ChallengeBadVote,
  ChallengeOption,
  ChallengeOptionVote,
  DailyMission,
  Drink,
  EventVote,
  MissionChallenge,
  NewTrip,
  PlayerCard,
  Profile,
  Trip,
  TripDetail,
  TripEvent,
  TripRules,
} from './api'
import { clearDemoPhotos, demoPhotoUrls, saveDemoPhoto, seedPhotoPath } from './demoPhotos'
import {
  CARDS,
  DEFAULT_CUTOFF_HOUR,
  DUEL_INVITE_MS,
  DUEL_MAX_SHOTS,
  DUELS_PER_DAY,
  addDays,
  cardDef,
  difficultyLabel,
  eventVoters,
  isActiveChallenge,
  missionPoints,
  myPendingItems,
  outingState,
  tripDay,
} from './game'
import { MISSIONS } from './missions'
import { SUGGESTED_FORFEITS, SUGGESTED_INFRACTIONS, formatMoney } from './lists'

/**
 * Modo demo: datos de ejemplo guardados solo en este navegador (localStorage + IndexedDB).
 * Replica las reglas del servidor, y los otros jugadores (Juli y Tincho) votan solos
 * a los pocos segundos para que se pueda probar todo sin más gente.
 */

export const DEMO_USER_ID = 'demo-me'
const STORAGE_KEY = 'escabiarg:demo-data'
const VERSION = 6

type StoredTrip = Omit<Trip, 'members'> &
  TripRules & {
    members: { user_id: string; role: 'owner' | 'member' }[]
  }

type DemoData = {
  version: number
  me: Profile
  people: Profile[]
  friendIds: string[]
  trips: StoredTrip[]
  drinks: (Drink & { archived: boolean })[]
  events: (TripEvent & { card_id?: string | null })[]
  missions: DailyMission[]
  cards: PlayerCard[]
  eventVotes: (EventVote & { trip_id: string })[]
  challenges: MissionChallenge[]
  badVotes: (ChallengeBadVote & { trip_id: string })[]
  options: (ChallengeOption & { trip_id: string })[]
  optionVotes: (ChallengeOptionVote & { trip_id: string })[]
  infractions: (Infraction & { archived: boolean })[]
  forfeits: (Forfeit & { archived: boolean })[]
  playerForfeits: PlayerForfeit[]
  chefSpins: ChefSpin[]
  chefPlayers: (ChefSpinPlayer & { trip_id: string })[]
  chefVotes: (ChefVote & { trip_id: string })[]
  casinoSessions: CasinoSession[]
  casinoPlayers: (CasinoPlayer & { trip_id: string })[]
  duels: Duel[]
  duelResults: (DuelResult & { trip_id: string })[]
}

const PEOPLE: Profile[] = [
  { id: 'demo-juli', display_name: 'Juli', friend_code: 'JULI23' },
  { id: 'demo-tincho', display_name: 'Tincho', friend_code: 'TINCH2' },
  { id: 'demo-colo', display_name: 'El Colo', friend_code: 'COLO22' },
  { id: 'demo-sofi', display_name: 'Sofi', friend_code: 'SOFI99' },
  { id: 'demo-nacho', display_name: 'Nacho', friend_code: 'NACHO7' },
]

/** Códigos de gente que todavía no es tu amiga, para probar "agregar por código" */
export const DEMO_FRIEND_CODES = ['COLO22', 'SOFI99', 'NACHO7']

/** Lo que proponen los jugadores de ejemplo cuando se vota una misión */
const BOT_OPTIONS = [
  'Bailá una cumbia con alguien que no conocías.',
  'Hacé de DJ 10 minutos sin poner reggaetón.',
  'Cantá el himno con voz de Gardel.',
  'Conseguí que todo el grupo diga "¡aguante!" a la vez.',
]

const DEFAULT_RULES: TripRules = {
  mission_points_easy: 10,
  mission_points_medium: 25,
  mission_points_extreme: 50,
  quiebre_penalty: 30,
  day_cutoff_hour: DEFAULT_CUTOFF_HOUR,
  chef_points: 20,
  casino_points: 30,
  duel_points: 15,
}

function seedLists(tripId: string) {
  return {
    infractions: SUGGESTED_INFRACTIONS.map((i) => ({ id: newId(), trip_id: tripId, ...i, archived: false })),
    forfeits: SUGGESTED_FORFEITS.map((text) => ({ id: newId(), trip_id: tripId, text, archived: false })),
  }
}

// Tiempos de las votaciones (iguales a la base)
const BAD_VOTE_MS = 10 * 60_000
const PROPOSALS_MS = 3 * 60_000
const OPTION_VOTE_MS = 60_000

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function nextSaturday() {
  const d = new Date()
  d.setDate(d.getDate() + (((6 - d.getDay() + 7) % 7) || 7))
  return isoDate(d)
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`

const iso = (ms: number) => new Date(ms).toISOString()

function seed(): DemoData {
  const now = Date.now()
  const today = tripDay(DEFAULT_CUTOFF_HOUR, now)
  const yesterday = addDays(today, -1)
  const ago = (min: number) => iso(now - min * 60_000)
  const T1 = 'demo-trip-1'
  const T2 = 'demo-trip-2'

  const drinks: DemoData['drinks'] = [
    { id: 'd-birra', trip_id: T1, name: 'Birra', emoji: '🍺', points: 5, archived: false },
    { id: 'd-fernet', trip_id: T1, name: 'Fernet con coca', emoji: '🥃', points: 10, archived: false },
    { id: 'd-gin', trip_id: T1, name: 'Gin tonic', emoji: '🍸', points: 8, archived: false },
    { id: 'd-vino', trip_id: T1, name: 'Vino', emoji: '🍷', points: 6, archived: false },
    { id: 'd-agua', trip_id: T1, name: 'Vaso de agua', emoji: '💧', points: 2, archived: false },
    { id: 'd2-birra', trip_id: T2, name: 'Birra', emoji: '🍺', points: 5, archived: false },
    { id: 'd2-fernet', trip_id: T2, name: 'Fernet con coca', emoji: '🥃', points: 10, archived: false },
  ]

  const ev = (
    user: string,
    kind: TripEvent['kind'],
    points: number,
    day: string,
    minutesAgo: number,
    title: string,
    emoji: string,
    extra: Partial<TripEvent> = {},
  ): TripEvent => ({
    id: newId(),
    trip_id: T1,
    user_id: user,
    actor_id: user,
    kind,
    points,
    day,
    title,
    emoji,
    detail: null,
    photo_paths: [seedPhotoPath(emoji, 20 + Math.round(Math.random() * 30))],
    created_at: ago(minutesAgo),
    status: 'approved',
    ...extra,
  })

  // Pendientes para que valides vos: un Fernet de Tincho y un quiebre de Juli
  const pendingFernet = ev('demo-tincho', 'drink', 10, today, 6, 'Fernet con coca', '🥃', { status: 'pending' })
  const pendingQuiebre = ev('demo-juli', 'quiebre', -30, today, 3, 'Quebró', '😵', {
    actor_id: 'demo-tincho',
    status: 'pending',
  })

  // Ayer ganaste vos (40 pts) → tenés la ruleta pendiente
  const events: TripEvent[] = [
    pendingQuiebre,
    pendingFernet,
    ev('demo-juli', 'drink', 5, today, 25, 'Birra', '🍺'),
    ev('demo-juli', 'quiebre', -30, yesterday, 18 * 60, 'Quebró', '😵', { actor_id: 'demo-tincho' }),
    ev('demo-me', 'mission', 25, yesterday, 19 * 60, 'Misión intermedia cumplida', '🔥', {
      detail: MISSIONS.medium[1],
      photo_paths: [],
    }),
    ev('demo-tincho', 'mission', 10, yesterday, 20 * 60, 'Misión fácil cumplida', '🎯', {
      detail: MISSIONS.easy[0],
      photo_paths: [],
    }),
    ev('demo-juli', 'drink', 8, yesterday, 21 * 60, 'Gin tonic', '🍸'),
    ev('demo-tincho', 'drink', 10, yesterday, 22 * 60, 'Fernet con coca', '🥃'),
    ev('demo-me', 'drink', 10, yesterday, 22 * 60 + 10, 'Fernet con coca', '🥃'),
    ev('demo-tincho', 'drink', 5, yesterday, 23 * 60, 'Birra', '🍺'),
    ev('demo-me', 'drink', 5, yesterday, 23 * 60 + 20, 'Birra', '🍺'),
  ]

  const mission = (user: string, day: string, difficulty: DailyMission['difficulty'], text: string, done: boolean): DailyMission => ({
    id: newId(),
    trip_id: T1,
    user_id: user,
    day,
    difficulty,
    mission: text,
    points: missionPoints(DEFAULT_RULES, difficulty),
    completed_at: done ? ago(19 * 60) : null,
    photo_path: null,
    group_assigned: false,
  })

  const juliToday = mission('demo-juli', today, 'easy', MISSIONS.easy[4], false)
  const missions: DailyMission[] = [
    mission('demo-me', yesterday, 'medium', MISSIONS.medium[1], true),
    mission('demo-tincho', yesterday, 'easy', MISSIONS.easy[0], true),
    juliToday,
    mission('demo-tincho', today, 'medium', MISSIONS.medium[5], false),
  ]

  // Tincho dice que la misión de Juli es muy fácil: falta tu voto
  const challengeId = newId()
  const challenges: MissionChallenge[] = [
    {
      id: challengeId,
      trip_id: T1,
      mission_id: juliToday.id,
      target_user_id: 'demo-juli',
      started_by: 'demo-tincho',
      phase: 'vote_bad',
      bad_until: iso(now + BAD_VOTE_MS),
      proposals_until: null,
      voting_until: null,
      winner_option_id: null,
      created_at: iso(now),
    },
  ]

  const lists1 = seedLists(T1)
  const lists2 = seedLists(T2)
  // Ayer Tincho reportó que te levantaste tarde: tenés una prenda pendiente
  const lateEvent = ev('demo-me', 'infraction', 0, yesterday, 15 * 60, 'Levantarse tarde', '😴', {
    actor_id: 'demo-tincho',
  })
  events.push(lateEvent)

  return {
    version: VERSION,
    me: { id: DEMO_USER_ID, display_name: 'Vos', friend_code: 'DEMO42' },
    people: PEOPLE,
    friendIds: ['demo-juli', 'demo-tincho'],
    trips: [
      {
        id: T1,
        kind: 'viaje',
        owner_id: DEMO_USER_ID,
        name: 'Finde en la costa',
        trip_date: yesterday,
        place: 'Villa Gesell',
        created_at: ago(60 * 26),
        ...DEFAULT_RULES,
        members: [
          { user_id: DEMO_USER_ID, role: 'owner' },
          { user_id: 'demo-juli', role: 'member' },
          { user_id: 'demo-tincho', role: 'member' },
        ],
      },
      {
        id: T2,
        kind: 'salida',
        owner_id: 'demo-tincho',
        name: 'Previa del sábado',
        trip_date: nextSaturday(),
        place: 'Lo de Tincho',
        created_at: ago(60),
        ...DEFAULT_RULES,
        members: [
          { user_id: 'demo-tincho', role: 'owner' },
          { user_id: DEMO_USER_ID, role: 'member' },
          { user_id: 'demo-juli', role: 'member' },
        ],
      },
    ],
    drinks,
    events,
    missions,
    cards: [],
    eventVotes: [{ event_id: pendingFernet.id, trip_id: T1, voter_id: 'demo-juli', valid: true }],
    challenges,
    badVotes: [{ challenge_id: challengeId, trip_id: T1, voter_id: 'demo-tincho', bad: true }],
    options: [],
    optionVotes: [],
    infractions: [...lists1.infractions, ...lists2.infractions],
    forfeits: [...lists1.forfeits, ...lists2.forfeits],
    playerForfeits: [
      {
        id: newId(),
        trip_id: T1,
        user_id: DEMO_USER_ID,
        source: 'infraction',
        reason: 'Levantarse tarde',
        forfeit: SUGGESTED_FORFEITS[1],
        status: 'to_do',
        created_at: lateEvent.created_at,
        done_at: null,
      },
    ],
    chefSpins: [],
    chefPlayers: [],
    chefVotes: [],
    casinoSessions: [],
    casinoPlayers: [],
    duels: [],
    duelResults: [],
  }
}

// Si localStorage no está disponible (modo privado, etc.) se usa memoria
let memory: DemoData | null = null

function load(): DemoData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoData
      if (parsed.version === VERSION) return parsed
    }
  } catch {
    // seguimos con memoria / datos nuevos
  }
  if (!memory || memory.version !== VERSION) {
    memory = seed()
    save(memory)
  }
  return memory
}

function save(data: DemoData) {
  memory = data
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // sin persistencia: queda en memoria hasta recargar
  }
}

export function resetDemoData() {
  memory = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nada que borrar
  }
  void clearDemoPhotos()
}

/** Pequeña demora para que se sienta como una app real */
const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms))

const byName = (a: Profile, b: Profile) => a.display_name.localeCompare(b.display_name, 'es')

function everyone(data: DemoData) {
  return [data.me, ...data.people]
}

function withProfiles(data: DemoData, trip: StoredTrip) {
  const all = everyone(data)
  return {
    ...trip,
    members: trip.members.map((m) => {
      const p = all.find((e) => e.id === m.user_id)
      return { ...m, profile: p ? { id: p.id, display_name: p.display_name } : null }
    }),
  }
}

function tripFor(data: DemoData, tripId: string) {
  const trip = data.trips.find((t) => t.id === tripId)
  if (!trip || !trip.members.some((m) => m.user_id === data.me.id)) throw new Error('NOT_TRIP_MEMBER')
  return trip
}

/** Igual que el candado de la base: en una salida cerrada o futura no se carga nada nuevo */
function requireOpen(data: DemoData, tripId: string) {
  const trip = tripFor(data, tripId)
  const st = outingState(trip)
  if (st === 'upcoming') throw new Error('OUTING_NOT_STARTED')
  if (st === 'finished') throw new Error('OUTING_FINISHED')
  return trip
}

function requireOwner(data: DemoData, tripId: string) {
  const trip = tripFor(data, tripId)
  if (trip.owner_id !== data.me.id) throw new Error('permission denied')
  return trip
}

const todayOf = (trip: StoredTrip) => tripDay(trip.day_cutoff_hour)

function addEvent(
  data: DemoData,
  e: Omit<TripEvent, 'id' | 'created_at' | 'day' | 'detail' | 'photo_paths' | 'status'> & Partial<TripEvent> & { card_id?: string | null },
) {
  const trip = data.trips.find((t) => t.id === e.trip_id)
  const event = {
    id: newId(),
    created_at: new Date().toISOString(),
    day: trip ? todayOf(trip) : tripDay(),
    detail: null,
    photo_paths: [],
    status: 'approved' as const,
    ...e,
  }
  data.events.unshift(event)
  return event
}

const usedPhotos = (data: DemoData, tripId: string) =>
  new Set([
    ...data.events.filter((e) => e.trip_id === tripId).flatMap((e) => e.photo_paths),
    ...data.missions.filter((m) => m.trip_id === tripId && m.photo_path).map((m) => m.photo_path as string),
  ])

function checkPhoto(data: DemoData, tripId: string, path: string | null, code = 'PHOTO_REQUIRED') {
  if (!path || !path.startsWith(`demo/${tripId}/`) || usedPhotos(data, tripId).has(path)) throw new Error(code)
}

// ---------- Reglas de votación (iguales a la base) ----------

function membersOf(data: DemoData, tripId: string) {
  return data.trips.find((t) => t.id === tripId)?.members ?? []
}

function resolveEvent(data: DemoData, e: DemoData['events'][number]) {
  if (e.status !== 'pending') return
  const eligible = eventVoters(e, membersOf(data, e.trip_id) as TripDetail['trip']['members']).length
  const votes = data.eventVotes.filter((v) => v.event_id === e.id)
  const yes = votes.filter((v) => v.valid).length
  const no = votes.length - yes
  if (eligible === 0 || yes * 2 > eligible) {
    if (e.kind === 'quiebre') {
      const shield = data.cards.find(
        (c) => c.trip_id === e.trip_id && c.user_id === e.user_id && c.status === 'active' && cardDef(c.card_key).effect === 'shield',
      )
      if (shield) {
        shield.status = 'used'
        e.points = 0
        e.title = 'Quebró, pero lo salvó el escudo'
      }
    }
    e.status = 'approved'
    if (e.kind === 'infraction') assignForfeit(data, e.trip_id, e.user_id, 'infraction', e.title)
  } else if (no * 2 >= eligible) {
    if (e.kind === 'drink' && e.card_id) {
      const card = data.cards.find((c) => c.id === e.card_id)
      if (card && card.status === 'used') card.status = 'active'
    }
    e.status = 'rejected'
  }
  if (e.status !== 'pending' && e.kind === 'casino' && e.ref_id) {
    const session = data.casinoSessions.find((c) => c.id === e.ref_id)
    if (session) resolveCasino(data, session)
  }
}

function assignForfeit(data: DemoData, tripId: string, userId: string, source: PlayerForfeit['source'], reason: string) {
  const pool = data.forfeits.filter((f) => f.trip_id === tripId && !f.archived)
  const pick = pool[Math.floor(Math.random() * pool.length)]
  data.playerForfeits.unshift({
    id: newId(),
    trip_id: tripId,
    user_id: userId,
    source,
    reason,
    forfeit: pick?.text ?? 'Lavar los platos de todos.',
    status: 'to_do',
    created_at: new Date().toISOString(),
    done_at: null,
  })
}

function chefTrySpin(data: DemoData, spin: ChefSpin) {
  if (spin.status !== 'joining') return
  const members = membersOf(data, spin.trip_id)
  const joined = data.chefPlayers.filter((p) => p.spin_id === spin.id).length
  if (joined < members.length) return
  const previous = data.chefSpins
    .filter((x) => x.trip_id === spin.trip_id && x.id !== spin.id && x.chosen_user_id)
    .sort((a, b) => (b.spun_at ?? '').localeCompare(a.spun_at ?? ''))[0]?.chosen_user_id ?? null
  const candidates = members.map((m) => m.user_id).filter((id) => members.length === 1 || id !== previous)
  spin.chosen_user_id = candidates[Math.floor(Math.random() * candidates.length)]
  spin.excluded_user_id = previous
  spin.status = 'cooking'
  spin.spun_at = new Date().toISOString()
}

function resolveChef(data: DemoData, spin: ChefSpin) {
  if (spin.status !== 'voting' || !spin.chosen_user_id) return
  const trip = data.trips.find((t) => t.id === spin.trip_id)
  const eligible = membersOf(data, spin.trip_id).filter((m) => m.user_id !== spin.chosen_user_id).length
  const votes = data.chefVotes.filter((v) => v.spin_id === spin.id)
  const good = votes.filter((v) => v.good).length
  const bad = votes.length - good
  const what = spin.kind === 'comida' ? 'la comida' : 'el trago'
  const base = {
    trip_id: spin.trip_id,
    user_id: spin.chosen_user_id,
    actor_id: spin.chosen_user_id,
    kind: 'chef' as const,
    photo_paths: spin.photo_path ? [spin.photo_path] : [],
    ref_id: spin.id,
  }
  if (eligible === 0 || good * 2 > eligible) {
    addEvent(data, {
      ...base,
      points: trip?.chef_points ?? 20,
      title: spin.kind === 'comida' ? 'Cocinó y salió bueno' : 'Preparó un trago de 10',
      emoji: spin.kind === 'comida' ? '👨‍🍳' : '🍹',
    })
    spin.status = 'good'
  } else if (bad * 2 >= eligible) {
    addEvent(data, { ...base, points: 0, title: `No salió bueno ${what}: le toca prenda`, emoji: '🤢' })
    assignForfeit(data, spin.trip_id, spin.chosen_user_id, 'chef', `No salió bueno ${what}`)
    spin.status = 'bad'
  }
}

const fmtSeconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

function resolveDuel(data: DemoData, d: Duel, now = Date.now()) {
  if (d.status === 'invited') {
    if (now >= Date.parse(d.created_at) + DUEL_INVITE_MS) d.status = 'cancelled'
    return
  }
  if (d.status !== 'live' || !d.starts_at || !d.ends_at) return
  const res = (id: string) => data.duelResults.find((r) => r.duel_id === d.id && r.user_id === id) as DuelResult
  const a = res(d.challenger_id)
  const b = res(d.opponent_id)
  const start = Date.parse(d.starts_at)
  const ended =
    now >= Date.parse(d.ends_at) ||
    a.gave_up ||
    b.gave_up ||
    (d.kind === 'fondo' && a.finished_at && b.finished_at) ||
    (d.kind === 'shots' && a.shots >= DUEL_MAX_SHOTS && b.shots >= DUEL_MAX_SHOTS)
  if (!ended) return

  let winner: DuelResult | null = null
  if (a.gave_up && !b.gave_up) winner = b
  else if (b.gave_up && !a.gave_up) winner = a
  else if (d.kind === 'fondo') {
    const done = [a, b].filter((r) => r.finished_at && !r.gave_up)
    winner = done.sort((x, y) => Date.parse(x.finished_at!) - Date.parse(y.finished_at!))[0] ?? null
  } else {
    const best = [a, b].sort((x, y) => y.shots - x.shots || Date.parse(x.last_shot_at ?? '') - Date.parse(y.last_shot_at ?? ''))[0]
    winner = best.shots > 0 ? best : null
  }

  if (winner) {
    const loser = winner === a ? b : a
    const trip = data.trips.find((t) => t.id === d.trip_id)
    const detail =
      d.kind === 'fondo'
        ? `Terminó en ${fmtSeconds(Date.parse(winner.finished_at!) - start)}` +
          (loser.gave_up ? ' · el otro se bajó' : !loser.finished_at ? ' · el otro no llegó' : ` · el otro tardó ${fmtSeconds(Date.parse(loser.finished_at) - start)}`)
        : `${winner.shots} a ${loser.shots}${loser.gave_up ? ' · el otro se bajó' : ''}`
    const e = addEvent(data, {
      trip_id: d.trip_id,
      user_id: winner.user_id,
      actor_id: loser.user_id,
      kind: 'duel',
      points: trip?.duel_points ?? 15,
      day: d.day,
      title: d.kind === 'fondo' ? 'Ganó el duelo de fondo blanco' : 'Ganó el duelo de shots',
      emoji: '⚔️',
      detail,
      status: 'pending',
      ref_id: d.id,
    })
    d.event_id = e.id
    resolveEvent(data, e)
  }
  d.winner_id = winner?.user_id ?? null
  d.status = 'done'
}

/** Ritmo de cada jugador de ejemplo (fijo por duelo) */
function botPace(duelId: string, botId: string) {
  let h = 0
  for (const ch of duelId + botId) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h) % 1000 / 1000
}

function resolveCasino(data: DemoData, c: CasinoSession, now = Date.now()) {
  if (c.status === 'done' || c.status === 'cancelled') return
  if (c.status === 'running') {
    if (now < Date.parse(c.ends_at)) return
    c.status = 'reporting'
  }
  const players = data.casinoPlayers.filter((p) => p.session_id === c.id)
  const eventOf = (p: CasinoPlayer) => data.events.find((e) => e.id === p.event_id)
  const missing = players.some((p) => !p.reported_at)
  const pending = players.some((p) => eventOf(p)?.status === 'pending')
  if ((missing || pending) && now < Date.parse(c.report_until)) return
  const approved = players.filter((p) => eventOf(p)?.status === 'approved' && p.amount !== null)
  const top = Math.max(-Infinity, ...approved.map((p) => p.amount as number))
  if (top > 0) {
    for (const p of approved.filter((x) => x.amount === top)) {
      addEvent(data, {
        trip_id: c.trip_id,
        user_id: p.user_id,
        actor_id: p.user_id,
        kind: 'casino',
        points: c.prize,
        title: 'Ganó el casino',
        emoji: '🎰',
        detail: formatMoney(top),
        ref_id: c.id,
      })
    }
  }
  c.status = 'done'
}

function resolveChallenge(data: DemoData, c: MissionChallenge, now = Date.now()) {
  if (!isActiveChallenge(c)) return
  const eligible = membersOf(data, c.trip_id).filter((m) => m.user_id !== c.target_user_id).length

  if (c.phase === 'vote_bad') {
    const votes = data.badVotes.filter((v) => v.challenge_id === c.id)
    const bad = votes.filter((v) => v.bad).length
    const ok = votes.length - bad
    if (bad * 2 > eligible) {
      c.phase = 'proposals'
      c.proposals_until = iso(now + PROPOSALS_MS)
    } else if (ok * 2 >= eligible || now >= Date.parse(c.bad_until)) {
      c.phase = 'kept'
      return
    } else return
  }

  const opts = data.options.filter((o) => o.challenge_id === c.id)
  if (c.phase === 'proposals') {
    if (opts.length < eligible && now < Date.parse(c.proposals_until ?? '')) return
    if (opts.length === 0) {
      c.phase = 'kept'
      return
    }
    if (opts.length > 1) {
      c.phase = 'vote_option'
      c.voting_until = iso(now + OPTION_VOTE_MS)
      return
    }
  } else if (c.phase === 'vote_option') {
    const votes = data.optionVotes.filter((v) => v.challenge_id === c.id)
    const canVote = membersOf(data, c.trip_id).filter(
      (m) => m.user_id !== c.target_user_id && opts.some((o) => o.author_id !== m.user_id),
    ).length
    if (now < Date.parse(c.voting_until ?? '') && votes.length < canVote) return
  }

  // Asignar la más votada (empate: al azar)
  const count = (id: string) => data.optionVotes.filter((v) => v.option_id === id).length
  const top = Math.max(...opts.map((o) => count(o.id)))
  const best = opts.filter((o) => count(o.id) === top)
  const winner = best[Math.floor(Math.random() * best.length)]
  const mission = data.missions.find((m) => m.id === c.mission_id)
  if (mission) {
    mission.mission = winner.text
    mission.group_assigned = true
  }
  c.phase = 'replaced'
  c.winner_option_id = winner.id
}

/** Los jugadores de ejemplo votan y proponen solos, con unos segundos de demora */
function botsAct(data: DemoData, now = Date.now()) {
  for (const trip of data.trips) {
    const bots = trip.members.map((m) => m.user_id).filter((id) => id !== data.me.id)

    for (const e of data.events) {
      if (e.trip_id !== trip.id || e.status !== 'pending') continue
      bots.forEach((bot, i) => {
        if (bot === e.actor_id || bot === e.user_id) return
        if (data.eventVotes.some((v) => v.event_id === e.id && v.voter_id === bot)) return
        if (now - Date.parse(e.created_at) < 3000 + i * 2500) return
        data.eventVotes.push({ event_id: e.id, trip_id: trip.id, voter_id: bot, valid: true })
      })
      resolveEvent(data, e)
    }

    for (const c of data.challenges) {
      if (c.trip_id !== trip.id) continue
      resolveChallenge(data, c, now)
      if (!isActiveChallenge(c)) continue
      const phaseStart =
        c.phase === 'vote_bad'
          ? Date.parse(c.created_at)
          : c.phase === 'proposals'
            ? Date.parse(c.proposals_until ?? '') - PROPOSALS_MS
            : Date.parse(c.voting_until ?? '') - OPTION_VOTE_MS
      bots.forEach((bot, i) => {
        if (bot === c.target_user_id) return
        const delay = 3000 + i * 2500
        if (now - phaseStart < delay) return
        if (c.phase === 'vote_bad' && !data.badVotes.some((v) => v.challenge_id === c.id && v.voter_id === bot)) {
          data.badVotes.push({ challenge_id: c.id, trip_id: trip.id, voter_id: bot, bad: true })
        } else if (c.phase === 'proposals' && !data.options.some((o) => o.challenge_id === c.id && o.author_id === bot)) {
          data.options.push({
            id: newId(),
            challenge_id: c.id,
            trip_id: trip.id,
            author_id: bot,
            text: BOT_OPTIONS[(i + data.options.length) % BOT_OPTIONS.length],
            created_at: iso(now),
          })
        } else if (
          c.phase === 'vote_option' &&
          now - phaseStart >= delay + 2500 &&
          !data.optionVotes.some((v) => v.challenge_id === c.id && v.voter_id === bot)
        ) {
          const choices = data.options.filter((o) => o.challenge_id === c.id && o.author_id !== bot)
          const pick = choices.find((o) => o.author_id === data.me.id) ?? choices[0]
          if (pick) data.optionVotes.push({ challenge_id: c.id, trip_id: trip.id, voter_id: bot, option_id: pick.id })
        }
      })
      resolveChallenge(data, c, now)
    }

    // Ruleta de cocinero: entran y votan solos (casi siempre dicen que salió bueno)
    for (const spin of data.chefSpins) {
      if (spin.trip_id !== trip.id) continue
      const since = now - Date.parse(spin.status === 'joining' ? spin.created_at : spin.spun_at ?? spin.created_at)
      bots.forEach((bot, i) => {
        const delay = 2500 + i * 1500
        if (spin.status === 'joining' && since >= delay && !data.chefPlayers.some((p) => p.spin_id === spin.id && p.user_id === bot)) {
          data.chefPlayers.push({ spin_id: spin.id, trip_id: trip.id, user_id: bot })
        }
        // Si le tocó a un bot, "cocina" en unos segundos
        if (spin.status === 'cooking' && spin.chosen_user_id === bot && since >= 6000) {
          spin.status = 'voting'
          spin.photo_path = seedPhotoPath(spin.kind === 'comida' ? '🍝' : '🍹', 30)
          spin.spun_at = iso(now)
        }
        if (
          spin.status === 'voting' &&
          spin.chosen_user_id !== bot &&
          since >= delay + 1000 &&
          !data.chefVotes.some((v) => v.spin_id === spin.id && v.voter_id === bot)
        ) {
          data.chefVotes.push({ spin_id: spin.id, trip_id: trip.id, voter_id: bot, good: Math.random() < 0.75 })
        }
      })
      chefTrySpin(data, spin)
      resolveChef(data, spin)
    }

    // Casino: los bots entran y, al terminar, cargan su resultado con foto
    for (const c of data.casinoSessions) {
      if (c.trip_id !== trip.id) continue
      resolveCasino(data, c, now)
      bots.forEach((bot, i) => {
        if (c.status === 'running' && now - Date.parse(c.starts_at) >= 3000 + i * 1500 &&
            !data.casinoPlayers.some((p) => p.session_id === c.id && p.user_id === bot)) {
          data.casinoPlayers.push({ session_id: c.id, trip_id: trip.id, user_id: bot, amount: null, event_id: null, reported_at: null })
        }
        const player = data.casinoPlayers.find((p) => p.session_id === c.id && p.user_id === bot)
        if (c.status === 'reporting' && player && !player.reported_at && now - Date.parse(c.ends_at) >= 3000 + i * 2000) {
          const amount = Math.round((Math.random() * 30000 - 10000) / 500) * 500
          const e = addEvent(data, {
            trip_id: trip.id,
            user_id: bot,
            actor_id: bot,
            kind: 'casino',
            points: 0,
            title: 'Resultado en el casino',
            emoji: '🎰',
            detail: formatMoney(amount),
            photo_paths: [seedPhotoPath('🎰', 280)],
            status: 'pending',
            ref_id: c.id,
          })
          Object.assign(player, { amount, event_id: e.id, reported_at: iso(now) })
        }
      })
      resolveCasino(data, c, now)
    }

    // Duelos: los jugadores de ejemplo aceptan y juegan a su ritmo
    for (const d of data.duels) {
      if (d.trip_id !== trip.id) continue
      if (d.status === 'invited' && bots.includes(d.opponent_id) && now - Date.parse(d.created_at) >= 3000) {
        const day = data.duels.filter(
          (x) => x.day === d.day && (x.status === 'live' || x.status === 'done') &&
            (x.challenger_id === d.opponent_id || x.opponent_id === d.opponent_id),
        ).length
        if (day >= DUELS_PER_DAY) d.status = 'declined'
        else startDuel(data, d, now)
      }
      if (d.status === 'live' && d.starts_at && d.ends_at) {
        const start = Date.parse(d.starts_at)
        const end = Date.parse(d.ends_at)
        for (const id of [d.challenger_id, d.opponent_id]) {
          if (!bots.includes(id)) continue
          const r = data.duelResults.find((x) => x.duel_id === d.id && x.user_id === id)
          if (!r || r.gave_up) continue
          const pace = botPace(d.id, id)
          if (d.kind === 'fondo') {
            const finishAt = start + 5000 + pace * 9000
            if (!r.finished_at && now >= finishAt && finishAt < end) r.finished_at = iso(finishAt)
          } else {
            const every = 8000 + pace * 14000
            const shots = Math.min(DUEL_MAX_SHOTS, Math.floor((Math.min(now, end) - start) / every))
            if (shots > r.shots) {
              r.shots = shots
              r.last_shot_at = iso(start + shots * every)
            }
          }
        }
      }
      resolveDuel(data, d, now)
    }
  }
}

function startDuel(data: DemoData, d: Duel, now = Date.now()) {
  d.status = 'live'
  d.starts_at = iso(now + 5000)
  d.ends_at = iso(now + 5000 + d.seconds * 1000)
  for (const user_id of [d.challenger_id, d.opponent_id]) {
    data.duelResults.push({ duel_id: d.id, trip_id: d.trip_id, user_id, finished_at: null, shots: 0, last_shot_at: null, gave_up: false })
  }
}

function buildDetail(data: DemoData, trip: StoredTrip): TripDetail {
  const id = trip.id
  return {
    trip: withProfiles(data, trip),
    drinks: data.drinks
      .filter((d) => d.trip_id === id && !d.archived)
      .sort((a, b) => a.points - b.points)
      .map(({ archived: _archived, ...d }) => d),
    events: data.events.filter((e) => e.trip_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    missions: data.missions.filter((m) => m.trip_id === id),
    cards: data.cards.filter((c) => c.trip_id === id),
    eventVotes: data.eventVotes.filter((v) => v.trip_id === id),
    challenges: data.challenges.filter((c) => c.trip_id === id),
    badVotes: data.badVotes.filter((v) => v.trip_id === id),
    options: data.options.filter((o) => o.trip_id === id),
    optionVotes: data.optionVotes.filter((v) => v.trip_id === id),
    infractions: data.infractions.filter((x) => x.trip_id === id && !x.archived).map(({ archived: _a, ...x }) => x),
    forfeits: data.forfeits.filter((x) => x.trip_id === id && !x.archived).map(({ archived: _a, ...x }) => x),
    playerForfeits: data.playerForfeits.filter((f) => f.trip_id === id),
    chefSpins: data.chefSpins.filter((x) => x.trip_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    chefPlayers: data.chefPlayers.filter((x) => x.trip_id === id),
    chefVotes: data.chefVotes.filter((x) => x.trip_id === id),
    casinoSessions: data.casinoSessions.filter((x) => x.trip_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    casinoPlayers: data.casinoPlayers.filter((x) => x.trip_id === id),
    duels: data.duels.filter((x) => x.trip_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    duelResults: data.duelResults.filter((x) => x.trip_id === id),
    serverTime: new Date().toISOString(),
  }
}

function challengeForVoter(data: DemoData, challengeId: string) {
  const c = data.challenges.find((x) => x.id === challengeId)
  if (!c) throw new Error('CHALLENGE_NOT_FOUND')
  tripFor(data, c.trip_id)
  resolveChallenge(data, c)
  if (c.target_user_id === data.me.id) throw new Error('CANNOT_VOTE_OWN_MISSION')
  return c
}

export const demoApi: Api = {
  async getMyProfile() {
    await wait()
    return load().me
  },

  async updateDisplayName(_userId, displayName) {
    await wait()
    const data = load()
    const name = displayName.trim().slice(0, 40)
    if (name) save({ ...data, me: { ...data.me, display_name: name } })
  },

  async listFriends() {
    await wait()
    const data = load()
    return data.people.filter((p) => data.friendIds.includes(p.id)).sort(byName)
  },

  async addFriendByCode(code) {
    await wait()
    const data = load()
    const wanted = code.trim().toUpperCase()
    if (wanted === data.me.friend_code) throw new Error('FRIEND_IS_SELF')
    const person = data.people.find((p) => p.friend_code === wanted)
    if (!person) throw new Error('FRIEND_CODE_NOT_FOUND')
    if (data.friendIds.includes(person.id)) throw new Error('ALREADY_FRIENDS')
    save({ ...data, friendIds: [...data.friendIds, person.id] })
    return person
  },

  async removeFriend(friendId) {
    await wait()
    const data = load()
    save({ ...data, friendIds: data.friendIds.filter((id) => id !== friendId) })
  },

  async listTrips() {
    await wait()
    const data = load()
    return data.trips
      .filter((t) => t.members.some((m) => m.user_id === data.me.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((t) => withProfiles(data, t))
  },

  async createTrip(trip: NewTrip) {
    await wait()
    const data = load()
    const name = trip.name.trim()
    if (!name) throw new Error('TRIP_NAME_REQUIRED')
    const memberIds = [...new Set(trip.memberIds)].filter((id) => id !== data.me.id)
    if (memberIds.some((id) => !data.friendIds.includes(id))) throw new Error('MEMBER_NOT_FRIEND')

    const id = newId()
    data.trips.push({
      id,
      kind: trip.kind,
      owner_id: data.me.id,
      name: name.slice(0, 60),
      // Una salida sin fecha es para hoy
      trip_date: trip.tripDate ?? (trip.kind === 'salida' ? tripDay(DEFAULT_CUTOFF_HOUR) : null),
      place: trip.place?.trim().slice(0, 80) || null,
      created_at: new Date().toISOString(),
      ...DEFAULT_RULES,
      members: [
        { user_id: data.me.id, role: 'owner' },
        ...memberIds.map((user_id) => ({ user_id, role: 'member' as const })),
      ],
    })
    const lists = seedLists(id)
    data.infractions.push(...lists.infractions)
    data.forfeits.push(...lists.forfeits)
    save(data)
    return id
  },

  // ---------- Juego del viaje ----------

  async getTrip(tripId) {
    await wait(160)
    const data = load()
    const trip = tripFor(data, tripId)
    botsAct(data)
    save(data)
    return buildDetail(data, trip)
  },

  async saveDrink(tripId, drink) {
    await wait()
    const data = load()
    requireOwner(data, tripId)
    const row = { name: drink.name.trim().slice(0, 40), emoji: drink.emoji, points: Math.round(drink.points) }
    if (!row.name || row.points < 1 || row.points > 500) throw new Error('Datos inválidos')
    const existing = drink.id && data.drinks.find((d) => d.id === drink.id && d.trip_id === tripId)
    if (existing) Object.assign(existing, row)
    else data.drinks.push({ id: newId(), trip_id: tripId, archived: false, ...row })
    save(data)
  },

  async archiveDrink(drinkId) {
    await wait()
    const data = load()
    const drink = data.drinks.find((d) => d.id === drinkId)
    if (!drink) return
    requireOwner(data, drink.trip_id)
    drink.archived = true
    save(data)
  },

  async updateRules(tripId, rules) {
    await wait()
    const data = load()
    const trip = requireOwner(data, tripId)
    Object.assign(trip, rules)
    save(data)
  },

  async uploadPhoto(tripId, _userId, photo) {
    const path = `demo/${tripId}/${newId()}.jpg`
    await saveDemoPhoto(path, photo)
    return path
  },

  getPhotoUrls: demoPhotoUrls,

  async logDrink(tripId, drinkId, photoPath) {
    await wait()
    const data = load()
    requireOpen(data, tripId)
    const drink = data.drinks.find((d) => d.id === drinkId && d.trip_id === tripId && !d.archived)
    if (!drink) throw new Error('DRINK_NOT_FOUND')
    checkPhoto(data, tripId, photoPath)
    const double = data.cards.find(
      (c) => c.trip_id === tripId && c.user_id === data.me.id && c.status === 'active' && cardDef(c.card_key).effect === 'double',
    )
    if (double) double.status = 'used'
    const e = addEvent(data, {
      trip_id: tripId,
      user_id: data.me.id,
      actor_id: data.me.id,
      kind: 'drink',
      points: drink.points * (double ? 2 : 1),
      title: drink.name + (double ? ' (x2)' : ''),
      emoji: drink.emoji,
      photo_paths: [photoPath],
      status: 'pending',
      card_id: double?.id ?? null,
    })
    resolveEvent(data, e)
    save(data)
  },

  async chooseMission(tripId, difficulty) {
    await wait()
    const data = load()
    const trip = requireOpen(data, tripId)
    const today = todayOf(trip)
    if (data.missions.some((m) => m.trip_id === tripId && m.user_id === data.me.id && m.day === today)) {
      throw new Error('MISSION_ALREADY_CHOSEN')
    }
    const pool = MISSIONS[difficulty]
    if (!pool) throw new Error('INVALID_DIFFICULTY')
    data.missions.push({
      id: newId(),
      trip_id: tripId,
      user_id: data.me.id,
      day: today,
      difficulty,
      mission: pool[Math.floor(Math.random() * pool.length)],
      points: missionPoints(trip, difficulty),
      completed_at: null,
      photo_path: null,
      group_assigned: false,
    })
    save(data)
  },

  async completeMission(tripId, photoPath) {
    await wait()
    const data = load()
    const trip = requireOpen(data, tripId)
    botsAct(data)
    const m = data.missions.find((x) => x.trip_id === tripId && x.user_id === data.me.id && x.day === todayOf(trip))
    if (!m) throw new Error('MISSION_NOT_FOUND')
    if (m.completed_at) throw new Error('MISSION_ALREADY_DONE')
    if (data.challenges.some((c) => c.mission_id === m.id && isActiveChallenge(c))) throw new Error('MISSION_UNDER_VOTE')
    if (photoPath) checkPhoto(data, tripId, photoPath)
    m.completed_at = new Date().toISOString()
    m.photo_path = photoPath
    addEvent(data, {
      trip_id: tripId,
      user_id: data.me.id,
      actor_id: data.me.id,
      kind: 'mission',
      points: m.points,
      day: m.day,
      title: `Misión ${difficultyLabel(m.difficulty).toLowerCase()} cumplida`,
      emoji: m.difficulty === 'easy' ? '🎯' : m.difficulty === 'medium' ? '🔥' : '💀',
      detail: m.mission,
      photo_paths: photoPath ? [photoPath] : [],
    })
    save(data)
  },

  async reportQuiebre(tripId, userId, photoPaths) {
    await wait()
    const data = load()
    const trip = requireOpen(data, tripId)
    if (!trip.members.some((m) => m.user_id === userId)) throw new Error('NOT_TRIP_MEMBER')
    const photos = [...new Set(photoPaths)]
    if (photos.length < 1 || photos.length > 3 || photos.length !== photoPaths.length) {
      throw new Error('QUIEBRE_PHOTOS_REQUIRED')
    }
    for (const p of photos) checkPhoto(data, tripId, p, 'QUIEBRE_PHOTOS_REQUIRED')
    const e = addEvent(data, {
      trip_id: tripId,
      user_id: userId,
      actor_id: data.me.id,
      kind: 'quiebre',
      points: -trip.quiebre_penalty,
      title: 'Quebró',
      emoji: '😵',
      photo_paths: photos,
      status: 'pending',
    })
    resolveEvent(data, e)
    save(data)
  },

  async spinRoulette(tripId, day) {
    await wait(300)
    const data = load()
    const trip = tripFor(data, tripId)
    if (!day || day >= todayOf(trip)) throw new Error('DAY_NOT_FINISHED')
    const totals = new Map<string, number>()
    for (const e of data.events) {
      if (e.trip_id === tripId && e.day === day && e.status === 'approved') {
        totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + e.points)
      }
    }
    const top = Math.max(0, ...totals.values())
    if (top <= 0 || (totals.get(data.me.id) ?? 0) < top) throw new Error('NOT_DAY_WINNER')
    if (data.cards.some((c) => c.trip_id === tripId && c.user_id === data.me.id && c.won_day === day)) {
      throw new Error('ALREADY_SPUN')
    }
    // Sorteo ponderado (igual que en la base)
    const total = CARDS.reduce((s, c) => s + c.weight, 0)
    let roll = Math.random() * total
    const won = CARDS.find((c) => (roll -= c.weight) < 0) ?? CARDS[0]
    data.cards.push({
      id: newId(),
      trip_id: tripId,
      user_id: data.me.id,
      card_key: won.key,
      won_day: day,
      status: 'available',
      target_user_id: null,
      created_at: new Date().toISOString(),
    })
    save(data)
    return won.key as CardKey
  },

  async redeemCard(cardId, targetId) {
    await wait()
    const data = load()
    const card = data.cards.find((c) => c.id === cardId && c.user_id === data.me.id && c.status === 'available')
    if (!card) throw new Error('CARD_NOT_AVAILABLE')
    const trip = tripFor(data, card.trip_id)
    const def = cardDef(card.card_key)
    const base = { trip_id: card.trip_id, actor_id: data.me.id, kind: 'card' as const }

    if (def.effect === 'bonus') {
      addEvent(data, { ...base, user_id: data.me.id, points: def.value, title: `Comodín: ${def.name}`, emoji: def.emoji })
      card.status = 'used'
    } else if (def.effect === 'steal') {
      if (!targetId || targetId === data.me.id || !trip.members.some((m) => m.user_id === targetId)) {
        throw new Error('TARGET_REQUIRED')
      }
      addEvent(data, { ...base, user_id: targetId, points: -def.value, title: `Le robaron puntos (${def.name})`, emoji: def.emoji })
      addEvent(data, { ...base, user_id: data.me.id, points: def.value, title: `Comodín: ${def.name}`, emoji: def.emoji })
      card.status = 'used'
      card.target_user_id = targetId
    } else if (def.effect === 'double' || def.effect === 'shield') {
      card.status = 'active'
    } else {
      addEvent(data, { ...base, user_id: data.me.id, points: 0, title: `Comodín: ${def.name}`, emoji: def.emoji })
      card.status = 'used'
    }
    save(data)
  },

  // ---------- Validación y votaciones ----------

  async voteEvent(eventId, valid) {
    await wait()
    const data = load()
    const e = data.events.find((x) => x.id === eventId)
    if (!e) throw new Error('EVENT_NOT_FOUND')
    tripFor(data, e.trip_id)
    if (e.status !== 'pending') throw new Error('EVENT_ALREADY_RESOLVED')
    if (e.actor_id === data.me.id || e.user_id === data.me.id) throw new Error('CANNOT_VOTE_OWN')
    data.eventVotes = data.eventVotes.filter((v) => !(v.event_id === eventId && v.voter_id === data.me.id))
    data.eventVotes.push({ event_id: eventId, trip_id: e.trip_id, voter_id: data.me.id, valid })
    resolveEvent(data, e)
    save(data)
  },

  async startMissionChallenge(missionId) {
    await wait()
    const data = load()
    const m = data.missions.find((x) => x.id === missionId)
    if (!m) throw new Error('MISSION_NOT_FOUND')
    const trip = requireOpen(data, m.trip_id)
    if (m.user_id === data.me.id) throw new Error('CANNOT_CHALLENGE_OWN')
    if (m.day !== todayOf(trip)) throw new Error('MISSION_NOT_TODAY')
    if (m.completed_at) throw new Error('MISSION_ALREADY_DONE')
    if (data.challenges.some((c) => c.mission_id === missionId)) throw new Error('CHALLENGE_EXISTS')
    const now = Date.now()
    const c: MissionChallenge = {
      id: newId(),
      trip_id: m.trip_id,
      mission_id: m.id,
      target_user_id: m.user_id,
      started_by: data.me.id,
      phase: 'vote_bad',
      bad_until: iso(now + BAD_VOTE_MS),
      proposals_until: null,
      voting_until: null,
      winner_option_id: null,
      created_at: iso(now),
    }
    data.challenges.unshift(c)
    data.badVotes.push({ challenge_id: c.id, trip_id: m.trip_id, voter_id: data.me.id, bad: true })
    resolveChallenge(data, c)
    save(data)
  },

  async voteMissionBad(challengeId, bad) {
    await wait()
    const data = load()
    const c = challengeForVoter(data, challengeId)
    if (c.phase !== 'vote_bad') throw new Error('CHALLENGE_CLOSED')
    data.badVotes = data.badVotes.filter((v) => !(v.challenge_id === c.id && v.voter_id === data.me.id))
    data.badVotes.push({ challenge_id: c.id, trip_id: c.trip_id, voter_id: data.me.id, bad })
    resolveChallenge(data, c)
    save(data)
  },

  async proposeMissionOption(challengeId, text) {
    await wait()
    const data = load()
    const c = challengeForVoter(data, challengeId)
    if (c.phase !== 'proposals') throw new Error('CHALLENGE_CLOSED')
    const clean = text.trim()
    if (clean.length < 5 || clean.length > 140) throw new Error('OPTION_INVALID')
    const mine = data.options.find((o) => o.challenge_id === c.id && o.author_id === data.me.id)
    if (mine) mine.text = clean
    else {
      data.options.push({
        id: newId(),
        challenge_id: c.id,
        trip_id: c.trip_id,
        author_id: data.me.id,
        text: clean,
        created_at: iso(Date.now()),
      })
    }
    resolveChallenge(data, c)
    save(data)
  },

  async startOptionVote(challengeId) {
    await wait()
    const data = load()
    const c = challengeForVoter(data, challengeId)
    if (c.phase !== 'proposals') throw new Error('CHALLENGE_CLOSED')
    if (data.options.filter((o) => o.challenge_id === c.id).length < 2) throw new Error('NEED_MORE_OPTIONS')
    c.phase = 'vote_option'
    c.voting_until = iso(Date.now() + OPTION_VOTE_MS)
    save(data)
  },

  async voteMissionOption(challengeId, optionId) {
    await wait()
    const data = load()
    const c = challengeForVoter(data, challengeId)
    if (c.phase !== 'vote_option') throw new Error('VOTING_CLOSED')
    const option = data.options.find((o) => o.id === optionId && o.challenge_id === c.id)
    if (!option) throw new Error('OPTION_INVALID')
    if (option.author_id === data.me.id) throw new Error('CANNOT_VOTE_OWN_OPTION')
    data.optionVotes = data.optionVotes.filter((v) => !(v.challenge_id === c.id && v.voter_id === data.me.id))
    data.optionVotes.push({ challenge_id: c.id, trip_id: c.trip_id, voter_id: data.me.id, option_id: optionId })
    resolveChallenge(data, c)
    save(data)
  },

  async pendingCounts() {
    await wait(120)
    const data = load()
    botsAct(data)
    save(data)
    const result: Record<string, number> = {}
    for (const trip of data.trips) {
      if (!trip.members.some((m) => m.user_id === data.me.id)) continue
      const n = myPendingItems(buildDetail(data, trip), data.me.id).length
      if (n > 0) result[trip.id] = n
    }
    return result
  },

  // ---------- Infracciones, prendas, ruleta y casino ----------

  async saveInfraction(tripId, item) {
    await wait()
    const data = load()
    requireOwner(data, tripId)
    const name = item.name.trim().slice(0, 60)
    if (!name) throw new Error('Datos inválidos')
    const existing = item.id && data.infractions.find((x) => x.id === item.id && x.trip_id === tripId)
    if (existing) Object.assign(existing, { name, emoji: item.emoji })
    else data.infractions.push({ id: newId(), trip_id: tripId, name, emoji: item.emoji, archived: false })
    save(data)
  },

  async archiveInfraction(id) {
    await wait()
    const data = load()
    const item = data.infractions.find((x) => x.id === id)
    if (!item) return
    requireOwner(data, item.trip_id)
    item.archived = true
    save(data)
  },

  async saveForfeit(tripId, item) {
    await wait()
    const data = load()
    requireOwner(data, tripId)
    const text = item.text.trim().slice(0, 140)
    if (text.length < 3) throw new Error('Datos inválidos')
    const existing = item.id && data.forfeits.find((x) => x.id === item.id && x.trip_id === tripId)
    if (existing) existing.text = text
    else data.forfeits.push({ id: newId(), trip_id: tripId, text, archived: false })
    save(data)
  },

  async archiveForfeit(id) {
    await wait()
    const data = load()
    const item = data.forfeits.find((x) => x.id === id)
    if (!item) return
    requireOwner(data, item.trip_id)
    item.archived = true
    save(data)
  },

  async reportInfraction(tripId, userId, infractionId, photoPaths) {
    await wait()
    const data = load()
    const trip = requireOpen(data, tripId)
    if (!trip.members.some((m) => m.user_id === userId)) throw new Error('NOT_TRIP_MEMBER')
    const inf = data.infractions.find((x) => x.id === infractionId && x.trip_id === tripId && !x.archived)
    if (!inf) throw new Error('INFRACTION_NOT_FOUND')
    const photos = [...new Set(photoPaths)]
    if (photos.length > 3 || photos.length !== photoPaths.length) throw new Error('PHOTO_REQUIRED')
    for (const p of photos) checkPhoto(data, tripId, p)
    const e = addEvent(data, {
      trip_id: tripId,
      user_id: userId,
      actor_id: data.me.id,
      kind: 'infraction',
      points: 0,
      title: inf.name,
      emoji: inf.emoji,
      photo_paths: photos,
      status: 'pending',
      ref_id: inf.id,
    })
    resolveEvent(data, e)
    save(data)
  },

  async completeForfeit(forfeitId, photoPath) {
    await wait()
    const data = load()
    const f = data.playerForfeits.find((x) => x.id === forfeitId && x.user_id === data.me.id)
    if (!f) throw new Error('FORFEIT_NOT_FOUND')
    if (f.status !== 'to_do') throw new Error('FORFEIT_ALREADY_DONE')
    if (photoPath) checkPhoto(data, f.trip_id, photoPath)
    f.status = 'done'
    f.done_at = new Date().toISOString()
    addEvent(data, {
      trip_id: f.trip_id,
      user_id: data.me.id,
      actor_id: data.me.id,
      kind: 'forfeit',
      points: 0,
      title: 'Cumplió su prenda',
      emoji: '🙈',
      detail: f.forfeit,
      photo_paths: photoPath ? [photoPath] : [],
      ref_id: f.id,
    })
    save(data)
  },

  async startChefSpin(tripId, kind) {
    await wait()
    const data = load()
    requireOpen(data, tripId)
    if (data.chefSpins.some((x) => x.trip_id === tripId && ['joining', 'cooking', 'voting'].includes(x.status))) {
      throw new Error('CHEF_SPIN_ACTIVE')
    }
    const spin: ChefSpin = {
      id: newId(),
      trip_id: tripId,
      kind,
      started_by: data.me.id,
      status: 'joining',
      chosen_user_id: null,
      excluded_user_id: null,
      photo_path: null,
      created_at: iso(Date.now()),
      spun_at: null,
    }
    data.chefSpins.unshift(spin)
    data.chefPlayers.push({ spin_id: spin.id, trip_id: tripId, user_id: data.me.id })
    chefTrySpin(data, spin)
    save(data)
  },

  async joinChefSpin(spinId) {
    await wait()
    const data = load()
    const spin = data.chefSpins.find((x) => x.id === spinId)
    if (!spin) throw new Error('CHEF_SPIN_NOT_FOUND')
    tripFor(data, spin.trip_id)
    if (spin.status !== 'joining') throw new Error('CHEF_SPIN_CLOSED')
    if (!data.chefPlayers.some((p) => p.spin_id === spinId && p.user_id === data.me.id)) {
      data.chefPlayers.push({ spin_id: spinId, trip_id: spin.trip_id, user_id: data.me.id })
    }
    chefTrySpin(data, spin)
    save(data)
  },

  async cancelChefSpin(spinId) {
    await wait()
    const data = load()
    const spin = data.chefSpins.find((x) => x.id === spinId)
    if (!spin) throw new Error('CHEF_SPIN_NOT_FOUND')
    const trip = tripFor(data, spin.trip_id)
    if (spin.status !== 'joining') throw new Error('CHEF_SPIN_CLOSED')
    if (spin.started_by !== data.me.id && trip.owner_id !== data.me.id) throw new Error('NOT_ALLOWED')
    spin.status = 'cancelled'
    save(data)
  },

  async chefReady(spinId, photoPath) {
    await wait()
    const data = load()
    const spin = data.chefSpins.find((x) => x.id === spinId)
    if (!spin) throw new Error('CHEF_SPIN_NOT_FOUND')
    tripFor(data, spin.trip_id)
    if (spin.status !== 'cooking') throw new Error('CHEF_SPIN_CLOSED')
    if (photoPath) checkPhoto(data, spin.trip_id, photoPath)
    spin.status = 'voting'
    spin.photo_path = photoPath
    spin.spun_at = iso(Date.now())
    resolveChef(data, spin)
    save(data)
  },

  async voteChef(spinId, good) {
    await wait()
    const data = load()
    const spin = data.chefSpins.find((x) => x.id === spinId)
    if (!spin) throw new Error('CHEF_SPIN_NOT_FOUND')
    tripFor(data, spin.trip_id)
    if (spin.status !== 'voting') throw new Error('CHEF_SPIN_CLOSED')
    if (spin.chosen_user_id === data.me.id) throw new Error('CANNOT_VOTE_OWN')
    data.chefVotes = data.chefVotes.filter((v) => !(v.spin_id === spinId && v.voter_id === data.me.id))
    data.chefVotes.push({ spin_id: spinId, trip_id: spin.trip_id, voter_id: data.me.id, good })
    resolveChef(data, spin)
    save(data)
  },

  async startCasino(tripId, minutes) {
    await wait()
    const data = load()
    const trip = requireOpen(data, tripId)
    botsAct(data)
    // En la demo se permite 1 minuto para probar rápido
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new Error('INVALID_MINUTES')
    if (data.casinoSessions.some((c) => c.trip_id === tripId && (c.status === 'running' || c.status === 'reporting'))) {
      throw new Error('CASINO_ACTIVE')
    }
    const now = Date.now()
    const session: CasinoSession = {
      id: newId(),
      trip_id: tripId,
      started_by: data.me.id,
      minutes,
      prize: trip.casino_points,
      status: 'running',
      starts_at: iso(now),
      ends_at: iso(now + minutes * 60_000),
      report_until: iso(now + (minutes + 60) * 60_000),
      created_at: iso(now),
    }
    data.casinoSessions.unshift(session)
    data.casinoPlayers.push({ session_id: session.id, trip_id: tripId, user_id: data.me.id, amount: null, event_id: null, reported_at: null })
    save(data)
  },

  async joinCasino(sessionId) {
    await wait()
    const data = load()
    const c = data.casinoSessions.find((x) => x.id === sessionId)
    if (!c) throw new Error('CASINO_NOT_FOUND')
    tripFor(data, c.trip_id)
    if (c.status !== 'running' || Date.now() >= Date.parse(c.ends_at)) throw new Error('CASINO_CLOSED')
    if (!data.casinoPlayers.some((p) => p.session_id === c.id && p.user_id === data.me.id)) {
      data.casinoPlayers.push({ session_id: c.id, trip_id: c.trip_id, user_id: data.me.id, amount: null, event_id: null, reported_at: null })
    }
    save(data)
  },

  async cancelCasino(sessionId) {
    await wait()
    const data = load()
    const c = data.casinoSessions.find((x) => x.id === sessionId)
    if (!c) throw new Error('CASINO_NOT_FOUND')
    const trip = tripFor(data, c.trip_id)
    if (c.status !== 'running') throw new Error('CASINO_CLOSED')
    if (c.started_by !== data.me.id && trip.owner_id !== data.me.id) throw new Error('NOT_ALLOWED')
    c.status = 'cancelled'
    save(data)
  },

  async reportCasino(sessionId, amount, photoPath) {
    await wait()
    const data = load()
    const c = data.casinoSessions.find((x) => x.id === sessionId)
    if (!c) throw new Error('CASINO_NOT_FOUND')
    tripFor(data, c.trip_id)
    resolveCasino(data, c)
    if (c.status === 'running') throw new Error('CASINO_STILL_RUNNING')
    if (c.status !== 'reporting') throw new Error('CASINO_CLOSED')
    const player = data.casinoPlayers.find((p) => p.session_id === c.id && p.user_id === data.me.id)
    if (!player) throw new Error('CASINO_NOT_JOINED')
    if (player.reported_at) throw new Error('CASINO_ALREADY_REPORTED')
    if (!Number.isInteger(amount) || Math.abs(amount) > 100_000_000) throw new Error('INVALID_AMOUNT')
    checkPhoto(data, c.trip_id, photoPath)
    const e = addEvent(data, {
      trip_id: c.trip_id,
      user_id: data.me.id,
      actor_id: data.me.id,
      kind: 'casino',
      points: 0,
      title: 'Resultado en el casino',
      emoji: '🎰',
      detail: formatMoney(amount),
      photo_paths: [photoPath],
      status: 'pending',
      ref_id: c.id,
    })
    Object.assign(player, { amount, event_id: e.id, reported_at: iso(Date.now()) })
    resolveEvent(data, e)
    resolveCasino(data, c)
    save(data)
  },

  async challengeDuel(tripId, opponentId, kind, seconds) {
    await wait()
    const data = load()
    const trip = requireOpen(data, tripId)
    botsAct(data)
    if (opponentId === data.me.id || !trip.members.some((m) => m.user_id === opponentId)) throw new Error('INVALID_OPPONENT')
    if (kind === 'fondo' ? seconds < 10 || seconds > 120 : seconds < 30 || seconds > 300) throw new Error('INVALID_SECONDS')
    const involves = (d: Duel, id: string) => d.challenger_id === id || d.opponent_id === id
    if (data.duels.some((d) => d.trip_id === tripId && (d.status === 'invited' || d.status === 'live') &&
        (involves(d, data.me.id) || involves(d, opponentId)))) {
      throw new Error('DUEL_BUSY')
    }
    const today = todayOf(trip)
    const played = (id: string) =>
      data.duels.filter((d) => d.trip_id === tripId && d.day === today && (d.status === 'live' || d.status === 'done') && involves(d, id)).length
    if (played(data.me.id) >= DUELS_PER_DAY) throw new Error('DUEL_LIMIT_ME')
    if (played(opponentId) >= DUELS_PER_DAY) throw new Error('DUEL_LIMIT_OPPONENT')
    data.duels.unshift({
      id: newId(),
      trip_id: tripId,
      kind,
      challenger_id: data.me.id,
      opponent_id: opponentId,
      seconds,
      status: 'invited',
      day: today,
      created_at: iso(Date.now()),
      starts_at: null,
      ends_at: null,
      winner_id: null,
      event_id: null,
    })
    save(data)
  },

  async respondDuel(duelId, accept) {
    await wait()
    const data = load()
    const d = data.duels.find((x) => x.id === duelId)
    if (!d) throw new Error('DUEL_NOT_FOUND')
    tripFor(data, d.trip_id)
    resolveDuel(data, d)
    if (d.opponent_id !== data.me.id) throw new Error('NOT_ALLOWED')
    if (d.status !== 'invited') throw new Error('DUEL_CLOSED')
    if (accept) startDuel(data, d)
    else d.status = 'declined'
    save(data)
  },

  async duelAction(duelId, action) {
    await wait(120)
    const data = load()
    const d = data.duels.find((x) => x.id === duelId)
    if (!d) throw new Error('DUEL_NOT_FOUND')
    tripFor(data, d.trip_id)
    botsAct(data)
    const r = data.duelResults.find((x) => x.duel_id === d.id && x.user_id === data.me.id)
    if (!r) throw new Error('NOT_ALLOWED')
    if (d.status !== 'live' || !d.starts_at) throw new Error('DUEL_CLOSED')
    if (r.gave_up || r.finished_at) throw new Error('DUEL_ALREADY_DONE')
    const now = Date.now()
    if (action === 'give_up') r.gave_up = true
    else {
      if (now < Date.parse(d.starts_at)) throw new Error('DUEL_FALSE_START')
      if (action === 'finish' && d.kind === 'fondo') r.finished_at = iso(now)
      else if (action === 'shot' && d.kind === 'shots') {
        if (r.shots >= DUEL_MAX_SHOTS) throw new Error('DUEL_SHOTS_CAP')
        r.shots += 1
        r.last_shot_at = iso(now)
      } else throw new Error('INVALID_KIND')
    }
    resolveDuel(data, d)
    save(data)
  },

  async cancelDuel(duelId) {
    await wait()
    const data = load()
    const d = data.duels.find((x) => x.id === duelId)
    if (!d) throw new Error('DUEL_NOT_FOUND')
    if (d.challenger_id !== data.me.id || d.status !== 'invited') throw new Error('NOT_ALLOWED')
    d.status = 'cancelled'
    save(data)
  },
}
