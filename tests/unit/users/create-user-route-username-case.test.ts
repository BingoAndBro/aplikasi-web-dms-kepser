import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression test for a bug where POST /api/users validated the raw
// (possibly mixed-case) username against isValidUsername() — which only
// accepts lowercase — BEFORE normalizing it to lowercase, so a perfectly
// valid username like "Pramuka_pulau" was rejected as invalid even though
// it becomes valid ("pramuka_pulau") after normalization.

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  createLocalUserWithRoles: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/lib/users/local-user-queries', () => ({
  getLocalUsersWithRoles: vi.fn(),
}))

vi.mock('#/lib/users/local-user-mutations', () => ({
  createLocalUserWithRoles: mocks.createLocalUserWithRoles,
  findInvalidCanonicalRoles: (input: unknown[]) =>
    input.filter((role) => typeof role !== 'string' || !CANONICAL_ROLES.includes(role)),
  hasAdminMixedWithNonAdmin: (roles: string[]) => roles.includes('ADMIN') && roles.length > 1,
  normalizeAdminRolePayload: (roles: string[]) =>
    roles.includes('ADMIN') ? ['ADMIN'] : (roles.includes('PEGAWAI') ? roles : ['PEGAWAI', ...roles]),
}))

const CANONICAL_ROLES = ['PEGAWAI', 'PPK', 'PPSPM', 'KEPALA_SUB_BAGIAN_UMUM', 'PENANGGUNG_JAWAB_KINERJA', 'ADMIN']

import { Route } from '#/routes/api/users/index'

type PostHandler = (args: { request: Request }) => Promise<Response>

const postHandler = (Route as unknown as {
  options: { server: { handlers: { POST: PostHandler } } }
}).options.server.handlers.POST

describe('POST /api/users username casing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLocalServerSession.mockResolvedValue({
      userId: 'admin-id',
      roles: ['ADMIN'],
    })
    mocks.createLocalUserWithRoles.mockResolvedValue({
      data: {
        id: 'new-user-id',
        username: 'pramuka_pulau',
        email: null,
        metadata: { nama_lengkap: 'Pramuka Pulau', nip_nrp: '19900101000000099' },
        roles: ['PEGAWAI'],
        isActive: true,
        disabledAt: null,
        createdAt: new Date().toISOString(),
      },
    })
  })

  it('accepts a mixed-case username by normalizing it before validation', async () => {
    const response = await postHandler({ request: createUserRequest({ username: 'Pramuka_pulau' }) })

    expect(response.status).toBe(201)
    expect(mocks.createLocalUserWithRoles).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'pramuka_pulau' }),
    )
  })

  it('still rejects a username with no letters at all (would collide with the NIP namespace)', async () => {
    const response = await postHandler({ request: createUserRequest({ username: '12345678' }) })

    expect(response.status).toBe(400)
    expect(mocks.createLocalUserWithRoles).not.toHaveBeenCalled()
  })
})

function createUserRequest(overrides: Partial<Record<string, unknown>> = {}): Request {
  return new Request('http://localhost/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify({
      username: 'pramuka_pulau',
      password: 'password123',
      nama_lengkap: 'Pramuka Pulau',
      nip_nrp: '19900101000000099',
      ...overrides,
    }),
  })
}
