import { and, eq, inArray } from 'drizzle-orm'
import type { db } from '../client'
import { roles, userRoles, users } from '../schema/auth'
import { DEV_SEED_USERS, SEED_ENV, SEED_USER_IDS } from './constants'

type SeedDb = typeof db

const ARGON2ID_PREFIX = '$argon2id$'
const INVALID_DEV_PASSWORD_HASH_ERROR =
  'Invalid DMS_DEV_SEED_PASSWORD_HASH: expected an Argon2id PHC hash starting with $argon2id$.'

export async function seedDevelopmentUsers(database: SeedDb) {
  const passwordHash = process.env[SEED_ENV.devPasswordHash]

  if (passwordHash === undefined) {
    console.log(
      `Skipping development users. Set ${SEED_ENV.devPasswordHash} to an argon2id password hash to enable user seeding.`,
    )
    return { seeded: false, userIds: null }
  }

  validateDevSeedPasswordHash(passwordHash)

  const roleNames = Array.from(new Set(DEV_SEED_USERS.flatMap((user) => user.roles)))
  const roleRows = await database
    .select({ id: roles.id, nama: roles.nama })
    .from(roles)
    .where(inArray(roles.nama, roleNames))

  const roleIdByName = new Map(roleRows.map((role) => [role.nama, role.id]))

  const userIdsByKey: Partial<Record<keyof typeof SEED_USER_IDS, string>> = {}

  for (const user of DEV_SEED_USERS) {
    validateSeedUserRoles(user.username, user.roles)

    await database
      .insert(users)
      .values({
        id: user.id,
        username: user.username,
        email: user.email,
        nipNrp: user.nipNrp,
        passwordHash,
        passwordHashAlgorithm: 'argon2id',
        displayName: user.displayName,
        namaLengkap: user.namaLengkap,
        metadata: { seed: true, developmentOnly: true },
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          email: user.email,
          nipNrp: user.nipNrp,
          displayName: user.displayName,
          namaLengkap: user.namaLengkap,
          metadata: { seed: true, developmentOnly: true },
          isActive: true,
        },
      })

    const [seededUser] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, user.username))
      .limit(1)

    if (!seededUser) {
      throw new Error(`Failed to verify seeded user: ${user.username}`)
    }

    userIdsByKey[user.key] = seededUser.id

    for (const roleName of user.roles) {
      const roleId = roleIdByName.get(roleName)
      if (!roleId) {
        throw new Error(`Missing role ${roleName} for seeded user ${user.username}`)
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
        .where(and(eq(userRoles.userId, seededUser.id), inArray(roles.nama, ['PEGAWAI', 'PPK', 'PPSPM', 'KEPALA_SUB_BAGIAN_UMUM', 'PENANGGUNG_JAWAB_KINERJA'])))

      if (nonAdminRoleRows.length > 0) {
        throw new Error(`Seed user ${user.username} violates ADMIN dedicated-role rule`)
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

function validateDevSeedPasswordHash(passwordHash: string) {
  if (!passwordHash.startsWith(ARGON2ID_PREFIX)) {
    throw new Error(INVALID_DEV_PASSWORD_HASH_ERROR)
  }
}

function validateSeedUserRoles(username: string, roleNames: readonly string[]) {
  if (hasRole(roleNames, 'ADMIN') && roleNames.length > 1) {
    throw new Error(`Seed user ${username} cannot combine ADMIN with other roles`)
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
