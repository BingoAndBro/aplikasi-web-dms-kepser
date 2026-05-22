import { beforeEach, describe, expect, it, vi } from 'vitest'

const FINAL_STATUSES = ['COMPLETED', 'TERSIMPAN', 'ARCHIVED']

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock('drizzle-orm', async (importActual) => {
  const actual = await importActual<typeof import('drizzle-orm')>()
  return {
    ...actual,
    desc: vi.fn((column: unknown) => ({ type: 'desc', column })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    inArray: mocks.inArray,
  }
})

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
  },
}))

import { Route as LaporanKinerjaRoute } from '#/routes/api/laporan/kinerja'

type RouteGetHandler = (args: {
  request: Request
}) => Promise<Response>

const getHandler = (LaporanKinerjaRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('Laporan Kinerja API route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.inArray.mockImplementation((_column: unknown, values: readonly string[]) => ({
      type: 'inArray',
      values,
    }))
  })

  it('rejects unauthenticated requests', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('rejects users without PENANGGUNG_JAWAB_KINERJA assigned role', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['PEGAWAI'], 'PEGAWAI'))

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('allows PENANGGUNG_JAWAB_KINERJA and returns metadata-only final documents', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PEGAWAI', 'PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    mocks.dbSelect.mockReturnValue(createQueryBuilder([
      createRow({ status: 'COMPLETED', is_non_material: false, nominal_realisasi: '12345.00' }),
      createRow({ status: 'TERSIMPAN', is_non_material: true, nominal_realisasi: '999999.00' }),
      createRow({ status: 'ARCHIVED', is_non_material: false, nominal_realisasi: null }),
    ]))

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.meta).toEqual({
      limit: 200,
      final_statuses: FINAL_STATUSES,
    })
    expect(body.dokumen).toHaveLength(3)
    expect(body.dokumen.map((row: { status: string }) => row.status)).toEqual(FINAL_STATUSES)
    expect(body.dokumen[0]).not.toHaveProperty('lampiran_urls')
    expect(body.dokumen[0]).not.toHaveProperty('file_url')
    expect(body.dokumen[1].nominal_realisasi).toBeNull()
    expect(body.dokumen[2].nominal_realisasi).toBeNull()
  })

  it('filters only final statuses and excludes non-final workflow statuses', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    mocks.dbSelect.mockReturnValue(createQueryBuilder([]))

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(response.status).toBe(200)
    expect(mocks.inArray).toHaveBeenCalledWith(expect.anything(), FINAL_STATUSES)
    const [, statuses] = mocks.inArray.mock.calls[0]
    expect(statuses).not.toContain('DRAFT')
    expect(statuses).not.toContain('IN_PPK_VALIDATION')
    expect(statuses).not.toContain('IN_BENDAHARA_APPROVAL')
    expect(statuses).not.toContain('NEED_REVISION')
  })
})

function createSession(roles: string[], activeRole: string) {
  return {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.test',
    },
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.test',
    roles,
    activeRole,
    sessionId: 'test-session-id',
  }
}

function createQueryBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.leftJoin = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.orderBy = vi.fn(() => query)
  query.limit = vi.fn(async () => result)

  return query
}

function createRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    judul: 'Dokumen final',
    status: 'COMPLETED',
    is_non_material: false,
    fungsi_nama: 'Fungsi',
    kegiatan_nama: 'Kegiatan',
    tahun: 2026,
    tanggal: '2026-05-22',
    created_at: new Date('2026-05-20T00:00:00.000Z'),
    updated_at: new Date('2026-05-22T00:00:00.000Z'),
    nominal_realisasi: '1000.00',
    pengaju_display_name: 'Pegawai Test',
    pengaju_nama_lengkap: 'Pegawai Test Lengkap',
    pengaju_email: 'pegawai@example.test',
    ...overrides,
  }
}
