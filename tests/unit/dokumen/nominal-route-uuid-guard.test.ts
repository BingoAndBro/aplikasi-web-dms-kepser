import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '33333333-3333-4333-8333-333333333333'
const ARSIPARIS_ID = '44444444-4444-4444-8444-444444444444'
const DOKUMEN_ID = '2a9c30e4-d49a-45cf-b54a-ed73c7b1469b'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
  txUpdate: vi.fn(),
  txInsert: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
    transaction: mocks.dbTransaction,
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
    mocks.getLocalServerSession.mockReset()
    mocks.dbSelect.mockReset()
    mocks.dbTransaction.mockReset()
    mocks.txUpdate.mockReset()
    mocks.txInsert.mockReset()
    mocks.getLocalServerSession.mockResolvedValue(createSession(USER_ID, ['PEGAWAI'], 'PEGAWAI'))
    mocks.dbSelect.mockReturnValue(createQueryBuilder([]))
    mocks.dbTransaction.mockImplementation(async (callback) => callback(createTransaction()))
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

  it('rejects an ADMIN-only creator before nominal mutation', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(ADMIN_ID, ['ADMIN'], 'ADMIN'))
    mocks.dbSelect.mockReturnValueOnce(createQueryBuilder([createDokumen({ created_by: ADMIN_ID })]))

    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects a malformed ADMIN mixed-role creator through the creator fallback', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(ADMIN_ID, ['ADMIN', 'PEGAWAI'], 'PEGAWAI'))
    mocks.dbSelect.mockReturnValueOnce(createQueryBuilder([createDokumen({ created_by: ADMIN_ID })]))

    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('allows a non-admin creator to update nominal', async () => {
    mockDocumentAndArchive(createDokumen({ created_by: USER_ID }), [])

    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.txInsert).toHaveBeenCalledTimes(1)
  })

  it('preserves KEPALA_SUB_BAGIAN_UMUM nominal update access', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ARSIPARIS_ID,
      ['KEPALA_SUB_BAGIAN_UMUM'],
      'KEPALA_SUB_BAGIAN_UMUM',
    ))
    mockDocumentAndArchive(createDokumen({ created_by: USER_ID }), [])

    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.txInsert).toHaveBeenCalledTimes(1)
  })

  it('blocks nominal update for COMPLETED material documents', async () => {
    mockDocumentAndArchive(createDokumen({ status: 'COMPLETED' }), [])

    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Tidak bisa update dokumen yang sudah selesai',
    })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('keeps the DIMUSNAHKAN archive guard', async () => {
    mockDocumentAndArchive(createDokumen(), [{ status_arsip: 'DIMUSNAHKAN' }])

    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Tidak bisa update dokumen yang sudah dimusnahkan',
    })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('keeps Non-Material nominal validation unchanged', async () => {
    mockDocumentAndArchive(createDokumen({ is_non_material: true, nominal_realisasi: null }), [])

    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Dokumen Non-Material tidak memiliki nominal_realisasi',
    })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('keeps unauthenticated requests at 401', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await nominalPatchHandler({
      request: createPatchRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('does not reintroduce legacy canonical archive table evidence', () => {
    const routeSource = readFileSync('src/routes/api/dokumen/$id.nominal.ts', 'utf8')

    expect(routeSource).not.toContain('arsip as arsipTable')
    expect(routeSource).not.toContain('arsipTable')
  })
})

function createSession(userId: string, roles: string[], activeRole: string) {
  return {
    user: {
      id: userId,
      email: `${userId}@example.test`,
    },
    userId,
    email: `${userId}@example.test`,
    roles,
    activeRole,
    sessionId: 'test-session-id',
  }
}

function createDokumen(overrides: Partial<{
  id: string
  created_by: string
  status: string
  is_non_material: boolean | null
  nominal_realisasi: string | null
}> = {}) {
  return {
    id: DOKUMEN_ID,
    created_by: USER_ID,
    status: 'DRAFT',
    is_non_material: false,
    nominal_realisasi: '1000',
    ...overrides,
  }
}

function mockDocumentAndArchive(dokumen: ReturnType<typeof createDokumen>, archiveRows: unknown[]) {
  mocks.dbSelect
    .mockReturnValueOnce(createQueryBuilder([dokumen]))
    .mockReturnValueOnce(createQueryBuilder(archiveRows))
}

function createPatchRequest(): Request {
  return new Request(`http://localhost/api/dokumen/${DOKUMEN_ID}/nominal`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify({ nominal_realisasi: 1000 }),
  })
}

function createQueryBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.leftJoin = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn(async () => result)

  return query
}

function createTransaction(): Record<string, unknown> {
  const updateQuery: Record<string, unknown> = {}
  updateQuery.set = vi.fn(() => updateQuery)
  updateQuery.where = vi.fn(() => updateQuery)
  updateQuery.returning = vi.fn(async () => [{ id: DOKUMEN_ID }])

  const insertQuery: Record<string, unknown> = {}
  insertQuery.values = vi.fn(async () => undefined)

  return {
    update: mocks.txUpdate.mockReturnValue(updateQuery),
    insert: mocks.txInsert.mockReturnValue(insertQuery),
  }
}
