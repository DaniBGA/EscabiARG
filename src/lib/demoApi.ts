import type {
  Api,
  CardKey,
  DailyMission,
  Difficulty,
  Drink,
  NewTrip,
  PlayerCard,
  Profile,
  Trip,
  TripEvent,
  TripRules,
} from './api'
import { clearDemoPhotos, demoPhotoUrls, saveDemoPhoto } from './demoPhotos'
import { CARDS, addDays, cardDef, difficultyLabel, missionPoints, tripDay } from './game'

/**
 * Modo demo: datos de ejemplo guardados solo en este navegador (localStorage + IndexedDB).
 * Replica las reglas del servidor para poder recorrer toda la app sin cuenta.
 */

export const DEMO_USER_ID = 'demo-me'
const STORAGE_KEY = 'escabiarg:demo-data'
const VERSION = 2

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
  events: TripEvent[]
  missions: DailyMission[]
  cards: PlayerCard[]
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

const MISSIONS: Record<Difficulty, string[]> = {
  easy: [
    'Sacate una selfie con todo el grupo.',
    'Hacé un brindis con alguien que no conocías antes de hoy.',
    'Contá un chiste y conseguí que al menos uno se ría.',
    'Pedí una canción y bailala entera.',
    'Tomá un vaso de agua entre trago y trago durante una hora.',
    'Aprendete el nombre de alguien del lugar y saludalo por su nombre.',
  ],
  medium: [
    'Conseguí que un desconocido se saque una foto con el grupo.',
    'Hablá con acento de otra provincia durante 15 minutos.',
    'Inventá un brindis que rime y recitalo frente al grupo.',
    'Conseguí que alguien te enseñe un paso de baile nuevo.',
    'Traé algo para picar para todo el grupo.',
    'Imitá a alguien del grupo hasta que adivinen quién es.',
  ],
  extreme: [
    'Cantá una canción entera delante de todos.',
    'Conseguí que pasen un tema que vos elijas.',
    'Bailá en el medio de la pista durante una canción entera.',
    'Conseguí 3 firmas de desconocidos en una servilleta.',
    'Armá una coreografía con al menos 3 del grupo y muéstrenla.',
    'Hacé un discurso de 1 minuto sobre por qué sos el mejor del viaje.',
  ],
}

const DEFAULT_RULES: TripRules = {
  mission_points_easy: 10,
  mission_points_medium: 25,
  mission_points_extreme: 50,
  quiebre_penalty: 30,
}

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

function seed(): DemoData {
  const now = Date.now()
  const today = tripDay()
  const yesterday = addDays(today, -1)
  const ago = (min: number) => new Date(now - min * 60_000).toISOString()
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
    actor = user,
    detail: string | null = null,
  ): TripEvent => ({
    id: newId(),
    trip_id: T1,
    user_id: user,
    actor_id: actor,
    kind,
    points,
    day,
    title,
    emoji,
    detail,
    photo_paths: [],
    created_at: ago(minutesAgo),
  })

  // Ayer ganaste vos (40 pts) → tenés la ruleta pendiente
  const events: TripEvent[] = [
    ev('demo-juli', 'drink', 5, today, 25, 'Birra', '🍺'),
    ev('demo-tincho', 'drink', 10, today, 70, 'Fernet con coca', '🥃'),
    ev('demo-juli', 'quiebre', -30, yesterday, 18 * 60, 'Quebró', '😵', 'demo-tincho'),
    ev('demo-me', 'mission', 25, yesterday, 19 * 60, 'Misión intermedia cumplida', '🔥', 'demo-me', MISSIONS.medium[0]),
    ev('demo-tincho', 'mission', 10, yesterday, 20 * 60, 'Misión fácil cumplida', '🎯', 'demo-tincho', MISSIONS.easy[0]),
    ev('demo-juli', 'drink', 8, yesterday, 21 * 60, 'Gin tonic', '🍸'),
    ev('demo-tincho', 'drink', 10, yesterday, 22 * 60, 'Fernet con coca', '🥃'),
    ev('demo-me', 'drink', 10, yesterday, 22 * 60 + 10, 'Fernet con coca', '🥃'),
    ev('demo-tincho', 'drink', 5, yesterday, 23 * 60, 'Birra', '🍺'),
    ev('demo-me', 'drink', 5, yesterday, 23 * 60 + 20, 'Birra', '🍺'),
  ]

  const missions: DailyMission[] = [
    {
      id: newId(), trip_id: T1, user_id: 'demo-me', day: yesterday, difficulty: 'medium',
      mission: MISSIONS.medium[0], points: 25, completed_at: ago(19 * 60), photo_path: null,
    },
    {
      id: newId(), trip_id: T1, user_id: 'demo-tincho', day: yesterday, difficulty: 'easy',
      mission: MISSIONS.easy[0], points: 10, completed_at: ago(20 * 60), photo_path: null,
    },
    {
      id: newId(), trip_id: T1, user_id: 'demo-juli', day: today, difficulty: 'extreme',
      mission: MISSIONS.extreme[0], points: 50, completed_at: null, photo_path: null,
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
        trip_date: addDays(today, -1),
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

function addEvent(data: DemoData, e: Omit<TripEvent, 'id' | 'created_at' | 'day' | 'detail' | 'photo_paths'> & Partial<TripEvent>) {
  data.events.unshift({
    id: newId(),
    created_at: new Date().toISOString(),
    day: tripDay(),
    detail: null,
    photo_paths: [],
    ...e,
  })
}

function takeActiveCard(data: DemoData, tripId: string, userId: string, effect: 'double' | 'shield') {
  const card = data.cards.find(
    (c) => c.trip_id === tripId && c.user_id === userId && c.status === 'active' && cardDef(c.card_key).effect === effect,
  )
  if (card) card.status = 'used'
  return card ?? null
}

const usedPhotos = (data: DemoData, tripId: string) =>
  new Set([
    ...data.events.filter((e) => e.trip_id === tripId).flatMap((e) => e.photo_paths),
    ...data.missions.filter((m) => m.trip_id === tripId && m.photo_path).map((m) => m.photo_path as string),
  ])

function checkPhoto(data: DemoData, tripId: string, path: string | null, code = 'PHOTO_REQUIRED') {
  if (!path || !path.startsWith(`demo/${tripId}/`) || usedPhotos(data, tripId).has(path)) throw new Error(code)
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
    return {
      trip: withProfiles(data, trip),
      drinks: data.drinks
        .filter((d) => d.trip_id === tripId && !d.archived)
        .sort((a, b) => a.points - b.points)
        .map(({ archived: _archived, ...d }) => d),
      events: data.events
        .filter((e) => e.trip_id === tripId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      missions: data.missions.filter((m) => m.trip_id === tripId),
      cards: data.cards.filter((c) => c.trip_id === tripId),
    }
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
    const double = takeActiveCard(data, tripId, data.me.id, 'double')
    addEvent(data, {
      trip_id: tripId,
      user_id: data.me.id,
      actor_id: data.me.id,
      kind: 'drink',
      points: drink.points * (double ? 2 : 1),
      title: drink.name + (double ? ' (x2)' : ''),
      emoji: drink.emoji,
      photo_paths: [photoPath],
    })
    save(data)
  },

  async chooseMission(tripId, difficulty) {
    await wait()
    const data = load()
    const trip = tripFor(data, tripId)
    const today = tripDay()
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
    })
    save(data)
  },

  async completeMission(tripId, photoPath) {
    await wait()
    const data = load()
    tripFor(data, tripId)
    const m = data.missions.find((x) => x.trip_id === tripId && x.user_id === data.me.id && x.day === tripDay())
    if (!m) throw new Error('MISSION_NOT_FOUND')
    if (m.completed_at) throw new Error('MISSION_ALREADY_DONE')
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
    const shield = takeActiveCard(data, tripId, userId, 'shield')
    addEvent(data, {
      trip_id: tripId,
      user_id: userId,
      actor_id: data.me.id,
      kind: 'quiebre',
      points: shield ? 0 : -trip.quiebre_penalty,
      title: shield ? 'Quebró, pero lo salvó el escudo' : 'Quebró',
      emoji: '😵',
      photo_paths: photos,
    })
    save(data)
  },

  async spinRoulette(tripId, day) {
    await wait(300)
    const data = load()
    tripFor(data, tripId)
    if (!day || day >= tripDay()) throw new Error('DAY_NOT_FINISHED')
    const totals = new Map<string, number>()
    for (const e of data.events) {
      if (e.trip_id === tripId && e.day === day) totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + e.points)
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
}
