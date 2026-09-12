import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const KEGIATAN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DOKUMEN_ID_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DOKUMEN_ID_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CONFIRMATION = 'BERSIHKAN'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  executePembersihanLampiran: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: { select: mocks.dbSelect },
}))

vi.mock('#/lib/dokumen/pembersihan-service', () => ({
  executePembersihanLampiran: mocks.executePembersihanLampiran,
}))

import { Route as PembersihanBersihkanRoute } from '#/routes/api/pembersihan-dokumen.bersihkan'

type RoutePostHandler = (args: { request: Request }) => Promise<Response>

const postHandler = (PembersihanBersihkanRoute as unknown as {
  options: { server: { handlers: { POST: RoutePostHandler } } }
}).options.server.handlers.POST

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/pembersihan-dokumen/bersihkan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost' },
    body: JSON.stringify(body),
  })
}

function queueSelectResult(result: unknown[]) {
  mocks.dbSelect.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(async () => result),
    })),
  })
}

describe('POST /api/pembersihan-dokumen/bersihkan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLocalServerSession.mockResolvedValue({
      user: { id: USER_ID },
      roles: ['PEGAWAI'],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await postHandler({
      request: makeRequest({ dokumen_ids: [DOKUMEN_ID_1], confirmation: CONFIRMATION }),
    })

    expect(response.status).toBe(401)
    expect(mocks.executePembersihanLampiran).not.toHaveBeenCalled()
  })

  it('returns 403 when the actor is not PEGAWAI', async () => {
    mocks.getLocalServerSession.mockResolvedValue({ user: { id: USER_ID }, roles: ['PPK'] })

    const response = await postHandler({
      request: makeRequest({ dokumen_ids: [DOKUMEN_ID_1], confirmation: CONFIRMATION }),
    })

    expect(response.status).toBe(403)
    expect(mocks.executePembersihanLampiran).not.toHaveBeenCalled()
  })

  it('returns 400 when the confirmation phrase is wrong', async () => {
    const response = await postHandler({
      request: makeRequest({ dokumen_ids: [DOKUMEN_ID_1], confirmation: 'SALAH' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.executePembersihanLampiran).not.toHaveBeenCalled()
  })

  it('returns 400 when dokumen_ids exceeds the batch limit', async () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => DOKUMEN_ID_1.replace(/c$/, String(i % 10)))

    const response = await postHandler({
      request: makeRequest({ dokumen_ids: tooMany, confirmation: CONFIRMATION }),
    })

    expect(response.status).toBe(400)
    expect(mocks.executePembersihanLampiran).not.toHaveBeenCalled()
  })

  it('returns 403 when the actor leads no kegiatan at all', async () => {
    queueSelectResult([]) // ketuaTimAssignments lookup: empty

    const response = await postHandler({
      request: makeRequest({ dokumen_ids: [DOKUMEN_ID_1], confirmation: CONFIRMATION }),
    })

    expect(response.status).toBe(403)
    expect(mocks.executePembersihanLampiran).not.toHaveBeenCalled()
  })

  it('delegates to the service with the actor\'s kegiatan scope and returns its report', async () => {
    queueSelectResult([{ kegiatan_id: KEGIATAN_ID }])
    mocks.executePembersihanLampiran.mockResolvedValue({
      requested_count: 2,
      cleaned_count: 1,
      skipped_count: 1,
      failed_count: 0,
      items: [
        { dokumen_id: DOKUMEN_ID_1, outcome: 'cleaned' },
        { dokumen_id: DOKUMEN_ID_2, outcome: 'skipped', reason: 'NOT_LED_BY_ACTOR' },
      ],
    })

    const response = await postHandler({
      request: makeRequest({ dokumen_ids: [DOKUMEN_ID_1, DOKUMEN_ID_2], confirmation: CONFIRMATION }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.report.cleaned_count).toBe(1)

    expect(mocks.executePembersihanLampiran).toHaveBeenCalledWith({
      dokumenIds: [DOKUMEN_ID_1, DOKUMEN_ID_2],
      actorUserId: USER_ID,
      actorKegiatanIds: new Set([KEGIATAN_ID]),
    })
  })

  it('never lets a partial storage/db failure bubble into a 500 from the service call itself', async () => {
    queueSelectResult([{ kegiatan_id: KEGIATAN_ID }])
    // The service is expected to absorb per-item failures into its report rather than throw;
    // this test documents that the route trusts that contract and returns 200 with the report.
    mocks.executePembersihanLampiran.mockResolvedValue({
      requested_count: 1,
      cleaned_count: 0,
      skipped_count: 0,
      failed_count: 1,
      items: [{ dokumen_id: DOKUMEN_ID_1, outcome: 'failed' }],
    })

    const response = await postHandler({
      request: makeRequest({ dokumen_ids: [DOKUMEN_ID_1], confirmation: CONFIRMATION }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.report.failed_count).toBe(1)
  })
})
