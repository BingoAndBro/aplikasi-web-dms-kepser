// Server-only local password helpers for Phase 10D password replacement routes.
import { eq } from 'drizzle-orm'

import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { PASSWORD_HASH_ALGORITHM, hashPassword, verifyPassword } from '#/lib/auth/password'
import { revokeAllUserSessions } from '#/lib/auth/session-repository'

export type LocalPasswordMutationResult =
  | { success: true }
  | { success?: never; error: string; status: number }

export async function resetLocalUserPassword(
  userId: string,
  newPassword: string,
): Promise<LocalPasswordMutationResult> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))

  if (!existing) {
    return { error: 'User tidak ditemukan', status: 404 }
  }

  const now = new Date()
  const passwordHash = await hashPassword(newPassword)

  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      passwordHashAlgorithm: PASSWORD_HASH_ALGORITHM,
      passwordUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id })

  if (!updated) {
    return { error: 'User tidak ditemukan', status: 404 }
  }

  await revokeAllUserSessions(userId)
  return { success: true }
}

export async function changeLocalUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<LocalPasswordMutationResult> {
  const [existing] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))

  if (!existing) {
    return { error: 'Unauthorized', status: 401 }
  }

  const currentPasswordMatches = await verifyPassword(existing.passwordHash, currentPassword)
  if (!currentPasswordMatches) {
    return { error: 'Password lama salah', status: 400 }
  }

  if (currentPassword === newPassword) {
    return { error: 'Password baru harus berbeda dari password lama', status: 400 }
  }

  const now = new Date()
  const passwordHash = await hashPassword(newPassword)

  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      passwordHashAlgorithm: PASSWORD_HASH_ALGORITHM,
      passwordUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id })

  if (!updated) {
    return { error: 'Unauthorized', status: 401 }
  }

  await revokeAllUserSessions(userId)
  return { success: true }
}
