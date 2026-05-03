/**
 * Helper functions untuk User Management.
 * Menggunakan Supabase admin client untuk bypass RLS.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoleName } from './types/auth'
import type { UserWithRoles } from './types/user'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthUser {
  id: string
  email: string
  created_at: string
  updated_at: string
  banned: boolean
  disabled: boolean
  disabled_at: string | null
  user_metadata: {
    nama_lengkap?: string
    nip_nrp?: string
    departemen?: string
  }
}

interface AuthUsersResponse {
  users: AuthUser[]
  total: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoleRow = { role?: { nama: RoleName } | null; user_id?: string; [key: string]: any }

// ---------------------------------------------------------------------------
// User Fetching Helpers
// ---------------------------------------------------------------------------

/**
 * Ambil semua user dari auth.users dengan roles dan status mereka.
 * WAJIB menggunakan admin client.
 */
export async function getUsersWithRoles(
  adminClient: SupabaseClient
): Promise<UserWithRoles[]> {
  // 1. Get all users from auth.users via admin listUsers
  const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers()

  if (authError || !authUsers) {
    console.error('[user-helpers] getUsersWithRoles error:', authError)
    return []
  }

  const usersData = authUsers as unknown as AuthUsersResponse

  // 2. Get all user_roles entries
  const { data: roleRows, error: roleError } = await adminClient
    .from('user_roles')
    .select('user_id, role:roles(nama)')

  if (roleError) {
    console.error('[user-helpers] getUserRoles error:', roleError)
    return []
  }

  // 3. Get user status from user_status table
  const { data: statusRows, error: statusError } = await adminClient
    .from('user_status')
    .select('user_id, is_active')

  if (statusError) {
    console.error('[user-helpers] getUserStatus error:', statusError)
    // Continue without status data
  }

  // 4. Build status map: user_id -> is_active (default true)
  const statusMap: Record<string, boolean> = {}
  for (const row of statusRows ?? []) {
    statusMap[(row as any).user_id] = (row as any).is_active
  }

  // 5. Build role map: user_id -> RoleName[]
  const roleMap: Record<string, RoleName[]> = {}
  for (const row of roleRows ?? []) {
    const userId = (row as any).user_id as string
    const roleName = (row as any).role?.nama as RoleName | undefined
    if (userId && roleName) {
      if (!roleMap[userId]) roleMap[userId] = []
      roleMap[userId].push(roleName)
    }
  }

  // 6. Transform to UserWithRoles[]
  return usersData.users.map((u) => {
    // User is active if not explicitly set to inactive in user_status table
    const explicitStatus = statusMap[u.id]
    const isActive = explicitStatus === undefined ? true : explicitStatus

    return {
      id: u.id,
      email: u.email,
      metadata: {
        nama_lengkap: u.user_metadata?.nama_lengkap,
        nip_nrp: u.user_metadata?.nip_nrp,
        departemen: u.user_metadata?.departemen,
      },
      roles: roleMap[u.id] ?? [],
      isActive,
      disabledAt: u.disabled_at,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }
  })
}

/**
 * Ambil single user dengan roles.
 */
export async function getUserWithRoles(
  adminClient: SupabaseClient,
  userId: string
): Promise<UserWithRoles | null> {
  // 1. Get user from auth.users
  const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers()

  if (authError || !authUsers) {
    console.error('[user-helpers] getUserWithRoles error:', authError)
    return null
  }

  const usersData = authUsers as unknown as AuthUsersResponse
  const authUser = usersData.users.find((u) => u.id === userId)
  if (!authUser) return null

  // 2. Get roles
  const { data: roleRows, error: roleError } = await adminClient
    .from('user_roles')
    .select('user_id, role:roles(nama)')
    .eq('user_id', userId)

  if (roleError) {
    console.error('[user-helpers] getUserRoles error:', roleError)
    return null
  }

  const roles: RoleName[] = ((roleRows as any) ?? [])
    .map((r: RoleRow) => r.role?.nama as RoleName | undefined)
    .filter((n: RoleName | undefined): n is RoleName => n !== undefined)

  return {
    id: authUser.id,
    email: authUser.email,
    metadata: {
      nama_lengkap: authUser.user_metadata?.nama_lengkap,
      nip_nrp: authUser.user_metadata?.nip_nrp,
      departemen: authUser.user_metadata?.departemen,
    },
    roles,
    isActive: !authUser.disabled && !authUser.banned,
    disabledAt: authUser.disabled_at,
    createdAt: authUser.created_at,
    updatedAt: authUser.updated_at,
  }
}

// ---------------------------------------------------------------------------
// User CRUD Helpers
// ---------------------------------------------------------------------------

/**
 * Buat user baru dengan roles.
 * RETURNS: user yang dibuat, atau error message
 */
export async function createUserWithRoles(
  adminClient: SupabaseClient,
  payload: {
    email: string
    password: string
    nama_lengkap: string
    nip_nrp: string
    departemen?: string
    roles: RoleName[]
  }
): Promise<{ data?: UserWithRoles; error?: string }> {
  // 1. Create user via admin API
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      nama_lengkap: payload.nama_lengkap,
      nip_nrp: payload.nip_nrp,
      departemen: payload.departemen ?? null,
    },
  })

  if (authError || !authUser.user) {
    const msg = authError?.message ?? 'Gagal membuat user'
    // Check for duplicate email
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return { error: 'Email sudah terdaftar' }
    }
    return { error: msg }
  }

  const userId = authUser.user.id

  // 2. Insert roles — selalu tambahkan PEGAWAI jika belum ada
  const rolesToInsert = payload.roles.includes('PEGAWAI')
    ? payload.roles
    : ['PEGAWAI', ...payload.roles]

  // Get role IDs
  const { data: roleRecords, error: roleError } = await adminClient
    .from('roles')
    .select('id, nama')
    .in('nama', rolesToInsert)

  if (roleError || !roleRecords || roleRecords.length === 0) {
    return { error: 'Role tidak ditemukan' }
  }

  const roleIdMap = new Map(roleRecords.map(r => [r.nama, r.id]))

  // Insert user_roles entries
  const roleEntries = rolesToInsert
    .map(roleName => ({
      user_id: userId,
      role_id: roleIdMap.get(roleName),
    }))
    .filter(e => e.role_id)
    .map(e => ({ user_id: e.user_id!, role_id: e.role_id! }))

  if (roleEntries.length > 0) {
    const { error: insertError } = await adminClient
      .from('user_roles')
      .insert(roleEntries)

    if (insertError) {
      console.error('[user-helpers] createUserWithRoles insert roles error:', insertError)
      // User sudah terbuat, roles gagal — tetap return success dengan warning
    }
  }

  // 3. Return created user
  return getUserWithRoles(adminClient, userId)
    .then(user => user ? { data: user } : { error: 'User dibuat tapi gagal mengambil data' })
}

/**
 * Update user metadata dan roles.
 */
export async function updateUserWithRoles(
  adminClient: SupabaseClient,
  userId: string,
  payload: {
    nama_lengkap?: string
    nip_nrp?: string
    departemen?: string
    roles?: RoleName[]
  }
): Promise<{ data?: UserWithRoles; error?: string }> {
  // 1. Get current user from auth
  const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers()

  if (authError || !authUsers) {
    return { error: 'Gagal mengambil data user' }
  }

  const usersData = authUsers as unknown as AuthUsersResponse
  const authUser = usersData.users.find((u) => u.id === userId)
  if (!authUser) {
    return { error: 'User tidak ditemukan' }
  }

  // 2. Update metadata di auth.users
  const metadataUpdate = {
    ...authUser.user_metadata,
  }
  if (payload.nama_lengkap !== undefined) metadataUpdate.nama_lengkap = payload.nama_lengkap
  if (payload.nip_nrp !== undefined) metadataUpdate.nip_nrp = payload.nip_nrp
  if (payload.departemen !== undefined) metadataUpdate.departemen = payload.departemen

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: metadataUpdate,
  })

  if (updateError) {
    console.error('[user-helpers] updateUserWithRoles error:', updateError)
    return { error: 'Gagal mengupdate metadata' }
  }

  // 3. Sync roles if provided
  if (payload.roles !== undefined) {
    // Get current roles
    const { data: currentRoles } = await adminClient
      .from('user_roles')
      .select('role:roles(nama)')
      .eq('user_id', userId)

    const currentRoleNames = ((currentRoles as any) ?? [])
      .map((r: RoleRow) => r.role?.nama as RoleName | undefined)
      .filter((n: RoleName | undefined): n is RoleName => n !== undefined)

    // Roles to add
    const rolesToAdd = payload.roles.filter(r => !currentRoleNames.includes(r))
    // Roles to remove (keep PEGAWAI mandatory)
    const rolesToRemove = currentRoleNames.filter((r: RoleName) =>
      !payload.roles!.includes(r) && r !== 'PEGAWAI'
    )

    if (rolesToAdd.length > 0 || rolesToRemove.length > 0) {
      // Get role IDs
      const allRoles = [...new Set([...rolesToAdd, ...rolesToRemove])]
      const { data: roleRecords } = await adminClient
        .from('roles')
        .select('id, nama')
        .in('nama', allRoles)

      const roleIdMap = new Map(roleRecords?.map(r => [r.nama, r.id]))

      // Insert new roles (upsert to handle duplicate gracefully)
      for (const roleName of rolesToAdd) {
        const roleId = roleIdMap.get(roleName)
        if (roleId) {
          await adminClient
            .from('user_roles')
            .upsert({ user_id: userId, role_id: roleId })
        }
      }

      // Delete removed roles
      for (const roleName of rolesToRemove) {
        const roleId = roleIdMap.get(roleName)
        if (roleId) {
          await adminClient
            .from('user_roles')
            .delete()
            .eq('user_id', userId)
            .eq('role_id', roleId)
        }
      }
    }
  }

  // 4. Return updated user
  return getUserWithRoles(adminClient, userId)
    .then(user => user ? { data: user } : { error: 'User diupdate tapi gagal mengambil data' })
}

/**
 * Reset password user.
 */
export async function resetUserPassword(
  adminClient: SupabaseClient,
  userId: string,
  newPassword: string
): Promise<{ error?: string }> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) {
    console.error('[user-helpers] resetUserPassword error:', error)
    return { error: 'Gagal mereset password' }
  }

  return {}
}

/**
 * Deactivate user by inserting/updating user_status table.
 * This approach is more reliable than Supabase Auth's disabled attribute.
 */
export async function deactivateUser(
  adminClient: SupabaseClient,
  userId: string
): Promise<{ error?: string }> {
  // Upsert user status to inactive
  const { error } = await adminClient
    .from('user_status')
    .upsert({
      user_id: userId,
      is_active: false,
      deactivated_at: new Date().toISOString(),
    })

  if (error) {
    console.error('[user-helpers] deactivateUser error:', error)
    return { error: 'Gagal menonaktifkan user' }
  }

  return {}
}

/**
 * Activate (reactivate) user by updating user_status table.
 */
export async function activateUser(
  adminClient: SupabaseClient,
  userId: string
): Promise<{ error?: string }> {
  // Upsert user status to active
  const { error } = await adminClient
    .from('user_status')
    .upsert({
      user_id: userId,
      is_active: true,
      deactivated_at: null,
    })

  if (error) {
    console.error('[user-helpers] activateUser error:', error)
    return { error: 'Gagal mengaktifkan user' }
  }

  return {}
}
