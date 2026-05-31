import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const PPK_ID = '22222222-2222-4222-8222-222222222222'
const DOKUMEN_ID = '2a9c30e4-d49a-45cf-b54a-ed73c7b1469b'
const FUNGSI_ID = '33333333-3333-4333-8333-333333333333'
const KEGIATAN_ID = '44444444-4444-4444-8444-444444444444'
const BERKAS_ID = '55555555-5555-4555-8555-555555555555'

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

import { Route as DokumenLogRoute } from '#/routes/api/dokumen.$id.log'
import { Route as PpkDetailRoute } from '#/routes/api/ppk/dokumen/$id'
import { Route as BendaharaDetailRoute } from '#/routes/api/bendahara/dokumen/$id'
import { Route as KepalaSubBagianUmumDetailRoute } from '#/routes/api/arsiparis/dokumen.$id'

type RouteGetHandler = (args: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const dokumenLogHandler = (DokumenLogRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const ppkDetailHandler = (PpkDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const bendaharaDetailHandler = (BendaharaDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const kepalaSubBagianUmumDetailHandler = (KepalaSubBagianUmumDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('PPK detail and document log route UUID parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows an inbox-visible document id through the PPK detail lookup', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(PPK_ID, ['PEGAWAI', 'PPK'], 'PPK'))
    mocks.dbSelect
      .mockReturnValueOnce(createQueryBuilder([createPpkDetailRow()]))
      .mockReturnValueOnce(createQueryBuilder([]))

    const response = await ppkDetailHandler({
      request: new Request(`http://localhost/api/ppk/dokumen/${DOKUMEN_ID}`),
      params: { id: DOKUMEN_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dokumen.id).toBe(DOKUMEN_ID)
    expect(body.dokumen.status).toBe('IN_PPK_VALIDATION')
    expect(body.dokumen.current_step).toBe('PPK')
    expect(body.logs).toEqual([])
    expect(mocks.dbSelect).toHaveBeenCalledTimes(2)
  })

  it('returns empty logs, not 404, for an existing accessible document with zero activity rows', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(OWNER_ID, ['PEGAWAI'], 'PEGAWAI'))
    mocks.dbSelect
      .mockReturnValueOnce(createQueryBuilder([{
        id: DOKUMEN_ID,
        created_by: OWNER_ID,
        status: 'IN_PPK_VALIDATION',
        revision_target: null,
      }]))
      .mockReturnValueOnce(createQueryBuilder([]))

    const response = await dokumenLogHandler({
      request: new Request(`http://localhost/api/dokumen/${DOKUMEN_ID}/log`),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ logs: [] })
    expect(mocks.dbSelect).toHaveBeenCalledTimes(2)
  })

  it('allows the same valid document id through Bendahara detail lookup', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(PPK_ID, ['PEGAWAI', 'BENDAHARA'], 'BENDAHARA'))
    mocks.dbSelect
      .mockReturnValueOnce(createQueryBuilder([createBendaharaDetailRow()]))
      .mockReturnValueOnce(createQueryBuilder([], { orderByTerminal: false }))
      .mockReturnValueOnce(createQueryBuilder([]))

    const response = await bendaharaDetailHandler({
      request: new Request(`http://localhost/api/bendahara/dokumen/${DOKUMEN_ID}`),
      params: { id: DOKUMEN_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dokumen.id).toBe(DOKUMEN_ID)
    expect(body.dokumen.status).toBe('IN_BENDAHARA_APPROVAL')
    expect(body.ppkValidation).toBeNull()
    expect(body.logs).toEqual([])
    expect(mocks.dbSelect).toHaveBeenCalledTimes(3)
  })

  it('loads a COMPLETED document for Kepala Sub Bagian Umum detail without folder membership', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(PPK_ID, ['PEGAWAI', 'KEPALA_SUB_BAGIAN_UMUM'], 'KEPALA_SUB_BAGIAN_UMUM'))
    mocks.dbSelect
      .mockReturnValueOnce(createQueryBuilder([createKepalaSubBagianUmumDetailRow()]))
      .mockReturnValueOnce(createQueryBuilder([], { orderByTerminal: false }))
      .mockReturnValueOnce(createQueryBuilder([]))

    const response = await kepalaSubBagianUmumDetailHandler({
      request: new Request(`http://localhost/api/arsiparis/dokumen/${DOKUMEN_ID}`),
      params: { id: DOKUMEN_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dokumen.id).toBe(DOKUMEN_ID)
    expect(body.dokumen.status).toBe('COMPLETED')
    expect(body.dokumen.is_archived).toBe(false)
    expect(body.bendahara_approve).toBeNull()
    expect(body.arsip).toBeNull()
    expect(mocks.dbSelect).toHaveBeenCalledTimes(3)
    expectNoSensitiveOutput(body)
  })

  it('marks Kepala Sub Bagian Umum detail as classified from folder-first berkas item evidence', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(PPK_ID, ['PEGAWAI', 'KEPALA_SUB_BAGIAN_UMUM'], 'KEPALA_SUB_BAGIAN_UMUM'))
    mocks.dbSelect
      .mockReturnValueOnce(createQueryBuilder([createKepalaSubBagianUmumDetailRow()]))
      .mockReturnValueOnce(createQueryBuilder([{ user_id: PPK_ID, timestamp: new Date('2026-05-20T00:00:00.000Z') }], { orderByTerminal: false }))
      .mockReturnValueOnce(createQueryBuilder([createFolderFirstArchiveEvidenceRow()]))

    const response = await kepalaSubBagianUmumDetailHandler({
      request: new Request(`http://localhost/api/arsiparis/dokumen/${DOKUMEN_ID}`),
      params: { id: DOKUMEN_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dokumen.id).toBe(DOKUMEN_ID)
    expect(body.dokumen.status).toBe('COMPLETED')
    expect(body.dokumen.is_archived).toBe(true)
    expect(body.bendahara_approve).toEqual({
      nama: 'PPSPM',
      tanggal: '2026-05-20T00:00:00.000Z',
    })
    expect(body.arsip).toEqual({
      id: BERKAS_ID,
      status_arsip: 'AKTIF',
      nomor_surat: 'SPM-001/2026',
    })
    expect(mocks.dbSelect).toHaveBeenCalledTimes(3)
    expectNoSensitiveOutput(body)
  })

  it('keeps unauthenticated users out of Kepala Sub Bagian Umum detail lookup', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await kepalaSubBagianUmumDetailHandler({
      request: new Request(`http://localhost/api/arsiparis/dokumen/${DOKUMEN_ID}`),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('keeps ADMIN-only users out of Kepala Sub Bagian Umum detail lookup', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(PPK_ID, ['ADMIN'], 'ADMIN'))

    const response = await kepalaSubBagianUmumDetailHandler({
      request: new Request(`http://localhost/api/arsiparis/dokumen/${DOKUMEN_ID}`),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })
})

function createQueryBuilder(
  result: unknown[],
  options: { orderByTerminal?: boolean } = {},
): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  const orderByTerminal = options.orderByTerminal ?? true

  query.from = vi.fn(() => query)
  query.leftJoin = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn(async () => result)
  query.orderBy = vi.fn(() => orderByTerminal ? Promise.resolve(result) : query)

  return query
}

function createSession(userId: string, roles: string[], activeRole: string) {
  return {
    user: {
      id: userId,
      email: `${activeRole.toLowerCase()}@example.test`,
    },
    userId,
    email: `${activeRole.toLowerCase()}@example.test`,
    roles,
    activeRole,
    sessionId: 'test-session-id',
  }
}

function createPpkDetailRow() {
  return {
    id: DOKUMEN_ID,
    judul: 'Dokumen validasi PPK',
    fungsi_id: FUNGSI_ID,
    fungsi_nama: 'Fungsi',
    kegiatan_jenis_id: KEGIATAN_ID,
    kegiatan_nama: 'Kegiatan',
    is_ketua_tim: false,
    status: 'IN_PPK_VALIDATION',
    current_step: 'PPK',
    revision_target: null,
    revision_notes: null,
    lampiran_urls: [],
    tahun: 2026,
    tanggal: '2026-05-19',
    created_by: OWNER_ID,
    created_at: new Date('2026-05-19T00:00:00.000Z'),
    updated_at: new Date('2026-05-19T00:00:00.000Z'),
    nominal_realisasi: '1000.00',
    jenis_permintaan_id: null,
    kategori_permintaan_id: null,
    detail_permintaan_id: null,
    jenis_permintaan_nama: null,
    kategori_permintaan_nama: null,
    detail_permintaan_nama: null,
  }
}

function createBendaharaDetailRow() {
  return {
    ...createPpkDetailRow(),
    status: 'IN_BENDAHARA_APPROVAL',
    current_step: 'BENDAHARA',
  }
}

function createKepalaSubBagianUmumDetailRow() {
  return {
    ...createPpkDetailRow(),
    status: 'COMPLETED',
    current_step: null,
  }
}

function createFolderFirstArchiveEvidenceRow() {
  return {
    item_id: '66666666-6666-4666-8666-666666666666',
    berkas_id: BERKAS_ID,
    status_berkas: 'CLOSED',
    status_arsip: 'AKTIF',
    nomor_spm: 'SPM-001/2026',
  }
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('raw')
}
