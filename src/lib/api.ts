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

export type Trip = {
  id: string
  owner_id: string
  name: string
  trip_date: string | null
  place: string | null
  created_at: string
  members: TripMember[]
}

export type NewTrip = {
  name: string
  tripDate: string | null
  place: string | null
  memberIds: string[]
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
        'id, owner_id, name, trip_date, place, created_at, members:trip_members(user_id, role, profile:profiles(id, display_name))',
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
    }),
  ) as string
}

export const supabaseApi: Api = {
  getMyProfile,
  updateDisplayName,
  listFriends,
  addFriendByCode,
  removeFriend,
  listTrips,
  createTrip,
}
