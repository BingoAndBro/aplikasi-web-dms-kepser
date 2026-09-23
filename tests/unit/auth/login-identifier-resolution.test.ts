import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  verifyPassword: vi.fn(),
  createSessionRecord: vi.fn(),
}))

vi.mock('#/db/client', () => ({
  db: { select: mocks.dbSelect },
}))

vi.mock('#/lib/auth/password', () => ({
  verifyPassword: mocks.verifyPassword,
}))

vi.mock('#/lib/auth/session-repository', () => ({
  createSessionRecord: mocks.createSessionRecord,
}))

import { loginWithLocalCredentials } from '#/lib/auth/local-auth-service'

describe('loginWithLocalCredentials identifier resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createSessionRecord.mockResolvedValue({
      id: 'session-id',
      userId: USER_ID,
      tokenHash: 'hash',
      expiresAt: new Date(),
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
      rememberMe: false,
      userAgent: null,
      ipAddress: null,
    })
  })

  it('resolves an active user by username', async () => {
    mocks.dbSelect.mockReturnValue(activeUserQuery())
    mocks.verifyPassword.mockResolvedValue(true)

    const result = await loginWithLocalCredentials({
      identifier: 'budi.santoso',
      password: 'correct-password',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.user).toEqual({
        id: USER_ID,
        username: 'budi.santoso',
        displayName: 'Budi Santoso',
      })
    }
  })

  it('resolves the same active user by NIP', async () => {
    // Whatever the caller typed matched the row the OR-query returned — the
    // mock stands in for "username OR nip_nrp matched"; the row shape is
    // identical either way, which is the point: one query, one user.
    mocks.dbSelect.mockReturnValue(activeUserQuery())
    mocks.verifyPassword.mockResolvedValue(true)

    const result = await loginWithLocalCredentials({
      identifier: '199001012015031002',
      password: 'correct-password',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.user.id).toBe(USER_ID)
    }
  })

  it('rejects an inactive account with 403 before checking the password', async () => {
    mocks.dbSelect.mockReturnValue(activeUserQuery({ isActive: false }))

    const result = await loginWithLocalCredentials({
      identifier: 'budi.santoso',
      password: 'correct-password',
    })

    expect(result).toMatchObject({
      ok: false,
      status: 403,
      error: 'Akun Anda tidak aktif. Hubungi Administrator.',
    })
    expect(mocks.verifyPassword).not.toHaveBeenCalled()
  })

  it('returns an identical generic error for a wrong password and an unknown identifier', async () => {
    mocks.dbSelect.mockReturnValue(activeUserQuery())
    mocks.verifyPassword.mockResolvedValue(false)
    const wrongPassword = await loginWithLocalCredentials({
      identifier: 'budi.santoso',
      password: 'wrong-password',
    })

    mocks.dbSelect.mockReturnValue(emptyQuery())
    const unknownIdentifier = await loginWithLocalCredentials({
      identifier: 'nobody.here',
      password: 'wrong-password',
    })

    expect(wrongPassword).toEqual(unknownIdentifier)
    expect(wrongPassword).toMatchObject({
      ok: false,
      status: 401,
      error: 'Username/NIP atau password salah',
      code: 'invalid_credentials',
    })
  })
})

function activeUserQuery(overrides: { isActive?: boolean } = {}): Record<string, unknown> {
  const rows = [{
    user: {
      id: USER_ID,
      username: 'budi.santoso',
      passwordHash: 'argon2id-hash',
      displayName: 'Budi Santoso',
      namaLengkap: 'Budi Santoso Lengkap',
      isActive: overrides.isActive ?? true,
    },
    roleName: 'PEGAWAI',
  }]

  return queryBuilder(rows)
}

function emptyQuery(): Record<string, unknown> {
  return queryBuilder([])
}

function queryBuilder(rows: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  query.from = vi.fn(() => query)
  query.leftJoin = vi.fn(() => query)
  query.where = vi.fn(async () => rows)
  return query
}
