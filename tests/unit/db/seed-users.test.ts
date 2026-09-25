import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedDevelopmentUsers } from '#/db/seed/users'
import { DEV_SEED_USERS, SEED_ENV } from '#/db/seed/constants'

const ORIGINAL_DEV_PASSWORD_HASH = process.env[SEED_ENV.devPasswordHash]

afterEach(() => {
  vi.restoreAllMocks()

  if (ORIGINAL_DEV_PASSWORD_HASH === undefined) {
    delete process.env[SEED_ENV.devPasswordHash]
  } else {
    process.env[SEED_ENV.devPasswordHash] = ORIGINAL_DEV_PASSWORD_HASH
  }
})

describe('seedDevelopmentUsers', () => {
  it('skips development users when the seed password hash is missing', async () => {
    delete process.env[SEED_ENV.devPasswordHash]

    const database = createSeedDatabaseMock()
    const result = await seedDevelopmentUsers(database)

    expect(result).toEqual({ seeded: false, userIds: null })
    expect(database.select).not.toHaveBeenCalled()
    expect(database.insert).not.toHaveBeenCalled()
  })

  it.each(['', '$v=19$m=65536,t=3,p=1$c2FsdA$dmVyeS1mYWtlLWhhc2g'])(
    'rejects an expanded or malformed seed password hash without inserting users',
    async (corruptedHash) => {
      process.env[SEED_ENV.devPasswordHash] = corruptedHash

      const database = createSeedDatabaseMock()

      await expect(seedDevelopmentUsers(database)).rejects.toThrow(
        'Invalid DMS_DEV_SEED_PASSWORD_HASH: expected an Argon2id PHC hash starting with $argon2id$.',
      )

      try {
        await seedDevelopmentUsers(database)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)

        if (corruptedHash.length > 0) {
          expect((error as Error).message).not.toContain(corruptedHash)
        }
      }

      expect(database.select).not.toHaveBeenCalled()
      expect(database.insert).not.toHaveBeenCalled()
    },
  )

  it('continues to the database insert path for a literal Argon2id PHC-shaped hash', async () => {
    process.env[SEED_ENV.devPasswordHash] =
      '$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$dmVyeS1mYWtlLWhhc2g'

    const database = createSeedDatabaseMock()
    const result = await seedDevelopmentUsers(database)

    expect(result.seeded).toBe(true)
    expect(result.userIds).toEqual({
      admin: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ppk: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    })
    // One `insert(users)` call per seed user, plus one `insert(userRoles)` call per role assignment.
    const expectedRoleAssignmentInserts = DEV_SEED_USERS.reduce((sum, user) => sum + user.roles.length, 0)
    expect(database.insert).toHaveBeenCalledTimes(DEV_SEED_USERS.length + expectedRoleAssignmentInserts)
  })
})

function createSeedDatabaseMock() {
  const roleRows = [
    { id: '11111111-1111-4111-8111-111111111111', nama: 'PEGAWAI' },
    { id: '22222222-2222-4222-8222-222222222222', nama: 'PPK' },
    { id: '33333333-3333-4333-8333-333333333333', nama: 'PPSPM' },
    { id: '44444444-4444-4444-8444-444444444444', nama: 'KEPALA_SUB_BAGIAN_UMUM' },
    { id: '55555555-5555-4555-8555-555555555555', nama: 'ADMIN' },
    { id: '66666666-6666-4666-8666-666666666666', nama: 'PENANGGUNG_JAWAB_KINERJA' },
  ]

  const selectResults: unknown[][] = [roleRows]

  for (const user of DEV_SEED_USERS) {
    selectResults.push([{ id: user.id }])

    if (user.key === 'admin') {
      selectResults.push([])
    }
  }

  const select = vi.fn(() => {
    const query = {
      from: vi.fn(() => query),
      innerJoin: vi.fn(() => query),
      where: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(selectResults.shift() ?? [])),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(selectResults.shift() ?? []).then(resolve, reject),
    }

    return query
  })

  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      onConflictDoNothing: vi.fn(() => Promise.resolve()),
    })),
  }))

  return { select, insert } as unknown as Parameters<typeof seedDevelopmentUsers>[0]
}
