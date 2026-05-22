import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const MANUAL_ARSIP_ID = '33333333-3333-4333-8333-333333333333'
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444'
const KLASIFIKASI_ID = '55555555-5555-4555-8555-555555555555'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  insertValues: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
  },
}))

import { Route as ManualArsipCategoriesRoute } from '#/routes/api/arsiparis/manual-arsip/categories'
import { Route as ManualArsipIndexRoute } from '#/routes/api/arsiparis/manual-arsip/index'
import { Route as ManualArsipDetailRoute } from '#/routes/api/arsiparis/manual-arsip/$id'

type RouteGetHandler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>
type RoutePostHandler = (args: { request: Request }) => Promise<Response>

const categoriesGetHandler = (ManualArsipCategoriesRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const indexHandlers = (ManualArsipIndexRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler; POST: RoutePostHandler } } }
}).options.server.handlers

const detailGetHandler = (ManualArsipDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('manual arsip API foundation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
  })

  it('requires assigned KEPALA_SUB_BAGIAN_UMUM or ADMIN for category list', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['PEGAWAI'], USER_ID))

    const rejected = await categoriesGetHandler({
      request: new Request('http://localhost/api/arsiparis/manual-arsip/categories'),
    })

    expect(rejected.status).toBe(403)
    expect(await rejected.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()

    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['ADMIN'], ADMIN_ID))
    queueSelectResults([{
      id: CATEGORY_ID,
      nama: 'Pemeliharaan',
      deskripsi: 'Kategori pemeliharaan',
    }])

    const allowed = await categoriesGetHandler({
      request: new Request('http://localhost/api/arsiparis/manual-arsip/categories'),
    })

    expect(allowed.status).toBe(200)
    expect(await allowed.json()).toEqual({
      categories: [{
        id: CATEGORY_ID,
        nama: 'Pemeliharaan',
        deskripsi: 'Kategori pemeliharaan',
      }],
    })
  })

  it('protects create with the same-origin guard before auth/db work', async () => {
    const response = await indexHandlers.POST({
      request: createPostRequest(validCreateBody(), 'http://evil.test'),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('rejects create for unauthorized assigned roles', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['PEGAWAI'], USER_ID))

    const response = await indexHandlers.POST({
      request: createPostRequest(validCreateBody()),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('rejects missing keterangan without a 500', async () => {
    const response = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        keterangan: '',
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Keterangan wajib diisi' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('rejects negative nominal without a 500', async () => {
    const response = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        nominal_realisasi: -1,
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal realisasi tidak boleh negatif' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('writes created_by from the server session and returns no file access fields', async () => {
    queueSelectResults([manualCategoryRow()], [klasifikasiRow()])
    queueInsertResult([manualArsipRow()])

    const response = await indexHandlers.POST({
      request: createPostRequest(validCreateBody()),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      createdBy: USER_ID,
      statusArsip: 'AKTIF',
      categoryId: CATEGORY_ID,
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiNamaSnapshot: 'Klasifikasi A',
    }))
    expect(JSON.stringify(body)).not.toContain('logical_path')
    expect(JSON.stringify(body)).not.toContain('logicalPath')
    expect(JSON.stringify(body)).not.toContain('file_url')
    expect(JSON.stringify(body.manual_arsip.attachments)).toBe('[]')
  })

  it('rejects top-level and metadata file path fields on create', async () => {
    const topLevelResponse = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        logical_path: 'manual/path.pdf',
      }),
    })

    expect(topLevelResponse.status).toBe(400)
    expect(mocks.dbInsert).not.toHaveBeenCalled()

    const metadataResponse = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        metadata: { logical_path: 'manual/path.pdf' },
      }),
    })

    expect(metadataResponse.status).toBe(400)
    expect(await metadataResponse.json()).toEqual({
      error: 'Metadata tidak boleh berisi field inti atau field akses file',
    })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('returns list/detail responses without logical attachment paths or URLs', async () => {
    queueSelectResults(
      [{
        ...manualArsipJoinedRow(),
        logical_path: 'must-not-leak.pdf',
        file_url: 'http://localhost/file.pdf',
      }],
      [{
        ...manualArsipJoinedRow(),
        metadata: {},
        logical_path: 'must-not-leak.pdf',
      }],
      [{
        id: '66666666-6666-4666-8666-666666666666',
        original_filename: 'lampiran.pdf',
        content_type: 'application/pdf',
        size_bytes: 10,
        created_at: new Date('2026-05-22T00:00:00.000Z'),
        logical_path: 'manual/path.pdf',
      }],
    )

    const listResponse = await indexHandlers.GET({
      request: new Request('http://localhost/api/arsiparis/manual-arsip'),
    })
    const detailResponse = await detailGetHandler({
      request: new Request(`http://localhost/api/arsiparis/manual-arsip/${MANUAL_ARSIP_ID}`),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(listResponse.status).toBe(200)
    expect(detailResponse.status).toBe(200)

    const listBody = await listResponse.json()
    const detailBody = await detailResponse.json()

    expect(listBody.meta).toEqual({ limit: 100 })
    expect(JSON.stringify(listBody)).not.toContain('logical_path')
    expect(JSON.stringify(listBody)).not.toContain('file_url')
    expect(JSON.stringify(detailBody)).not.toContain('logical_path')
    expect(JSON.stringify(detailBody)).not.toContain('file_url')
    expect(detailBody.manual_arsip.attachments).toEqual([{
      id: '66666666-6666-4666-8666-666666666666',
      original_filename: 'lampiran.pdf',
      content_type: 'application/pdf',
      size_bytes: 10,
      created_at: '2026-05-22T00:00:00.000Z',
    }])
  })
})

function createSession(roles: string[], userId: string) {
  return {
    user: {
      id: userId,
      email: 'user@example.test',
    },
    userId,
    email: 'user@example.test',
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function validCreateBody() {
  return {
    nama: 'Arsip manual uji',
    tanggal: '2026-05-22',
    keterangan: 'Keterangan arsip manual',
    category_id: CATEGORY_ID,
    klasifikasi_id: KLASIFIKASI_ID,
    nominal_realisasi: 1000,
    metadata: { sumber: 'manual' },
  }
}

function createPostRequest(body: Record<string, unknown>, origin = 'http://localhost') {
  return new Request('http://localhost/api/arsiparis/manual-arsip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  })
}

function manualCategoryRow() {
  return {
    id: CATEGORY_ID,
    nama: 'Pemeliharaan',
    deskripsi: null,
  }
}

function klasifikasiRow() {
  return {
    id: KLASIFIKASI_ID,
    nama: 'Klasifikasi A',
  }
}

function manualArsipRow() {
  return {
    id: MANUAL_ARSIP_ID,
    nama: 'Arsip manual uji',
    tanggal: '2026-05-22',
    keterangan: 'Keterangan arsip manual',
    nominal_realisasi: '1000.00',
    status_arsip: 'AKTIF',
    category_id: CATEGORY_ID,
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_nama_snapshot: 'Klasifikasi A',
    metadata: { sumber: 'manual' },
    created_by: USER_ID,
    created_at: new Date('2026-05-22T00:00:00.000Z'),
    updated_at: new Date('2026-05-22T00:00:00.000Z'),
  }
}

function manualArsipJoinedRow() {
  return {
    id: MANUAL_ARSIP_ID,
    nama: 'Arsip manual uji',
    tanggal: '2026-05-22',
    keterangan: 'Keterangan arsip manual',
    nominal_realisasi: '1000.00',
    status_arsip: 'AKTIF',
    category_id: CATEGORY_ID,
    category_nama: 'Pemeliharaan',
    category_deskripsi: null,
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_nama: 'Klasifikasi A',
    klasifikasi_nama_snapshot: 'Klasifikasi A',
    metadata: {},
    created_by: USER_ID,
    created_at: new Date('2026-05-22T00:00:00.000Z'),
    updated_at: new Date('2026-05-22T00:00:00.000Z'),
  }
}

function queueSelectResults(...results: unknown[][]) {
  const queue = [...results]
  mocks.dbSelect.mockImplementation(() => createSelectBuilder(queue.shift() ?? []))
}

function createSelectBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.leftJoin = vi.fn(() => query)
  query.orderBy = vi.fn(() => query)
  query.limit = vi.fn(async () => result)
  query.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => {
    return Promise.resolve(result).then(resolve, reject)
  }

  return query
}

function queueInsertResult(result: unknown[]) {
  mocks.dbInsert.mockReturnValue({
    values: mocks.insertValues.mockReturnValue({
      returning: vi.fn(async () => result),
    }),
  })
}
