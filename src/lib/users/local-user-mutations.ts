// Server-only local user mutation helpers for admin user-management routes.
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '#/db/client'
import { roles as rolesTable, userRoles, users } from '#/db/schema/auth'
import { PASSWORD_HASH_ALGORITHM, hashPassword } from '#/lib/auth/password'
import { revokeAllUserSessions } from '#/lib/auth/session-repository'
import { ROLES, type RoleName } from '#/lib/constants/roles'
import type { UserWithRoles } from '#/lib/types/user'
import { getLocalUserWithRoles } from './local-user-queries'
import {
  evaluateAdminDeactivationPolicy,
  evaluateAdminRoleMutationPolicy,
  hasAdminMixedWithNonAdmin,
  normalizeAdminRolePayload,
} from './role-assignment'

export {
  findInvalidCanonicalRoles,
  hasAdminMixedWithNonAdmin,
  normalizeAdminRolePayload,
} from './role-assignment'

export type CreateLocalUserPayload = {
  email: string
  password: string
  nama_lengkap: string
  nip_nrp: string
  departemen?: string
  roles: RoleName[]
}

export type UpdateLocalUserPayload = {
  nama_lengkap?: string
  nip_nrp?: string
  departemen?: string
  roles?: RoleName[]
}

export type UpdateLocalUserOptions = {
  actingUserId: string
}

export type LocalUserMutationResult =
  | { data: UserWithRoles; error?: never; status?: never }
  | { data?: never; error: string; status: number }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type LocalUserTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type UserMutationTxResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number }

export function isValidUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export async function createLocalUserWithRoles(
  payload: CreateLocalUserPayload,
): Promise<LocalUserMutationResult> {
  const rolesToAssign = normalizeAdminRolePayload(payload.roles)

  if (hasAdminMixedWithNonAdmin(rolesToAssign)) {
    return { error: 'ADMIN tidak boleh digabung dengan role lain', status: 400 }
  }

  const email = normalizeEmail(payload.email)
  const passwordHash = await hashPassword(payload.password)
  const now = new Date()

  try {
    const createdUserId = await db.transaction(async (tx) => {
      const roleRecords = await getRoleRecords(tx, rolesToAssign)
      const [created] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          passwordHashAlgorithm: PASSWORD_HASH_ALGORITHM,
          displayName: payload.nama_lengkap,
          namaLengkap: payload.nama_lengkap,
          nipNrp: payload.nip_nrp,
          departemen: payload.departemen ?? null,
          metadata: toProfileMetadata(payload),
          isActive: true,
          passwordUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: users.id })

      if (!created) {
        throw new Error('Failed to create local user.')
      }

      await replaceUserRoles(tx, created.id, roleRecords)
      return created.id
    })

    const user = await getLocalUserWithRoles(createdUserId)
    return user
      ? { data: user }
      : { error: 'User dibuat tapi gagal mengambil data', status: 500 }
  } catch (error) {
    if (isInvalidRoleError(error)) {
      return { error: (error as Error).message, status: 400 }
    }

    if (isUniqueEmailError(error)) {
      return { error: 'Email sudah terdaftar', status: 409 }
    }

    console.error('[local-user-mutations] createLocalUserWithRoles error:', toSafeErrorLog(error))
    return { error: 'Gagal membuat user', status: 500 }
  }
}

export async function updateLocalUserWithRoles(
  userId: string,
  payload: UpdateLocalUserPayload,
  options: UpdateLocalUserOptions,
): Promise<LocalUserMutationResult> {
  if (!isValidUserId(userId)) {
    return { error: 'User ID tidak valid', status: 400 }
  }
  if (!isValidUserId(options.actingUserId)) {
    return { error: 'User ID tidak valid', status: 400 }
  }

  const rolesToAssign = payload.roles === undefined
    ? undefined
    : normalizeAdminRolePayload(payload.roles)

  if (rolesToAssign && hasAdminMixedWithNonAdmin(rolesToAssign)) {
    return { error: 'ADMIN tidak boleh digabung dengan role lain', status: 400 }
  }

  try {
    const txResult = await db.transaction(async (tx): Promise<UserMutationTxResult> => {
      const [existing] = await tx
        .select({
          id: users.id,
          namaLengkap: users.namaLengkap,
          nipNrp: users.nipNrp,
          departemen: users.departemen,
          metadata: users.metadata,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, userId))

      if (!existing) {
        return { ok: false, error: 'User tidak ditemukan', status: 404 }
      }

      if (rolesToAssign) {
        const currentRoles = await getUserRoleNames(tx, userId)
        const activeAdminCount = existing.isActive && currentRoles.includes(ROLES.ADMIN)
          ? await countActiveAdmins(tx)
          : 0
        const policyError = evaluateAdminRoleMutationPolicy({
          actingUserId: options.actingUserId,
          targetUserId: userId,
          currentRoles,
          nextRoles: rolesToAssign,
          targetIsActive: existing.isActive,
          activeAdminCount,
        })

        if (policyError) {
          return { ok: false, error: policyError, status: 400 }
        }
      }

      const nextProfile = {
        nama_lengkap: payload.nama_lengkap ?? existing.namaLengkap ?? undefined,
        nip_nrp: payload.nip_nrp ?? existing.nipNrp ?? undefined,
        departemen: payload.departemen ?? existing.departemen ?? undefined,
      }
      const nextMetadata = mergeProfileMetadata(existing.metadata, nextProfile)

      await tx
        .update(users)
        .set({
          displayName: payload.nama_lengkap ?? existing.namaLengkap,
          namaLengkap: payload.nama_lengkap ?? existing.namaLengkap,
          nipNrp: payload.nip_nrp ?? existing.nipNrp,
          departemen: payload.departemen ?? existing.departemen,
          metadata: nextMetadata,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))

      if (rolesToAssign) {
        const roleRecords = await getRoleRecords(tx, rolesToAssign)
        await replaceUserRoles(tx, userId, roleRecords)
      }

      return { ok: true, userId }
    })

    if (!txResult.ok) {
      return { error: txResult.error, status: txResult.status }
    }

    const user = await getLocalUserWithRoles(txResult.userId)
    return user
      ? { data: user }
      : { error: 'User diupdate tapi gagal mengambil data', status: 500 }
  } catch (error) {
    if (isInvalidRoleError(error)) {
      return { error: (error as Error).message, status: 400 }
    }

    console.error('[local-user-mutations] updateLocalUserWithRoles error:', error)
    return { error: 'Gagal mengupdate user', status: 500 }
  }
}

export async function activateLocalUser(userId: string): Promise<{ error?: string; status?: number }> {
  if (!isValidUserId(userId)) {
    return { error: 'User ID tidak valid', status: 400 }
  }

  const [updated] = await db
    .update(users)
    .set({
      isActive: true,
      inactiveReason: null,
      deactivatedAt: null,
      deactivatedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id })

  if (!updated) {
    return { error: 'User tidak ditemukan', status: 404 }
  }

  return {}
}

export async function deactivateLocalUser(
  userId: string,
  deactivatedBy: string,
): Promise<{ error?: string; status?: number }> {
  if (!isValidUserId(userId)) {
    return { error: 'User ID tidak valid', status: 400 }
  }
  if (!isValidUserId(deactivatedBy)) {
    return { error: 'User ID tidak valid', status: 400 }
  }

  const txResult = await db.transaction(async (tx): Promise<UserMutationTxResult> => {
    const [existing] = await tx
      .select({
        id: users.id,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))

    if (!existing) {
      return { ok: false, error: 'User tidak ditemukan', status: 404 }
    }

    const currentRoles = await getUserRoleNames(tx, userId)
    const activeAdminCount = existing.isActive && currentRoles.includes(ROLES.ADMIN)
      ? await countActiveAdmins(tx)
      : 0
    const policyError = evaluateAdminDeactivationPolicy({
      currentRoles,
      targetIsActive: existing.isActive,
      activeAdminCount,
    })

    if (policyError) {
      return { ok: false, error: policyError, status: 400 }
    }

    const [updated] = await tx
      .update(users)
      .set({
        isActive: false,
        inactiveReason: 'Deactivated by admin',
        deactivatedAt: new Date(),
        deactivatedBy,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id })

    return updated
      ? { ok: true, userId }
      : { ok: false, error: 'User tidak ditemukan', status: 404 }
  })

  if (!txResult.ok) {
    return { error: txResult.error, status: txResult.status }
  }

  await revokeAllUserSessions(userId)

  return {}
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toProfileMetadata(profile: {
  nama_lengkap?: string
  nip_nrp?: string
  departemen?: string
}): Record<string, string> {
  const metadata: Record<string, string> = {}

  if (profile.nama_lengkap) metadata.nama_lengkap = profile.nama_lengkap
  if (profile.nip_nrp) metadata.nip_nrp = profile.nip_nrp
  if (profile.departemen) metadata.departemen = profile.departemen

  return metadata
}

function mergeProfileMetadata(
  current: Record<string, unknown>,
  profile: {
    nama_lengkap?: string
    nip_nrp?: string
    departemen?: string
  },
): Record<string, unknown> {
  const metadata = {
    ...current,
    ...toProfileMetadata(profile),
  }

  if (profile.departemen !== undefined && profile.departemen.trim().length === 0) {
    delete metadata.departemen
  }

  return metadata
}

function toSafeErrorLog(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return { message: String(error) }
  }

  const candidate = error as {
    code?: unknown
    constraint?: unknown
    name?: unknown
    message?: unknown
  }

  return {
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  }
}

async function getRoleRecords(
  tx: LocalUserTransaction,
  roleNames: RoleName[],
): Promise<Array<{ id: string; nama: string }>> {
  const roleRecords = await tx
    .select({ id: rolesTable.id, nama: rolesTable.nama })
    .from(rolesTable)
    .where(inArray(rolesTable.nama, roleNames))

  const found = new Set(roleRecords.map((role) => role.nama))
  const missing = roleNames.filter((role) => !found.has(role))

  if (missing.length > 0) {
    throw new Error(`Role tidak valid: ${missing.join(', ')}`)
  }

  return roleRecords
}

async function getUserRoleNames(
  tx: LocalUserTransaction,
  userId: string,
): Promise<RoleName[]> {
  const roleRows = await tx
    .select({ nama: rolesTable.nama })
    .from(userRoles)
    .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
    .where(eq(userRoles.userId, userId))

  return roleRows
    .map((row) => row.nama)
    .filter((role): role is RoleName => typeof role === 'string' && role in ROLES)
}

async function countActiveAdmins(tx: LocalUserTransaction): Promise<number> {
  const activeAdminRows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(users.id, userRoles.userId))
    .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
    .where(and(
      eq(users.isActive, true),
      eq(rolesTable.nama, ROLES.ADMIN),
    ))

  return activeAdminRows.length
}

async function replaceUserRoles(
  tx: LocalUserTransaction,
  userId: string,
  roleRecords: Array<{ id: string }>,
): Promise<void> {
  await tx.delete(userRoles).where(eq(userRoles.userId, userId))

  if (roleRecords.length === 0) return

  await tx.insert(userRoles).values(
    roleRecords.map((role) => ({
      userId,
      roleId: role.id,
    })),
  )
}

function isUniqueEmailError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: string }).code === '23505'
    && String((error as { constraint?: string }).constraint ?? '').includes('auth_users_email_unique'),
  )
}

function isInvalidRoleError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Role tidak valid:')
}
