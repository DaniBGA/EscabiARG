import type {
  Api,
  CardKey,
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
  addDays,
  cardDef,
  difficultyLabel,
  eventVoters,
  isActiveChallenge,
  missionPoints,
  myPendingItems,
  tripDay,
} from './game'
import { MISSIONS } from './missions'

/**
 * Modo demo: datos de ejemplo guardados solo en este navegador (localStorage + IndexedDB).
 * Replica las reglas del servidor, y los otros jugadores (Juli y Tincho) votan solos
 * a los pocos segundos para que se pueda probar todo sin más gente.
 */

export const DEMO_USER_ID = 'demo-me'
const STORAGE_KEY = 'escabiarg:demo-data'
const VERSION = 3

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

  return {
    version: VERSION,
    me: { id: DEMO_USER_ID, display_name: 'Vos', friend_code: 'DEMO42' },
    people: PEOPLE,
    friendIds: ['demo-juli', 'demo-tincho'],
    trips: [
      {
        id: T1,
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
  } else if (no * 2 >= eligible) {
    if (e.kind === 'drink' && e.card_id) {
      const card = data.cards.find((c) => c.id === e.card_id)
      if (card && card.status === 'used') card.status = 'active'
    }
    e.status = 'rejected'
  }
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
      owner_id: data.me.id,
      name: name.slice(0, 60),
      trip_date: trip.tripDate,
      place: trip.place?.trim().slice(0, 80) || null,
      created_at: new Date().toISOString(),
      ...DEFAULT_RULES,
      members: [
        { user_id: data.me.id, role: 'owner' },
        ...memberIds.map((user_id) => ({ user_id, role: 'member' as const })),
      ],
    })
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
    tripFor(data, tripId)
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
    const trip = tripFor(data, tripId)
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
    const trip = tripFor(data, tripId)
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
    const trip = tripFor(data, tripId)
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
    const trip = tripFor(data, m.trip_id)
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
}
