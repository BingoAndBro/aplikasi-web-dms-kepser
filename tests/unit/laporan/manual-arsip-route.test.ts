import { beforeEach, describe, expect, it, vi } from 'vitest'

// Read-only access to manual KSBU documents (T-5/D-26) from Laporan Kinerja and
// Monitoring Nominal Realisasi: /api/laporan/manual-arsip/$id (+ lampiran
// preview/download). Detail/file lookups are mocked; the role guard is real.

const MANUAL_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ID = '77777777-7777-4777-8777-777777777777'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  getManualArsipDetail: vi.fn(),
  createManualArsipAttachmentFileResponse: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
  hasAnyLocalRole: (session: { roles: string[] }, roles: string[]) =>
    roles.some((role) => session.roles.includes(role)),
}))

vi.mock('#/db/client', () => ({ db: {} }))

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
    user: { id: '11111111-1111-4111-8111-111111111111', username: 'user' },
    userId: '11111111-1111-4111-8111-111111111111',
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

describe('GET /api/laporan/manual-arsip/$id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getManualArsipDetail.mockResolvedValue(detail())
  })

  it.each([
    ['PENANGGUNG_JAWAB_KINERJA'],
    ['PPK'],
    ['PPSPM'],
    ['KEPALA_SUB_BAGIAN_UMUM'],
  ])('lets %s read the detail with its lampiran metadata', async (role) => {
    mocks.getLocalServerSession.mockResolvedValue(session([role]))

    const response = await detailGet({ request: request(`/api/laporan/manual-arsip/${MANUAL_ID}`), params: { id: MANUAL_ID } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.manual_arsip.attachments).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain('logical_path')
  })

  it('rejects a Pegawai with 403 and an anonymous request with 401', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PEGAWAI']))
    const forbidden = await detailGet({ request: request(`/api/laporan/manual-arsip/${MANUAL_ID}`), params: { id: MANUAL_ID } })
    expect(forbidden.status).toBe(403)

    mocks.getLocalServerSession.mockResolvedValue(null)
    const unauthenticated = await detailGet({ request: request(`/api/laporan/manual-arsip/${MANUAL_ID}`), params: { id: MANUAL_ID } })
    expect(unauthenticated.status).toBe(401)

    expect(mocks.getManualArsipDetail).not.toHaveBeenCalled()
  })

  it('returns 404 for a bad id, a missing document, and a DIMUSNAHKAN document', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PENANGGUNG_JAWAB_KINERJA']))

    const badId = await detailGet({ request: request('/api/laporan/manual-arsip/nope'), params: { id: 'nope' } })
    expect(badId.status).toBe(404)

    mocks.getManualArsipDetail.mockResolvedValueOnce(null)
    const missing = await detailGet({ request: request(`/api/laporan/manual-arsip/${MANUAL_ID}`), params: { id: MANUAL_ID } })
    expect(missing.status).toBe(404)

    mocks.getManualArsipDetail.mockResolvedValueOnce(detail({ status_arsip: 'DIMUSNAHKAN' }))
    const destroyed = await detailGet({ request: request(`/api/laporan/manual-arsip/${MANUAL_ID}`), params: { id: MANUAL_ID } })
    expect(destroyed.status).toBe(404)
  })
})

describe('GET /api/laporan/manual-arsip/$id/attachments/$attachmentId/{preview,download}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.createManualArsipAttachmentFileResponse.mockResolvedValue(new Response('file', { status: 200 }))
  })

  it.each([
    ['preview', previewGet],
    ['download', downloadGet],
  ] as const)('serves %s to PJ Kinerja through the shared file response', async (purpose, handler) => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PENANGGUNG_JAWAB_KINERJA']))

    const response = await handler({
      request: request(`/api/laporan/manual-arsip/${MANUAL_ID}/attachments/${ATTACHMENT_ID}/${purpose}`),
      params: { id: MANUAL_ID, attachmentId: ATTACHMENT_ID },
    })

    expect(response.status).toBe(200)
    expect(mocks.createManualArsipAttachmentFileResponse).toHaveBeenCalledWith({
      manualArsipId: MANUAL_ID,
      attachmentId: ATTACHMENT_ID,
      purpose,
    })
  })

  it('rejects a Pegawai with 403 and bad ids with 404 before touching files', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['PEGAWAI']))
    const forbidden = await previewGet({
      request: request(`/api/laporan/manual-arsip/${MANUAL_ID}/attachments/${ATTACHMENT_ID}/preview`),
      params: { id: MANUAL_ID, attachmentId: ATTACHMENT_ID },
    })
    expect(forbidden.status).toBe(403)

    mocks.getLocalServerSession.mockResolvedValue(session(['PPK']))
    const badId = await downloadGet({
      request: request(`/api/laporan/manual-arsip/${MANUAL_ID}/attachments/nope/download`),
      params: { id: MANUAL_ID, attachmentId: 'nope' },
    })
    expect(badId.status).toBe(404)

    expect(mocks.createManualArsipAttachmentFileResponse).not.toHaveBeenCalled()
  })
})
