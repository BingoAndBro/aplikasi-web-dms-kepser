import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ACTING_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  dbTransaction: vi.fn(),
  hashPassword: vi.fn(),
}))

vi.mock('#/db/client', () => ({
  db: { transaction: mocks.dbTransaction },
}))

vi.mock('#/lib/auth/password', () => ({
  hashPassword: mocks.hashPassword,
  PASSWORD_HASH_ALGORITHM: 'argon2id',
}))

import { createLocalUserWithRoles, updateLocalUserWithRoles } from '#/lib/users/local-user-mutations'

const BASE_PAYLOAD = {
  username: 'budi.santoso',
  email: undefined,
  password: 'password123',
  nama_lengkap: 'Budi Santoso',
  nip_nrp: '19900101000000001',
  roles: ['PEGAWAI'] as const,
}

describe('createLocalUserWithRoles unique-violation mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hashPassword.mockResolvedValue('$argon2id$fake-hash')
  })

  it('maps a duplicate username to a 409 in Indonesian', async () => {
    mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(transactionThatFailsInsert({
        code: '23505',
        constraint: 'auth_users_username_unique',
      })))

    const result = await createLocalUserWithRoles({ ...BASE_PAYLOAD, roles: [...BASE_PAYLOAD.roles] })

    expect(result).toEqual({ error: 'Username sudah digunakan', status: 409 })
  })

  it('maps a duplicate NIP to a 409 in Indonesian', async () => {
    mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(transactionThatFailsInsert({
        code: '23505',
        constraint: 'auth_users_nip_nrp_unique',
      })))

    const result = await createLocalUserWithRoles({ ...BASE_PAYLOAD, roles: [...BASE_PAYLOAD.roles] })

    expect(result).toEqual({ error: 'NIP/NRP sudah terdaftar', status: 409 })
  })

  it('maps a username format check violation to a 400', async () => {
    mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(transactionThatFailsInsert({
        code: '23514',
        constraint: 'auth_users_username_format_check',
      })))

    const result = await createLocalUserWithRoles({ ...BASE_PAYLOAD, roles: [...BASE_PAYLOAD.roles] })

    expect(result).toEqual({ error: 'Format username tidak valid', status: 400 })
  })
})

describe('updateLocalUserWithRoles unique-violation mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps a duplicate username on edit to a 409 in Indonesian', async () => {
    mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(transactionThatFailsUpdate({
        code: '23505',
        constraint: 'auth_users_username_unique',
      })))

    const result = await updateLocalUserWithRoles(
      USER_ID,
      { username: 'sudah.dipakai' },
      { actingUserId: ACTING_ID },
    )

    expect(result).toEqual({ error: 'Username sudah digunakan', status: 409 })
  })

  it('maps a duplicate NIP on edit to a 409 in Indonesian', async () => {
    mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(transactionThatFailsUpdate({
        code: '23505',
        constraint: 'auth_users_nip_nrp_unique',
      })))

    const result = await updateLocalUserWithRoles(
      USER_ID,
      { nip_nrp: '19900101000000009' },
      { actingUserId: ACTING_ID },
    )

    expect(result).toEqual({ error: 'NIP/NRP sudah terdaftar', status: 409 })
  })
})

function transactionThatFailsUpdate(pgError: { code: string, constraint: string }) {
  return {
    select: vi.fn(() => existingUserQueryBuilder()),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          throw Object.assign(new Error('duplicate key value violates constraint'), pgError)
        }),
      })),
    })),
  }
}

function existingUserQueryBuilder(): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  query.from = vi.fn(() => query)
  query.where = vi.fn(async () => [{
    id: USER_ID,
    username: 'existing.user',
    email: null,
    namaLengkap: 'Existing User',
    nipNrp: '19900101000000000',
    departemen: null,
    metadata: {},
    isActive: true,
  }])
  return query
}

function transactionThatFailsInsert(pgError: { code: string, constraint: string }) {
  return {
    select: vi.fn(() => roleQueryBuilder()),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => {
          throw Object.assign(new Error('duplicate key value violates constraint'), pgError)
        }),
      })),
    })),
  }
}

function roleQueryBuilder(): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  query.from = vi.fn(() => query)
  query.where = vi.fn(async () => [
    { id: '11111111-1111-4111-8111-111111111111', nama: 'PEGAWAI' },
  ])
  return query
}
