import { beforeEach, describe, expect, it, vi } from 'vitest'

// Read-only access to manual KSBU documents (T-5/D-26) from Laporan Kinerja,
// Monitoring Nominal Realisasi and — since D-28 — Laporan Kegiatan:
// /api/laporan/manual-arsip/$id (+ lampiran preview/download). Detail/file
// lookups are mocked; the role guard and the Ketua Tim ownership check are
// real, running against a fake `db` that answers the ownership join query.
// `status_arsip` from getManualArsipDetail / the file response is already the
// EFFECTIVE status (that of the berkas, D-29) — verified against Postgres in
// tests/integration/manual-arsip-effective-status.test.ts.

const MANUAL_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ID = '77777777-7777-4777-8777-777777777777'
const KETUA_TIM_USER_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  getManualArsipDetail: vi.fn(),
  createManualArsipAttachmentFileResponse: vi.fn(),
  // Rows returned by the "manual_arsip ⨝ ketua_tim_assignments" ownership query.
  ketuaTimRows: vi.fn(),
  selectCalls: [] as Array<{ joined: unknown }>,
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
  hasAnyLocalRole: (session: { roles: string[] }, roles: string[]) =>
    roles.some((role) => session.roles.includes(role)),
}))

vi.mock('#/db/client', async () => {
  const { ketuaTimAssignments } = await import('#/db/schema/master')

  return {
    db: {
      select: vi.fn(() => {
        const call: { joined: unknown } = { joined: null }
        mocks.selectCalls.push(call)
        const query: Record<string, unknown> = {}
        query.from = vi.fn(() => query)
        query.innerJoin = vi.fn((table: unknown) => {
          call.joined = table
          return query
        })
        query.where = vi.fn(() => query)
        query.limit = vi.fn(async () => {
          if (call.joined === ketuaTimAssignments) return mocks.ketuaTimRows()
          throw new Error('unexpected query')
        })
        return query
      }),
    },
  }
})

vi.mock('#/lib/manual-arsip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/manual-arsip')>()
  return {
    ...actual,
    getManualArsipDetail: mocks.getManualArsipDetail,
    createManualArsipAttachmentFileResponse: mocks.createManualArsipAttachmentFileResponse,
  }
})

import { Route as DetailRoute } from '#/routes/api/laporan/manual-arsip.$id'
import { Route as PreviewRoute } from '#/routes/api/laporan/manual-arsip.$id.attachments.$attachmentId.preview'
import { Route as DownloadRoute } from '#/routes/api/laporan/manual-arsip.$id.attachments.$attachmentId.download'

type GetHandler = (args: { request: Request; params: Record<string, string> }) => Promise<Response>

function getHandler(route: unknown): GetHandler {
  return (route as { options: { server: { handlers: { GET: GetHandler } } } }).options.server.handlers.GET
}

const detailGet = getHandler(DetailRoute)
const previewGet = getHandler(PreviewRoute)
const downloadGet = getHandler(DownloadRoute)

function session(roles: string[]) {
  return {
    user: { id: KETUA_TIM_USER_ID, username: 'user' },
    userId: KETUA_TIM_USER_ID,
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function request(path: string) {
  return new Request(`http://localhost${path}`)
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: MANUAL_ID,
    nama: 'Kuitansi Lama',
    keterangan: 'Pembayaran manual',
    status_arsip: 'AKTIF',
    attachments: [{
      id: ATTACHMENT_ID,
      judul_lampiran: 'Kuitansi',
      original_filename: 'kuitansi.pdf',
      content_type: 'application/pdf',
      size_bytes: 1200,
      created_at: '2026-06-01T00:00:00.000Z',
    }],
    ...overrides,
  }
}

function fileArgs(purpose: 'preview' | 'download', attachmentId = ATTACHMENT_ID) {
  return {
    request: request(`/api/laporan/manual-arsip/${MANUAL_ID}/attachments/${attachmentId}/${purpose}`),
    params: { id: MANUAL_ID, attachmentId },
  }
}

const detailArgs = (id = MANUAL_ID) => ({ request: request(`/api/laporan/manual-arsip/${id}`), params: { id } })

function resetMocks() {
  vi.clearAllMocks()
  mocks.selectCalls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.getManualArsipDetail.mockResolvedValue(detail())
  mocks.createManualArsipAttachmentFileResponse.mockResolvedValue(new Response('file', { status: 200 }))
  mocks.ketuaTimRows.mockReturnValue([])
}

describe('GET /api/laporan/manual-arsip/$id', () => {
  beforeEach(resetMocks)

  it.each([
    ['PENANGGUNG_JAWAB_KINERJA'],
    ['PPK'],
    ['PPSPM'],
    ['KEPALA_SUB_BAGIAN_UMUM'],
  ])('lets %s read the detail with its lampiran metadata (no Ketua Tim check needed)', async (role) => {
    mocks.getLocalServerSession.mockResolvedValue(session([role]))

    const response = await detailGet(detailArgs())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.manual_arsip.attachments).toHaveLength(1)
    expect(body.manual_arsip.dimusnahkan).toBe(false)
    expect(JSON.stringify(body)).not.toContain('logical_path')
    expect(mocks.ketuaTimRows).not.toHaveBeenCalled()
  })

  it('lets a Ketua Tim read a manual document of a kegiatan they lead (D-28)', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PEGAWAI']))
    mocks.ketuaTimRows.mockReturnValue([{ id: MANUAL_ID }])

    const response = await detailGet(detailArgs())

    expect(response.status).toBe(200)
    expect((await response.json()).manual_arsip.id).toBe(MANUAL_ID)
    expect(mocks.ketuaTimRows).toHaveBeenCalledTimes(1)
  })

  it('rejects with 403 a Pegawai who does not lead the kegiatan, before any detail lookup', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PEGAWAI']))
    mocks.ketuaTimRows.mockReturnValue([])

    const forbidden = await detailGet(detailArgs())

    expect(forbidden.status).toBe(403)
    expect(mocks.getManualArsipDetail).not.toHaveBeenCalled()
  })

  it('answers 403 (not 404) to a Ketua Tim for a bad or unknown id, so existence is not revealed', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PEGAWAI']))

    const badId = await detailGet(detailArgs('nope'))
    expect(badId.status).toBe(403)
    // Invalid uuid never reaches the database.
    expect(mocks.selectCalls).toHaveLength(0)

    const unknown = await detailGet(detailArgs('99999999-9999-4999-8999-999999999999'))
    expect(unknown.status).toBe(403)
    expect(mocks.getManualArsipDetail).not.toHaveBeenCalled()
  })

  it('rejects an anonymous request with 401 and an ADMIN-only session with 403', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)
    expect((await detailGet(detailArgs())).status).toBe(401)

    mocks.getLocalServerSession.mockResolvedValue(session(['ADMIN']))
    expect((await detailGet(detailArgs())).status).toBe(403)

    expect(mocks.ketuaTimRows).not.toHaveBeenCalled()
    expect(mocks.getManualArsipDetail).not.toHaveBeenCalled()
  })

  it('returns 404 for a bad id and a missing document', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PENANGGUNG_JAWAB_KINERJA']))

    expect((await detailGet(detailArgs('nope'))).status).toBe(404)

    mocks.getManualArsipDetail.mockResolvedValueOnce(null)
    expect((await detailGet(detailArgs())).status).toBe(404)
  })

  it('still returns a document whose berkas is DIMUSNAHKAN, flagged dimusnahkan (D-28/D-29)', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PENANGGUNG_JAWAB_KINERJA']))

    mocks.getManualArsipDetail.mockResolvedValueOnce(detail({ status_arsip: 'DIMUSNAHKAN' }))
    const destroyed = await detailGet(detailArgs())
    expect(destroyed.status).toBe(200)
    const body = await destroyed.json()
    expect(body.manual_arsip.dimusnahkan).toBe(true)
    expect(body.manual_arsip.status_arsip).toBe('DIMUSNAHKAN')

    mocks.getManualArsipDetail.mockResolvedValueOnce(detail({ status_arsip: 'INAKTIF' }))
    expect((await (await detailGet(detailArgs())).json()).manual_arsip.dimusnahkan).toBe(false)
  })
})

describe('GET /api/laporan/manual-arsip/$id/attachments/$attachmentId/{preview,download}', () => {
  beforeEach(resetMocks)

  it.each([
    ['PENANGGUNG_JAWAB_KINERJA', 'preview'],
    ['PENANGGUNG_JAWAB_KINERJA', 'download'],
    ['PPK', 'preview'],
    ['PPSPM', 'download'],
    ['KEPALA_SUB_BAGIAN_UMUM', 'preview'],
  ] as const)('keeps serving %s (%s) through the shared file response', async (role, purpose) => {
    mocks.getLocalServerSession.mockResolvedValue(session([role]))
    const handler = purpose === 'preview' ? previewGet : downloadGet

    const response = await handler(fileArgs(purpose))

    expect(response.status).toBe(200)
    expect(mocks.createManualArsipAttachmentFileResponse).toHaveBeenCalledWith({
      manualArsipId: MANUAL_ID,
      attachmentId: ATTACHMENT_ID,
      purpose,
    })
  })

  it.each([
    ['preview', previewGet],
    ['download', downloadGet],
  ] as const)('serves %s to the Ketua Tim who leads the kegiatan', async (purpose, handler) => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PEGAWAI']))
    mocks.ketuaTimRows.mockReturnValue([{ id: MANUAL_ID }])

    const response = await handler(fileArgs(purpose))

    expect(response.status).toBe(200)
    expect(mocks.createManualArsipAttachmentFileResponse).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['preview', previewGet],
    ['download', downloadGet],
  ] as const)('rejects %s with 403 for a Pegawai who does not lead the kegiatan, before touching files', async (purpose, handler) => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PEGAWAI']))
    mocks.ketuaTimRows.mockReturnValue([])

    const response = await handler(fileArgs(purpose))

    expect(response.status).toBe(403)
    expect(mocks.createManualArsipAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('answers 404 for a bad attachment id before touching files', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PPK']))

    const badId = await downloadGet(fileArgs('download', 'nope'))

    expect(badId.status).toBe(404)
    expect(mocks.createManualArsipAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it.each([
    ['preview', previewGet],
    ['download', downloadGet],
  ] as const)('relays the shared 410 for %s when the berkas holding the document is DIMUSNAHKAN', async (purpose, handler) => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PEGAWAI']))
    mocks.ketuaTimRows.mockReturnValue([{ id: MANUAL_ID }])
    mocks.createManualArsipAttachmentFileResponse.mockResolvedValue(
      Response.json({ error: 'File lampiran tidak tersedia - file berkas telah dibersihkan' }, { status: 410 }),
    )

    const response = await handler(fileArgs(purpose))

    expect(response.status).toBe(410)
    expect(mocks.createManualArsipAttachmentFileResponse).toHaveBeenCalledTimes(1)
  })
})
