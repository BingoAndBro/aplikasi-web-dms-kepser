// Server-only module. Do not import from client components.
import { and, eq, isNotNull, isNull, lte, or } from 'drizzle-orm'

import { db } from '#/db/client'
import { roles, sessions, userRoles, users } from '#/db/schema/auth'
import { ROLE_NAMES, type RoleName } from '#/lib/constants/roles'
import { isLikelySessionTokenHash } from './session-token'

export type CreateSessionRecordInput = {
  userId: string
  tokenHash: string
  expiresAt: Date
  rememberMe?: boolean
  userAgent?: string | null
  ipAddress?: string | null
}

export type CreatedSessionRecord = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
  rememberMe: boolean
  userAgent: string | null
  ipAddress: string | null
}

export type SessionUser = {
  id: string
  username: string
  displayName: string | null
  namaLengkap: string | null
  nipNrp: string | null
  departemen: string | null
  isActive: boolean
}

export type SessionWithUserAndRoles = {
  session: CreatedSessionRecord
  user: SessionUser
  roles: RoleName[]
}

export async function createSessionRecord(
  input: CreateSessionRecordInput,
): Promise<CreatedSessionRecord> {
  assertLikelyTokenHash(input.tokenHash)

  const [created] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      rememberMe: input.rememberMe ?? false,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    })
    .returning()

  if (!created) {
    throw new Error('Failed to create session record.')
  }

  return created
}

export async function findSessionByTokenHash(
  tokenHash: string,
): Promise<SessionWithUserAndRoles | null> {
  if (!isLikelySessionTokenHash(tokenHash)) {
    return null
  }

  const rows = await db
    .select({
      session: sessions,
      user: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        namaLengkap: users.namaLengkap,
        nipNrp: users.nipNrp,
        departemen: users.departemen,
        isActive: users.isActive,
      },
      roleName: roles.nama,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(
      eq(sessions.tokenHash, tokenHash),
      isNull(sessions.revokedAt),
    ))

  if (rows.length === 0) {
    return null
  }

  const first = rows[0]
  if (!first || !first.user.isActive || first.session.expiresAt <= new Date()) {
    return null
  }

  return {
    session: first.session,
    user: first.user,
    roles: rows
      .map((row) => row.roleName)
      .filter(isRoleName),
  }
}

export async function revokeSessionByTokenHash(tokenHash: string): Promise<void> {
  if (!isLikelySessionTokenHash(tokenHash)) {
    return
  }

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(sessions.tokenHash, tokenHash),
      isNull(sessions.revokedAt),
    ))
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  if (!isNonEmptyString(userId)) {
    return
  }

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(sessions.userId, userId),
      isNull(sessions.revokedAt),
    ))
}

export async function touchSessionLastUsedAt(sessionId: string): Promise<void> {
  if (!isNonEmptyString(sessionId)) {
    return
  }

  await db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(and(
      eq(sessions.id, sessionId),
      isNull(sessions.revokedAt),
    ))
}

export async function deleteExpiredOrRevokedSessions(now = new Date()): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(or(
      lte(sessions.expiresAt, now),
      isNotNull(sessions.revokedAt),
    ))
    .returning({ id: sessions.id })

  return deleted.length
}

function assertLikelyTokenHash(tokenHash: string): void {
  if (!isLikelySessionTokenHash(tokenHash)) {
    throw new Error('Expected a base64url SHA-256 session token hash.')
  }
}

function isNonEmptyString(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isRoleName(value: string | null): value is RoleName {
  return typeof value === 'string' && ROLE_NAMES.includes(value as RoleName)
}

