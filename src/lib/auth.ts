import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleName, AppSession } from './types/auth'
import { ROLE_NAMES, ROLES } from './constants/roles'

export const ACTIVE_ROLE_COOKIE = 'dms_active_role'

// ---------------------------------------------------------------------------
// Cookie Helpers
// ---------------------------------------------------------------------------

export function getActiveRoleFromCookies(cookieHeader: string | null): RoleName | null {
  if (!cookieHeader) return null
  const cookies = cookieHeader.split('; ').map(c => {
    const eq = c.indexOf('=')
    return eq === -1 ? { name: '', value: '' } : { name: c.slice(0, eq).trim(), value: c.slice(eq + 1) }
  })
  const role = cookies.find(c => c.name === ACTIVE_ROLE_COOKIE)?.value as RoleName | undefined
  return role && isRoleName(role) ? role : null
}

export function setActiveRoleCookieHeader(
  existingHeader: string | null,
  role: RoleName,
  maxAge = 60 * 60 * 24 * 30 // 30 days
): string {
  // Remove existing dms_active_role
  const cookies = existingHeader
    ? existingHeader.split('; ').filter(c => !c.startsWith(`${ACTIVE_ROLE_COOKIE}=`))
    : []
  // Add new cookie
  cookies.push(`${ACTIVE_ROLE_COOKIE}=${role}; Path=/; Max-Age=${maxAge}; SameSite=Lax`)
  return cookies.join('; ')
}

export function clearActiveRoleCookieHeader(existingHeader: string | null): string {
  if (!existingHeader) return ''
  return existingHeader
    .split('; ')
    .filter(c => !c.trim().startsWith(`${ACTIVE_ROLE_COOKIE}=`))
    .join('; ')
}

// ---------------------------------------------------------------------------
// Auth Helpers
// ---------------------------------------------------------------------------

/**
 * Ambil session dari Supabase server client.
 * ⚠️ UNVERIFIED — tidak untuk penggunaan server-side.
 * Gunakan getServerSession() untuk verifikasi keamanan.
 */
export async function getSession(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * Ambil user yang terverifikasi dari Supabase (server-side).
 * Menggunakan getUser() yang menghubungi Auth server untuk verifikasi.
 */
export async function getServerSession(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  const { data: sessionData } = await supabase.auth.getSession()
  return sessionData.session
}

/**
 * Ambil semua role yang dimiliki user
 */
export async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<RoleName[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role:roles(nama)')
    .eq('user_id', userId)

  if (error || !data) return []

  const roleNames = data
    .map((row: any) => row.role?.nama as RoleName | undefined)
    .filter((n): n is RoleName => n !== undefined)

  return roleNames
}

/**
 * Cek apakah user punya role tertentu
 */
export async function hasRole(
  supabase: SupabaseClient,
  userId: string,
  role: RoleName
): Promise<boolean> {
  const roles = await getUserRole(supabase, userId)
  return roles.includes(role)
}

/**
 * Cek apakah user punya SALAH SATU dari roles
 */
export async function hasAnyRole(
  supabase: SupabaseClient,
  userId: string,
  roles: RoleName[]
): Promise<boolean> {
  if (roles.length === 0) return false
  const userRoles = await getUserRole(supabase, userId)
  return roles.some(r => userRoles.includes(r))
}

/**
 * Tentukan primary role: PEGAWAI priority → fallback ke role pertama
 */
export function getPrimaryRole(roles: RoleName[]): RoleName {
  if (roles.length === 0) return ROLES.PEGAWAI
  // ADMIN always takes priority — admin users need admin UI access
  if (roles.includes(ROLES.ADMIN)) return ROLES.ADMIN
  // Priority order for non-admin users
  const priority: RoleName[] = [ROLES.PEGAWAI, ROLES.PPK, ROLES.BENDAHARA, ROLES.ARSIPARIS]
  for (const r of priority) {
    if (roles.includes(r)) return r
  }
  return roles[0]
}

/**
 * Bangun AppSession dari Supabase session + role data + cookie
 */
export async function buildAppSession(
  supabase: SupabaseClient,
  cookieHeader: string | null
): Promise<AppSession | null> {
  const session = await getServerSession(supabase)
  if (!session) return null

  const roles = await getUserRole(supabase, session.user.id)
  const primaryRole = getPrimaryRole(roles)

  // activeRole dari cookie, fallback ke primary role
  const cookieRole = getActiveRoleFromCookies(cookieHeader)
  const activeRole = cookieRole && roles.includes(cookieRole) ? cookieRole : primaryRole

  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      userName: session.user.user_metadata?.user_name as string | undefined,
      createdAt: session.user.created_at ?? '',
    },
    roles,
    activeRole,
    primaryRole,
  }
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isRoleName(value: string): value is RoleName {
  return ROLE_NAMES.includes(value as RoleName)
}
