import { beforeEach, describe, expect, it, vi } from 'vitest'

const NARROW_FINAL_STATUSES = ['COMPLETED']
const BROAD_FINAL_STATUSES = ['COMPLETED', 'TERSIMPAN']

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbSelectDistinct: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  notInArray: vi.fn(),
  isNotNull: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
}))

vi.mock('drizzle-orm', async (importActual) => {
  const actual = await importActual<typeof import('drizzle-orm')>()
  return {
    ...actual,
    desc: vi.fn((column: unknown) => ({ type: 'desc', column })),
    eq: mocks.eq,
    or: mocks.or,
    isNull: mocks.isNull,
    notInArray: mocks.notInArray,
    isNotNull: mocks.isNotNull,
    and: mocks.and,
    gte: mocks.gte,
    lte: mocks.lte,
  }
})

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
  hasAnyLocalRole: (session: { roles: string[] }, roles: string[]) =>
    roles.some((role) => session.roles.includes(role)),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
    selectDistinct: mocks.dbSelectDistinct,
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
    mocks.eq.mockImplementation((left: unknown, right: unknown) => ({ type: 'eq', left, right }))
    mocks.or.mockImplementation((...clauses: unknown[]) => ({ type: 'or', clauses }))
    mocks.isNull.mockImplementation((column: unknown) => ({ type: 'isNull', column }))
    mocks.notInArray.mockImplementation((column: unknown, values: readonly string[]) => ({
      type: 'notInArray',
      column,
      values,
    }))
    mocks.isNotNull.mockImplementation((column: unknown) => ({ type: 'isNotNull', column }))
    mocks.and.mockImplementation((...clauses: unknown[]) => ({
      type: 'and',
      clauses: clauses.filter((clause) => clause !== undefined),
    }))
    mocks.gte.mockImplementation((column: unknown, value: unknown) => ({ type: 'gte', column, value }))
    mocks.lte.mockImplementation((column: unknown, value: unknown) => ({ type: 'lte', column, value }))
    mocks.dbSelectDistinct.mockReturnValue(createDistinctQueryBuilder([]))
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

  it('rejects users without an allowed monitoring role', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['PEGAWAI'], 'PEGAWAI'))

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it.each(['PPK', 'PPSPM'])('allows %s to read realisasi monitoring metadata', async (role) => {
    mocks.getLocalServerSession.mockResolvedValue(createSession([role], role))
    setupDbSelect([createRow({ status: 'COMPLETED', nominal_realisasi: '5000.00' })])

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.dokumen).toHaveLength(1)
  })

  it('allows PENANGGUNG_JAWAB_KINERJA and returns metadata-only final documents', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PEGAWAI', 'PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([
      createRow({ id: 'doc-1', status: 'COMPLETED', nominal_realisasi: '12345.00' }),
      createRow({ id: 'doc-2', status: 'COMPLETED', nominal_realisasi: null }),
    ], [], ['doc-1'])

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.meta).toEqual({
      limit: 2000,
      count: 2,
      truncated: false,
      final_statuses: NARROW_FINAL_STATUSES,
      tahun_tersedia: [],
    })
    expect(body.dokumen).toHaveLength(2)
    expect(body.dokumen.map((row: { status: string }) => row.status)).toEqual(['COMPLETED', 'COMPLETED'])
    expect(body.dokumen[0]).not.toHaveProperty('lampiran_urls')
    expect(body.dokumen[0]).not.toHaveProperty('file_url')
    expect(body.dokumen[0].is_diberkaskan).toBe(true)
    expect(body.dokumen[1].is_diberkaskan).toBe(false)
    expect(body.dokumen[1].nominal_realisasi).toBeNull()
  })

  it('includes TERSIMPAN (non-material) documents only when scope=laporan_kinerja is requested', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([
      createRow({ id: 'doc-1', status: 'COMPLETED', nominal_realisasi: '12345.00' }),
      createRow({ id: 'doc-2', status: 'TERSIMPAN', nominal_realisasi: null, komponen_id: null, komponen_nama: null }),
    ])

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja?scope=laporan_kinerja'),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.meta.final_statuses).toEqual(BROAD_FINAL_STATUSES)
    expect(body.dokumen.map((row: { status: string }) => row.status)).toEqual(['COMPLETED', 'TERSIMPAN'])
    expect(mocks.or).toHaveBeenCalled()
    expect(mocks.isNull).toHaveBeenCalledWith(expect.anything())
  })

  it('does not broaden scope for Monitoring Realisasi requests without the scope param', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['PPK'], 'PPK'))
    setupDbSelect([])

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.meta.final_statuses).toEqual(NARROW_FINAL_STATUSES)
    expect(mocks.or).not.toHaveBeenCalled()
  })

  it('includes komponen id and name in each row', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([createRow({ komponen_id: 'komponen-1', komponen_nama: 'Komponen A' })])

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })
    const body = await response.json()

    expect(body.dokumen[0].komponen_id).toBe('komponen-1')
    expect(body.dokumen[0].komponen_nama).toBe('Komponen A')
  })

  it('filters to only the COMPLETED status without scope=laporan_kinerja', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([])

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(response.status).toBe(200)
    expect(mocks.eq).toHaveBeenCalledWith(expect.anything(), 'COMPLETED')
    expect(mocks.eq).not.toHaveBeenCalledWith(expect.anything(), 'TERSIMPAN')
  })

  it('filters to material documents only', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([])

    await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(mocks.eq).toHaveBeenCalledWith(expect.anything(), false)
  })

  it('filters out material documents that have no komponen assigned', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([])

    await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(mocks.isNotNull).toHaveBeenCalledWith(expect.anything())
  })

  it('excludes documents whose berkas arsip has been destroyed', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([], ['destroyed-doc-1', 'destroyed-doc-2'])

    await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(mocks.notInArray).toHaveBeenCalledWith(expect.anything(), ['destroyed-doc-1', 'destroyed-doc-2'])
  })

  it('omits the notInArray clause when no documents are in a destroyed berkas', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([])

    await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(mocks.notInArray).not.toHaveBeenCalled()
  })

  it('rejects an invalid start_date parameter', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja?start_date=not-a-date'),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Parameter periode tidak valid' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('rejects an invalid end_date parameter', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja?end_date=2026'),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Parameter periode tidak valid' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('applies gte/lte date bounds to the where clause when a valid period is given', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([])

    await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja?start_date=2026-07-01&end_date=2026-09-30'),
    })

    expect(mocks.gte).toHaveBeenCalledWith(expect.anything(), '2026-07-01')
    expect(mocks.lte).toHaveBeenCalledWith(expect.anything(), '2026-09-30')
    const lastAndCall = mocks.and.mock.calls[mocks.and.mock.calls.length - 1]
    expect(lastAndCall).toContainEqual({ type: 'gte', column: expect.anything(), value: '2026-07-01' })
    expect(lastAndCall).toContainEqual({ type: 'lte', column: expect.anything(), value: '2026-09-30' })
  })

  it('omits date clauses entirely when no period parameters are given', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([])

    await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })

    expect(mocks.gte).not.toHaveBeenCalled()
    expect(mocks.lte).not.toHaveBeenCalled()
  })

  it('marks the response truncated when the result hits the row limit', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    const rows = Array.from({ length: 2000 }, () => createRow())
    setupDbSelect(rows)

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })
    const body = await response.json()

    expect(body.meta.truncated).toBe(true)
    expect(body.meta.count).toBe(2000)
  })

  it('returns available years from the distinct year query', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(
      ['PENANGGUNG_JAWAB_KINERJA'],
      'PENANGGUNG_JAWAB_KINERJA',
    ))
    setupDbSelect([])
    mocks.dbSelectDistinct.mockReturnValue(createDistinctQueryBuilder([
      { tahun: 2026 },
      { tahun: 2025 },
    ]))

    const response = await getHandler({
      request: new Request('http://localhost/api/laporan/kinerja'),
    })
    const body = await response.json()

    expect(body.meta.tahun_tersedia).toEqual([2026, 2025])
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

// The route issues three `db.select(...)` calls in order: destroyed-berkas
// document ids, then berkased (diberkaskan) document ids, then the main row
// query. `setupDbSelect` queues all three via `mockReturnValueOnce` so each
// test only has to describe the shapes it cares about.
function setupDbSelect(
  mainRows: unknown[],
  destroyedDokumenIds: string[] = [],
  berkasedDokumenIds: string[] = [],
) {
  mocks.dbSelect
    .mockReturnValueOnce(createIdListQueryBuilder(destroyedDokumenIds.map((dokumenId) => ({ dokumenId }))))
    .mockReturnValueOnce(createIdListQueryBuilder(berkasedDokumenIds.map((dokumenId) => ({ dokumenId }))))
    .mockReturnValueOnce(createQueryBuilder(mainRows))
}

function createIdListQueryBuilder(result: { dokumenId: string }[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.innerJoin = vi.fn(() => query)
  query.where = vi.fn(async () => result)

  return query
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

function createDistinctQueryBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.orderBy = vi.fn(async () => result)

  return query
}

function createRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    judul: 'Dokumen final',
    status: 'COMPLETED',
    fungsi_nama: 'Fungsi',
    kegiatan_nama: 'Kegiatan',
    komponen_id: 'komponen-1',
    komponen_nama: 'Komponen',
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
