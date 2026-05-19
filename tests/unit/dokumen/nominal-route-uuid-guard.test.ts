import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = '2a9c30e4-d49a-45cf-b54a-ed73c7b1469b'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
  },
}))

import { Route } from '#/routes/api/dokumen/$id.nominal'

type NominalPatchHandler = (args: {
  request: Request
  params: { id: string }
}) => Promise<Response>

const nominalPatchHandler = (Route as unknown as {
  options: { server: { handlers: { PATCH: NominalPatchHandler } } }
}).options.server.handlers.PATCH

describe('/api/dokumen/$id/nominal UUID guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLocalServerSession.mockResolvedValue({
      user: {
        id: USER_ID,
        email: 'pegawai@example.test',
      },
      userId: USER_ID,
      email: 'pegawai@example.test',
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
      sessionId: 'test-session-id',
    })
    mocks.dbSelect.mockReturnValue(createQueryBuilder([]))
  })

  it('allows a valid document UUID through to the document lookup', async () => {
    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Dokumen tidak ditemukan' })
    expect(mocks.dbSelect).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid document UUID before the document lookup', async () => {
    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: 'not-a-uuid' },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Dokumen tidak ditemukan' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })
})

function createPatchRequest(): Request {
  return new Request(`http://localhost/api/dokumen/${DOKUMEN_ID}/nominal`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nominal_realisasi: 1000 }),
  })
}

function createQueryBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn(async () => result)

  return query
}
