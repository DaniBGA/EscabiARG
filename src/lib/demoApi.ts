import type { Api, NewTrip, Profile, Trip } from './api'

/**
 * Modo demo: datos de ejemplo guardados solo en este navegador (localStorage).
 * Sirve para recorrer la app sin crear una cuenta ni configurar Supabase.
 */

export const DEMO_USER_ID = 'demo-me'
const STORAGE_KEY = 'escabiarg:demo-data'

type StoredTrip = Omit<Trip, 'members'> & {
  members: { user_id: string; role: 'owner' | 'member' }[]
}

type DemoData = {
  me: Profile
  people: Profile[]
  friendIds: string[]
  trips: StoredTrip[]
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

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function daysFromNow(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

function nextSaturday() {
  const d = new Date()
  d.setDate(d.getDate() + (((6 - d.getDay() + 7) % 7) || 7))
  return isoDate(d)
}

function seed(): DemoData {
  const now = Date.now()
  return {
    me: { id: DEMO_USER_ID, display_name: 'Vos', friend_code: 'DEMO42' },
    people: PEOPLE,
    friendIds: ['demo-juli', 'demo-tincho'],
    trips: [
      {
        id: 'demo-trip-1',
        owner_id: 'demo-tincho',
        name: 'Previa del sábado',
        trip_date: nextSaturday(),
        place: 'Lo de Tincho',
        created_at: new Date(now - 60_000).toISOString(),
        members: [
          { user_id: 'demo-tincho', role: 'owner' },
          { user_id: DEMO_USER_ID, role: 'member' },
          { user_id: 'demo-juli', role: 'member' },
        ],
      },
      {
        id: 'demo-trip-2',
        owner_id: DEMO_USER_ID,
        name: 'Cumple de Juli',
        trip_date: daysFromNow(16),
        place: 'Terraza de Juli',
        created_at: new Date(now - 3_600_000).toISOString(),
        members: [
          { user_id: DEMO_USER_ID, role: 'owner' },
          { user_id: 'demo-juli', role: 'member' },
        ],
      },
    ],
  }
}

// Si localStorage no está disponible (modo privado, etc.) se usa memoria
let memory: DemoData | null = null

function load(): DemoData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DemoData
  } catch {
    // seguimos con memoria / datos nuevos
  }
  return memory ?? (memory = seed())
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
}

/** Pequeña demora para que se sienta como una app real */
const wait = () => new Promise((r) => setTimeout(r, 220))

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`

const byName = (a: Profile, b: Profile) => a.display_name.localeCompare(b.display_name, 'es')

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
    const everyone = [data.me, ...data.people]
    return data.trips
      .filter((t) => t.members.some((m) => m.user_id === data.me.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((t) => ({
        ...t,
        members: t.members.map((m) => {
          const p = everyone.find((e) => e.id === m.user_id)
          return { ...m, profile: p ? { id: p.id, display_name: p.display_name } : null }
        }),
      }))
  },

  async createTrip(trip: NewTrip) {
    await wait()
    const data = load()
    const name = trip.name.trim()
    if (!name) throw new Error('TRIP_NAME_REQUIRED')
    const memberIds = [...new Set(trip.memberIds)].filter((id) => id !== data.me.id)
    if (memberIds.some((id) => !data.friendIds.includes(id))) throw new Error('MEMBER_NOT_FRIEND')

    const id = newId()
    save({
      ...data,
      trips: [
        ...data.trips,
        {
          id,
          owner_id: data.me.id,
          name: name.slice(0, 60),
          trip_date: trip.tripDate,
          place: trip.place?.trim().slice(0, 80) || null,
          created_at: new Date().toISOString(),
          members: [
            { user_id: data.me.id, role: 'owner' },
            ...memberIds.map((user_id) => ({ user_id, role: 'member' as const })),
          ],
        },
      ],
    })
    return id
  },
}
