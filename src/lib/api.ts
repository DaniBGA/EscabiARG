import { listen, type LiveListener } from './realtime'
import { requireSupabase } from './supabase'

export type Profile = {
  id: string
  display_name: string
  friend_code: string
}

export type TripMember = {
  user_id: string
  role: 'owner' | 'member'
  profile: Pick<Profile, 'id' | 'display_name'> | null
}

/** 'viaje' dura varios días; 'salida' (previa y salida) dura una sola jornada */
export type TripKind = 'viaje' | 'salida'

export type Trip = {
  id: string
  owner_id: string
  name: string
  trip_date: string | null
  place: string | null
  created_at: string
  kind: TripKind
  day_cutoff_hour?: number
  /** Desde cuándo está activada la Hora boliche (null = apagada) */
  boliche_at?: string | null
  members: TripMember[]
}

/** 'boliche' = misiones, infracciones y prendas de la Hora boliche */
export type Theme = 'normal' | 'boliche'

export type NewTrip = {
  name: string
  tripDate: string | null
  place: string | null
  memberIds: string[]
  kind: TripKind
}

// ---------- Juego del viaje ----------

export type Difficulty = 'easy' | 'medium' | 'extreme'

export type CardKey = 'ronda_casa' | 'manotazo' | 'doble' | 'escudo' | 'dj' | 'brindis'

export type TripRules = {
  mission_points_easy: number
  mission_points_medium: number
  mission_points_extreme: number
  quiebre_penalty: number
  /** Hora (0-23, Argentina) en que termina la jornada */
  day_cutoff_hour: number
  /** Puntos al que le toca cocinar / preparar el trago y sale bueno */
  chef_points: number
  /** Puntos para quien más gana en el casino */
  casino_points: number
  /** Puntos para el ganador de un duelo */
  duel_points: number
}

export type EventStatus = 'pending' | 'approved' | 'rejected'

export type Drink = {
  id: string
  trip_id: string
  name: string
  emoji: string
  /** Negativo = trago que resta (agua, Alikal…): no se carga, te queman */
  points: number
}

export type DrinkInput = { id?: string; name: string; emoji: string; points: number }

export type TripEvent = {
  id: string
  /** No viene en la lectura completa del viaje (ya se sabe de qué viaje es) */
  trip_id?: string
  user_id: string
  actor_id: string
  /** 'burn' = alguien te quemó tomando algo que resta */
  kind: 'drink' | 'mission' | 'quiebre' | 'card' | 'infraction' | 'chef' | 'casino' | 'forfeit' | 'duel' | 'burn'
  points: number
  day: string
  title: string
  emoji: string
  detail: string | null
  photo_paths: string[]
  created_at: string
  status: EventStatus
  ref_id?: string | null
}

// ---------- Infracciones, prendas, ruleta de cocinero y casino ----------

export type Infraction = { id: string; trip_id: string; name: string; emoji: string; theme?: Theme }
export type Forfeit = { id: string; trip_id: string; text: string; theme?: Theme }

export type PlayerForfeit = {
  id: string
  trip_id: string
  user_id: string
  source: 'infraction' | 'chef'
  reason: string
  forfeit: string
  status: 'to_do' | 'done'
  created_at: string
  done_at: string | null
}

export type ChefKind = 'comida' | 'trago'

export type ChefSpin = {
  id: string
  trip_id: string
  kind: ChefKind
  started_by: string
  status: 'joining' | 'cooking' | 'voting' | 'good' | 'bad' | 'cancelled'
  chosen_user_id: string | null
  excluded_user_id: string | null
  photo_path: string | null
  created_at: string
  spun_at: string | null
}

export type ChefSpinPlayer = { spin_id: string; user_id: string }
export type ChefVote = { spin_id: string; voter_id: string; good: boolean }

export type CasinoSession = {
  id: string
  trip_id: string
  started_by: string
  minutes: number
  prize: number
  status: 'running' | 'reporting' | 'done' | 'cancelled'
  starts_at: string
  ends_at: string
  report_until: string
  created_at: string
}

/** 'baile' solo en Hora boliche: bailan y vota el resto */
export type DuelKind = 'fondo' | 'shots' | 'baile'

export type Duel = {
  id: string
  trip_id: string
  kind: DuelKind
  challenger_id: string
  opponent_id: string
  seconds: number
  status: 'invited' | 'declined' | 'live' | 'voting' | 'done' | 'cancelled'
  day: string
  created_at: string
  starts_at: string | null
  ends_at: string | null
  /** Duelo de baile: hasta cuándo vota el grupo */
  voting_until?: string | null
  winner_id: string | null
  event_id: string | null
}

export type DuelResult = {
  duel_id: string
  user_id: string
  finished_at: string | null
  shots: number
  last_shot_at: string | null
  gave_up: boolean
}

/** Voto de un duelo de baile: a quién eligió */
export type DuelVote = { duel_id: string; voter_id: string; pick: string }

export type CasinoPlayer = {
  session_id: string
  user_id: string
  amount: number | null
  event_id: string | null
  reported_at: string | null
}

/** Solo vienen los votos de fotos que todavía están por validarse */
export type EventVote = { event_id: string; voter_id: string; valid: boolean }

export type ChallengePhase = 'vote_bad' | 'proposals' | 'vote_option' | 'replaced' | 'kept'

export type MissionChallenge = {
  id: string
  trip_id: string
  mission_id: string
  target_user_id: string
  started_by: string
  phase: ChallengePhase
  bad_until: string
  proposals_until: string | null
  voting_until: string | null
  winner_option_id: string | null
  created_at: string
}

export type ChallengeBadVote = { challenge_id: string; voter_id: string; bad: boolean }

export type ChallengeOption = {
  id: string
  challenge_id: string
  author_id: string
  text: string
  created_at: string
}

export type ChallengeOptionVote = { challenge_id: string; voter_id: string; option_id: string }

export type DailyMission = {
  id: string
  trip_id: string
  user_id: string
  day: string
  difficulty: Difficulty
  mission: string
  points: number
  completed_at: string | null
  photo_path: string | null
  group_assigned: boolean
  theme?: Theme
}

export type PlayerCard = {
  id: string
  trip_id: string
  user_id: string
  card_key: CardKey
  won_day: string
  status: 'available' | 'active' | 'used'
  target_user_id: string | null
  created_at: string
}

export type TripDetail = {
  trip: Trip & TripRules
  drinks: Drink[]
  events: TripEvent[]
  missions: DailyMission[]
  cards: PlayerCard[]
  eventVotes: EventVote[]
  challenges: MissionChallenge[]
  badVotes: ChallengeBadVote[]
  options: ChallengeOption[]
  optionVotes: ChallengeOptionVote[]
  infractions: Infraction[]
  forfeits: Forfeit[]
  playerForfeits: PlayerForfeit[]
  chefSpins: ChefSpin[]
  chefPlayers: ChefSpinPlayer[]
  chefVotes: ChefVote[]
  casinoSessions: CasinoSession[]
  casinoPlayers: CasinoPlayer[]
  duels: Duel[]
  duelResults: DuelResult[]
  duelVotes: DuelVote[]
  /** Hora del servidor al leer (para sincronizar cuentas regresivas) */
  serverTime: string
}

/** Operaciones de datos de la app (implementadas con Supabase o con la demo local) */
export type Api = {
  getMyProfile(userId: string): Promise<Profile>
  updateDisplayName(userId: string, displayName: string): Promise<void>
  listFriends(userId: string): Promise<Profile[]>
  addFriendByCode(code: string): Promise<Profile>
  removeFriend(friendId: string): Promise<void>
  listTrips(): Promise<Trip[]>
  createTrip(trip: NewTrip): Promise<string>
  /** Solo el organizador: borra el viaje, sus fotos y todo lo que pasó */
  deleteTrip(tripId: string): Promise<void>
  /** Solo el organizador: suma amigos a un viaje ya creado */
  addTripMembers(tripId: string, memberIds: string[]): Promise<number>

  getTrip(tripId: string): Promise<TripDetail>
  /** Cierra lo que ya venció (votaciones, casino, duelos). Lo llama la app al llegar la hora */
  tickTrip(tripId: string): Promise<void>
  /** Cambios del viaje en vivo. Devuelve la función para dejar de escuchar */
  subscribeTrip(tripId: string, listener: LiveListener): () => void
  /** Te agregan como amigo o te suman a un viaje */
  subscribeUser(userId: string, listener: LiveListener): () => void
  saveDrink(tripId: string, drink: DrinkInput): Promise<void>
  archiveDrink(drinkId: string): Promise<void>
  updateRules(tripId: string, rules: TripRules): Promise<void>
  uploadPhoto(tripId: string, userId: string, photo: Blob): Promise<string>
  getPhotoUrls(paths: string[]): Promise<Record<string, string>>
  logDrink(tripId: string, drinkId: string, photoPath: string): Promise<void>
  chooseMission(tripId: string, difficulty: Difficulty): Promise<void>
  completeMission(tripId: string, photoPath: string | null): Promise<void>
  reportQuiebre(tripId: string, userId: string, photoPaths: string[]): Promise<void>
  /** Quemar: foto de alguien tomando algo que resta */
  burnPlayer(tripId: string, userId: string, drinkId: string, photoPath: string): Promise<void>
  spinRoulette(tripId: string, day: string): Promise<CardKey>
  redeemCard(cardId: string, targetId: string | null): Promise<void>

  voteEvent(eventId: string, valid: boolean): Promise<void>
  startMissionChallenge(missionId: string): Promise<void>
  voteMissionBad(challengeId: string, bad: boolean): Promise<void>
  proposeMissionOption(challengeId: string, text: string): Promise<void>
  startOptionVote(challengeId: string): Promise<void>
  voteMissionOption(challengeId: string, optionId: string): Promise<void>
  /** Cosas que esperan tu voto, por viaje */
  pendingCounts(): Promise<Record<string, number>>

  saveInfraction(tripId: string, item: { id?: string; name: string; emoji: string; theme?: Theme }): Promise<void>
  archiveInfraction(id: string): Promise<void>
  saveForfeit(tripId: string, item: { id?: string; text: string; theme?: Theme }): Promise<void>
  archiveForfeit(id: string): Promise<void>
  reportInfraction(tripId: string, userId: string, infractionId: string, photoPaths: string[]): Promise<void>
  completeForfeit(forfeitId: string, photoPath: string | null): Promise<void>
  startChefSpin(tripId: string, kind: ChefKind): Promise<void>
  joinChefSpin(spinId: string): Promise<void>
  cancelChefSpin(spinId: string): Promise<void>
  chefReady(spinId: string, photoPath: string | null): Promise<void>
  voteChef(spinId: string, good: boolean): Promise<void>
  startCasino(tripId: string, minutes: number): Promise<void>
  joinCasino(sessionId: string): Promise<void>
  cancelCasino(sessionId: string): Promise<void>
  reportCasino(sessionId: string, amount: number, photoPath: string): Promise<void>
  challengeDuel(tripId: string, opponentId: string, kind: DuelKind, seconds: number): Promise<void>
  respondDuel(duelId: string, accept: boolean): Promise<void>
  duelAction(duelId: string, action: 'finish' | 'shot' | 'give_up'): Promise<void>
  cancelDuel(duelId: string): Promise<void>
  /** Duelo de baile: votás quién bailó mejor */
  voteDuel(duelId: string, pickId: string): Promise<void>

  /** Solo el organizador: prende o apaga la Hora boliche */
  setBoliche(tripId: string, on: boolean): Promise<void>
  /** Cambia tu misión de hoy por una de boliche (una vez) */
  swapBolicheMission(tripId: string): Promise<void>
}

/** Lanza un Error con el mensaje de Supabase (los RPC usan códigos tipo FRIEND_IS_SELF) */
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function getMyProfile(userId: string): Promise<Profile> {
  const sb = requireSupabase()
  const profile = check(
    await sb.from('profiles').select('id, display_name, friend_code').eq('id', userId).single(),
  )
  return profile as Profile
}

async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const sb = requireSupabase()
  check(await sb.from('profiles').update({ display_name: displayName.trim() }).eq('id', userId))
}

async function listFriends(userId: string): Promise<Profile[]> {
  const sb = requireSupabase()
  const rows = check(
    await sb
      .from('friendships')
      .select('friend:profiles!friendships_friend_id_fkey(id, display_name, friend_code)')
      .eq('user_id', userId),
  ) as unknown as { friend: Profile | null }[]

  return rows
    .map((r) => r.friend)
    .filter((f): f is Profile => f !== null)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'es'))
}

async function addFriendByCode(code: string): Promise<Profile> {
  const sb = requireSupabase()
  const rows = check(await sb.rpc('add_friend_by_code', { p_code: code })) as Profile[]
  return rows[0]
}

async function removeFriend(friendId: string): Promise<void> {
  const sb = requireSupabase()
  check(await sb.rpc('remove_friend', { p_friend: friendId }))
}

async function listTrips(): Promise<Trip[]> {
  const sb = requireSupabase()
  const rows = check(
    await sb
      .from('trips')
      .select(
        'id, owner_id, name, trip_date, place, created_at, kind, day_cutoff_hour, members:trip_members(user_id, role, profile:profiles(id, display_name))',
      )
      .order('created_at', { ascending: false }),
  )
  return rows as unknown as Trip[]
}

async function createTrip(trip: NewTrip): Promise<string> {
  const sb = requireSupabase()
  return check(
    await sb.rpc('create_trip', {
      p_name: trip.name,
      p_trip_date: trip.tripDate,
      p_place: trip.place,
      p_member_ids: trip.memberIds,
      p_kind: trip.kind,
    }),
  ) as string
}

// ---------- Juego del viaje (Supabase) ----------

const PHOTO_BUCKET = 'trip-photos'

/** Todas las fotos guardadas del viaje (carpeta <viaje>/<usuario>/…) */
async function listTripPhotos(tripId: string): Promise<string[]> {
  const bucket = requireSupabase().storage.from(PHOTO_BUCKET)
  const page = 1000
  const { data: folders, error } = await bucket.list(tripId, { limit: page })
  if (error) throw new Error(error.message)
  const paths: string[] = []
  for (const folder of folders ?? []) {
    if (folder.id) {
      paths.push(`${tripId}/${folder.name}`)
      continue
    }
    for (let offset = 0; ; offset += page) {
      const { data, error: err } = await bucket.list(`${tripId}/${folder.name}`, { limit: page, offset })
      if (err) throw new Error(err.message)
      for (const file of data ?? []) if (file.id) paths.push(`${tripId}/${folder.name}/${file.name}`)
      if (!data || data.length < page) break
    }
  }
  return paths
}

async function deleteTrip(tripId: string) {
  const sb = requireSupabase()
  // Primero las fotos (mientras sigue existiendo el viaje y se puede comprobar que sos el organizador)
  try {
    const paths = await listTripPhotos(tripId)
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await sb.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100))
      if (error) throw new Error(error.message)
    }
  } catch {
    // Si alguna foto no se pudo borrar, el viaje se elimina igual
  }
  check(await sb.rpc('delete_trip', { p_trip: tripId }))
}

async function addTripMembers(tripId: string, memberIds: string[]) {
  const sb = requireSupabase()
  return check(await sb.rpc('add_trip_members', { p_trip: tripId, p_member_ids: memberIds })) as number
}

const TRIP_COLUMNS =
  'id, owner_id, name, trip_date, place, created_at, kind, mission_points_easy, mission_points_medium, mission_points_extreme, quiebre_penalty, day_cutoff_hour, chef_points, casino_points, duel_points, members:trip_members(user_id, role, profile:profiles(id, display_name))'

/** null hasta saber si la base ya tiene get_trip_state (migración de tiempo real) */
let hasTripState: boolean | null = null

async function getTrip(tripId: string): Promise<TripDetail> {
  if (hasTripState !== false) {
    const sb = requireSupabase()
    // Todo el viaje en un solo pedido (y cierra lo vencido antes de leer)
    const { data, error } = await sb.rpc('get_trip_state', { p_trip: tripId })
    if (!error) {
      hasTripState = true
      return data as TripDetail
    }
    const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message)
    if (!missing) throw new Error(error.message)
    hasTripState = false
  }
  return getTripLegacy(tripId)
}

/** Lectura vieja (22 pedidos), por si todavía no se corrió la migración de tiempo real */
async function getTripLegacy(tripId: string): Promise<TripDetail> {
  const sb = requireSupabase()
  // Cierra votaciones vencidas antes de leer
  check(await sb.rpc('tick_trip', { p_trip: tripId }))
  const [
    trip, drinks, events, missions, cards, eventVotes, challenges, badVotes, options, optionVotes,
    infractions, forfeits, playerForfeits, chefSpins, chefPlayers, chefVotes, casinoSessions, casinoPlayers,
    duels, duelResults, serverTime,
  ] = await Promise.all([
    sb.from('trips').select(TRIP_COLUMNS).eq('id', tripId).single(),
    sb
      .from('trip_drinks')
      .select('id, trip_id, name, emoji, points')
      .eq('trip_id', tripId)
      .eq('archived', false)
      .order('points'),
    sb
      .from('trip_events')
      .select('id, trip_id, user_id, actor_id, kind, points, day, title, emoji, detail, photo_paths, created_at, status, ref_id')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false }),
    sb
      .from('daily_missions')
      .select('id, trip_id, user_id, day, difficulty, mission, points, completed_at, photo_path, group_assigned')
      .eq('trip_id', tripId),
    sb
      .from('player_cards')
      .select('id, trip_id, user_id, card_key, won_day, status, target_user_id, created_at')
      .eq('trip_id', tripId)
      .order('created_at'),
    sb.from('event_votes').select('event_id, voter_id, valid').eq('trip_id', tripId),
    sb
      .from('mission_challenges')
      .select('id, trip_id, mission_id, target_user_id, started_by, phase, bad_until, proposals_until, voting_until, winner_option_id, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false }),
    sb.from('challenge_bad_votes').select('challenge_id, voter_id, bad').eq('trip_id', tripId),
    sb.from('challenge_options').select('id, challenge_id, author_id, text, created_at').eq('trip_id', tripId).order('created_at'),
    sb.from('challenge_option_votes').select('challenge_id, voter_id, option_id').eq('trip_id', tripId),
    sb.from('trip_infractions').select('id, trip_id, name, emoji').eq('trip_id', tripId).eq('archived', false).order('created_at'),
    sb.from('trip_forfeits').select('id, trip_id, text').eq('trip_id', tripId).eq('archived', false).order('created_at'),
    sb
      .from('player_forfeits')
      .select('id, trip_id, user_id, source, reason, forfeit, status, created_at, done_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false }),
    sb
      .from('chef_spins')
      .select('id, trip_id, kind, started_by, status, chosen_user_id, excluded_user_id, photo_path, created_at, spun_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('chef_spin_players').select('spin_id, user_id').eq('trip_id', tripId),
    sb.from('chef_votes').select('spin_id, voter_id, good').eq('trip_id', tripId),
    sb
      .from('casino_sessions')
      .select('id, trip_id, started_by, minutes, prize, status, starts_at, ends_at, report_until, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(10),
    sb.from('casino_players').select('session_id, user_id, amount, event_id, reported_at').eq('trip_id', tripId),
    sb
      .from('duels')
      .select('id, trip_id, kind, challenger_id, opponent_id, seconds, status, day, created_at, starts_at, ends_at, winner_id, event_id')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(30),
    sb.from('duel_results').select('duel_id, user_id, finished_at, shots, last_shot_at, gave_up').eq('trip_id', tripId),
    sb.rpc('server_time'),
  ])
  return {
    trip: check(trip) as unknown as TripDetail['trip'],
    drinks: check(drinks) as Drink[],
    events: check(events) as TripEvent[],
    missions: check(missions) as DailyMission[],
    cards: check(cards) as PlayerCard[],
    eventVotes: check(eventVotes) as EventVote[],
    challenges: check(challenges) as MissionChallenge[],
    badVotes: check(badVotes) as ChallengeBadVote[],
    options: check(options) as ChallengeOption[],
    optionVotes: check(optionVotes) as ChallengeOptionVote[],
    infractions: check(infractions) as Infraction[],
    forfeits: check(forfeits) as Forfeit[],
    playerForfeits: check(playerForfeits) as PlayerForfeit[],
    chefSpins: check(chefSpins) as ChefSpin[],
    chefPlayers: check(chefPlayers) as ChefSpinPlayer[],
    chefVotes: check(chefVotes) as ChefVote[],
    casinoSessions: check(casinoSessions) as CasinoSession[],
    casinoPlayers: check(casinoPlayers) as CasinoPlayer[],
    duels: check(duels) as Duel[],
    duelResults: check(duelResults) as DuelResult[],
    duelVotes: [],
    serverTime: (check(serverTime) as string) ?? new Date().toISOString(),
  }
}

async function saveListItem(table: 'trip_infractions' | 'trip_forfeits', tripId: string, row: Record<string, unknown> & { id?: string }) {
  const sb = requireSupabase()
  const { id, ...values } = row
  if (id) {
    // El tema (normal / boliche) se elige al crearla y no se cambia
    const { theme: _theme, ...changes } = values
    check(await sb.from(table).update(changes).eq('id', id))
  } else check(await sb.from(table).insert({ ...values, trip_id: tripId }))
}

async function archiveListItem(table: 'trip_infractions' | 'trip_forfeits', id: string) {
  const sb = requireSupabase()
  check(await sb.from(table).update({ archived: true }).eq('id', id))
}

async function saveDrink(tripId: string, drink: DrinkInput) {
  const sb = requireSupabase()
  const row = { name: drink.name.trim(), emoji: drink.emoji, points: drink.points }
  if (drink.id) check(await sb.from('trip_drinks').update(row).eq('id', drink.id))
  else check(await sb.from('trip_drinks').insert({ ...row, trip_id: tripId }))
}

async function archiveDrink(drinkId: string) {
  const sb = requireSupabase()
  check(await sb.from('trip_drinks').update({ archived: true }).eq('id', drinkId))
}

async function updateRules(tripId: string, rules: TripRules) {
  const sb = requireSupabase()
  check(await sb.from('trips').update(rules).eq('id', tripId))
}

async function uploadPhoto(tripId: string, userId: string, photo: Blob) {
  const sb = requireSupabase()
  const path = `${tripId}/${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await sb.storage
    .from(PHOTO_BUCKET)
    .upload(path, photo, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(error.message)
  return path
}

// URLs firmadas: el bucket es privado
const signedCache = new Map<string, { url: string; expires: number }>()

async function getPhotoUrls(paths: string[]) {
  const sb = requireSupabase()
  const now = Date.now()
  const result: Record<string, string> = {}
  const missing: string[] = []
  for (const p of new Set(paths)) {
    const cached = signedCache.get(p)
    if (cached && cached.expires > now) result[p] = cached.url
    else missing.push(p)
  }
  if (missing.length > 0) {
    const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(missing, 3600)
    if (error) throw new Error(error.message)
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        result[item.path] = item.signedUrl
        signedCache.set(item.path, { url: item.signedUrl, expires: now + 50 * 60_000 })
      }
    }
  }
  return result
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const sb = requireSupabase()
  return check(await sb.rpc(fn, args))
}

export const supabaseApi: Api = {
  getMyProfile,
  updateDisplayName,
  listFriends,
  addFriendByCode,
  removeFriend,
  listTrips,
  createTrip,
  deleteTrip,
  addTripMembers,

  getTrip,
  async tickTrip(tripId) {
    await rpc('tick_trip', { p_trip: tripId })
  },
  subscribeTrip: (tripId, listener) => listen(`trip:${tripId}`, listener),
  subscribeUser: (userId, listener) => listen(`user:${userId}`, listener),
  saveDrink,
  archiveDrink,
  updateRules,
  uploadPhoto,
  getPhotoUrls,
  async logDrink(tripId, drinkId, photoPath) {
    await rpc('log_drink', { p_trip: tripId, p_drink: drinkId, p_photo: photoPath })
  },
  async chooseMission(tripId, difficulty) {
    await rpc('choose_daily_mission', { p_trip: tripId, p_difficulty: difficulty })
  },
  async completeMission(tripId, photoPath) {
    await rpc('complete_daily_mission', { p_trip: tripId, p_photo: photoPath })
  },
  async reportQuiebre(tripId, userId, photoPaths) {
    await rpc('report_quiebre', { p_trip: tripId, p_user: userId, p_photos: photoPaths })
  },
  async burnPlayer(tripId, userId, drinkId, photoPath) {
    await rpc('burn_player', { p_trip: tripId, p_user: userId, p_drink: drinkId, p_photo: photoPath })
  },
  async spinRoulette(tripId, day) {
    return (await rpc('spin_roulette', { p_trip: tripId, p_day: day })) as CardKey
  },
  async redeemCard(cardId, targetId) {
    await rpc('redeem_card', { p_card: cardId, p_target: targetId })
  },
  async voteEvent(eventId, valid) {
    await rpc('vote_event', { p_event: eventId, p_valid: valid })
  },
  async startMissionChallenge(missionId) {
    await rpc('start_mission_challenge', { p_mission: missionId })
  },
  async voteMissionBad(challengeId, bad) {
    await rpc('vote_mission_bad', { p_challenge: challengeId, p_bad: bad })
  },
  async proposeMissionOption(challengeId, text) {
    await rpc('propose_mission_option', { p_challenge: challengeId, p_text: text })
  },
  async startOptionVote(challengeId) {
    await rpc('start_option_vote', { p_challenge: challengeId })
  },
  async voteMissionOption(challengeId, optionId) {
    await rpc('vote_mission_option', { p_challenge: challengeId, p_option: optionId })
  },
  async pendingCounts() {
    const rows = (await rpc('my_pending', {})) as { trip_id: string; pending: number }[]
    return Object.fromEntries(rows.map((r) => [r.trip_id, Number(r.pending)]))
  },
  saveInfraction: (tripId, item) => saveListItem('trip_infractions', tripId, { ...item, name: item.name.trim() }),
  archiveInfraction: (id) => archiveListItem('trip_infractions', id),
  saveForfeit: (tripId, item) => saveListItem('trip_forfeits', tripId, { ...item, text: item.text.trim() }),
  archiveForfeit: (id) => archiveListItem('trip_forfeits', id),
  async reportInfraction(tripId, userId, infractionId, photoPaths) {
    await rpc('report_infraction', { p_trip: tripId, p_user: userId, p_infraction: infractionId, p_photos: photoPaths })
  },
  async completeForfeit(forfeitId, photoPath) {
    await rpc('complete_forfeit', { p_forfeit: forfeitId, p_photo: photoPath })
  },
  async startChefSpin(tripId, kind) {
    await rpc('start_chef_spin', { p_trip: tripId, p_kind: kind })
  },
  async joinChefSpin(spinId) {
    await rpc('join_chef_spin', { p_spin: spinId })
  },
  async cancelChefSpin(spinId) {
    await rpc('cancel_chef_spin', { p_spin: spinId })
  },
  async chefReady(spinId, photoPath) {
    await rpc('chef_ready', { p_spin: spinId, p_photo: photoPath })
  },
  async voteChef(spinId, good) {
    await rpc('vote_chef', { p_spin: spinId, p_good: good })
  },
  async startCasino(tripId, minutes) {
    await rpc('start_casino', { p_trip: tripId, p_minutes: minutes })
  },
  async joinCasino(sessionId) {
    await rpc('join_casino', { p_session: sessionId })
  },
  async cancelCasino(sessionId) {
    await rpc('cancel_casino', { p_session: sessionId })
  },
  async reportCasino(sessionId, amount, photoPath) {
    await rpc('report_casino', { p_session: sessionId, p_amount: amount, p_photo: photoPath })
  },
  async challengeDuel(tripId, opponentId, kind, seconds) {
    await rpc('challenge_duel', { p_trip: tripId, p_opponent: opponentId, p_kind: kind, p_seconds: seconds })
  },
  async respondDuel(duelId, accept) {
    await rpc('respond_duel', { p_duel: duelId, p_accept: accept })
  },
  async duelAction(duelId, action) {
    await rpc('duel_action', { p_duel: duelId, p_action: action })
  },
  async cancelDuel(duelId) {
    await rpc('cancel_duel', { p_duel: duelId })
  },
  async voteDuel(duelId, pickId) {
    await rpc('vote_duel', { p_duel: duelId, p_pick: pickId })
  },
  async setBoliche(tripId, on) {
    await rpc('set_boliche', { p_trip: tripId, p_on: on })
  },
  async swapBolicheMission(tripId) {
    await rpc('swap_boliche_mission', { p_trip: tripId })
  },
}
