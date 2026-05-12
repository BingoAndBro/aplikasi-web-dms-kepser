import { and, eq, inArray } from 'drizzle-orm'
import type { db } from '../client'
import { roles, userRoles, users } from '../schema/auth'
import { DEV_SEED_USERS, SEED_ENV, SEED_USER_IDS } from './constants'

type SeedDb = typeof db

export async function seedDevelopmentUsers(database: SeedDb) {
  const passwordHash = process.env[SEED_ENV.devPasswordHash]

  if (!passwordHash) {
    console.log(
      `Skipping development users. Set ${SEED_ENV.devPasswordHash} to an argon2id password hash to enable user seeding.`,
    )
    return { seeded: false, userIds: null }
  }

  const roleNames = Array.from(new Set(DEV_SEED_USERS.flatMap((user) => user.roles)))
  const roleRows = await database
    .select({ id: roles.id, nama: roles.nama })
    .from(roles)
    .where(inArray(roles.nama, roleNames))

  const roleIdByName = new Map(roleRows.map((role) => [role.nama, role.id]))

  const userIdsByKey: Partial<Record<keyof typeof SEED_USER_IDS, string>> = {}

  for (const user of DEV_SEED_USERS) {
    validateSeedUserRoles(user.email, user.roles)

    await database
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        passwordHash,
        passwordHashAlgorithm: 'argon2id',
        displayName: user.displayName,
        namaLengkap: user.namaLengkap,
        metadata: { seed: true, developmentOnly: true },
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          displayName: user.displayName,
          namaLengkap: user.namaLengkap,
          metadata: { seed: true, developmentOnly: true },
          isActive: true,
        },
      })

    const [seededUser] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email))
      .limit(1)

    if (!seededUser) {
      throw new Error(`Failed to verify seeded user: ${user.email}`)
    }

    userIdsByKey[user.key] = seededUser.id

    for (const roleName of user.roles) {
      const roleId = roleIdByName.get(roleName)
      if (!roleId) {
        throw new Error(`Missing role ${roleName} for seeded user ${user.email}`)
      }

      await database
        .insert(userRoles)
        .values({
          userId: seededUser.id,
          roleId,
        })
        .onConflictDoNothing()
    }

    if (hasRole(user.roles, 'ADMIN')) {
      const nonAdminRoleRows = await database
        .select({ roleName: roles.nama })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, seededUser.id), inArray(roles.nama, ['PEGAWAI', 'PPK', 'BENDAHARA', 'ARSIPARIS'])))

      if (nonAdminRoleRows.length > 0) {
        throw new Error(`Seed user ${user.email} violates ADMIN dedicated-role rule`)
      }
    }
  }

  return {
    seeded: true,
    userIds: {
      admin: requireSeededUserId(userIdsByKey, 'admin'),
      ppk: requireSeededUserId(userIdsByKey, 'ppk'),
    },
  }
}

function validateSeedUserRoles(email: string, roleNames: readonly string[]) {
  if (hasRole(roleNames, 'ADMIN') && roleNames.length > 1) {
    throw new Error(`Seed user ${email} cannot combine ADMIN with other roles`)
  }
}

function hasRole(roleNames: readonly string[], roleName: string) {
  return roleNames.some((value) => value === roleName)
}

function requireSeededUserId(
  userIdsByKey: Partial<Record<keyof typeof SEED_USER_IDS, string>>,
  key: keyof typeof SEED_USER_IDS,
) {
  const id = userIdsByKey[key]
  if (!id) {
    throw new Error(`Missing seeded user id for ${key}`)
  }
  return id
}
