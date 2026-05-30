import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
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

import { Route as KlasifikasiCreateRoute } from '#/routes/api/arsiparis/klasifikasi/index'

type RoutePostHandler = (args: {
  request: Request
}) => Promise<Response>
type RouteGetHandler = (args: {
  request: Request
}) => Promise<Response>

const postHandler = (KlasifikasiCreateRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler; POST: RoutePostHandler } } }
}).options.server.handlers.POST

const getHandler = (KlasifikasiCreateRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler; POST: RoutePostHandler } } }
}).options.server.handlers.GET

describe('arsiparis klasifikasi create route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 403 for ADMIN-only create requests', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['ADMIN']))

    const response = await postHandler({
      request: createPostRequest({
        kode: 'TES-001',
        nama: 'Tes 001',
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Hanya Kepala Sub Bagian Umum yang bisa menambah klasifikasi',
    })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('allows KEPALA_SUB_BAGIAN_UMUM to create klasifikasi', async () => {
    queueSelectResults([], [])
    queueInsertResult([createdKlasifikasi()])

    const response = await postHandler({
      request: createPostRequest({
        kode: 'TES-001',
        nama: 'Tes 001',
      }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      id: 'created-klasifikasi',
      kode: 'TES-001',
      nama: 'Tes 001',
    })
    expect(mocks.dbInsert).toHaveBeenCalledTimes(1)
  })

  it('returns a clear 409 when an active nama already exists', async () => {
    queueSelectResults([{ id: 'existing-nama' }])

    const response = await postHandler({
      request: createPostRequest({
        kode: 'TES-001',
        nama: 'Tes 001',
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Nama klasifikasi sudah digunakan.' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('returns a clear 409 when an active kode already exists', async () => {
    queueSelectResults([], [{ id: 'existing-kode' }])

    const response = await postHandler({
      request: createPostRequest({
        kode: 'TES-001',
        nama: 'Tes 001',
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Kode klasifikasi sudah digunakan.' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('maps database kode unique violations to 409 without leaking raw database details', async () => {
    queueSelectResults([], [])
    queueInsertFailure({
      code: '23505',
      constraint: 'idx_master_klasifikasi_kode_unique',
      detail: 'raw detail must not be returned',
      message: 'duplicate key value violates unique constraint',
    })

    const response = await postHandler({
      request: createPostRequest({
        kode: 'TES-001',
        nama: 'Tes 001',
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Kode klasifikasi sudah digunakan.' })
  })

  it('maps unknown database unique violations to a generic 409 conflict', async () => {
    queueSelectResults([], [])
    queueInsertFailure({
      code: '23505',
      constraint: 'some_other_unique_constraint',
      detail: 'raw detail must not be returned',
      message: 'duplicate key value violates unique constraint',
    })

    const response = await postHandler({
      request: createPostRequest({
        kode: 'TES-001',
        nama: 'Tes 001',
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Klasifikasi dengan kode atau nama tersebut sudah ada.',
    })
  })

  it('keeps unexpected insert failures as a generic 500', async () => {
    queueSelectResults([], [])
    queueInsertFailure(new Error('database unavailable'))

    const response = await postHandler({
      request: createPostRequest({
        kode: 'TES-001',
        nama: 'Tes 001',
      }),
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Gagal membuat klasifikasi' })
  })

  it('returns all active classifications by default for master-data use', async () => {
    queueSelectResults(klasifikasiRows())

    const response = await getHandler({
      request: new Request('http://localhost/api/arsiparis/klasifikasi'),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.klasifikasi[0].children.map((node: { id: string }) => node.id)).toEqual([
      'new-leaf',
      'closed-leaf',
      'open-leaf',
    ])
  })

  it('filters Jenis Pembayaran options for berkas selection eligibility', async () => {
    queueSelectResults(
      klasifikasiRows(),
      [
        { klasifikasi_id: 'closed-leaf', status_berkas: 'CLOSED', status_arsip: 'AKTIF' },
        { klasifikasi_id: 'open-leaf', status_berkas: 'OPEN', status_arsip: null },
      ],
    )

    const response = await getHandler({
      request: new Request('http://localhost/api/arsiparis/klasifikasi?eligible_for_berkas=true'),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.klasifikasi[0].children.map((node: { id: string }) => node.id)).toEqual([
      'new-leaf',
      'open-leaf',
    ])
    expect(JSON.stringify(body)).not.toContain('closed-leaf')
  })
})

function createSession(roles = ['KEPALA_SUB_BAGIAN_UMUM']) {
  return {
    user: {
      id: USER_ID,
      email: 'kepala-sub-bagian-umum@example.test',
    },
    userId: USER_ID,
    email: 'kepala-sub-bagian-umum@example.test',
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function createdKlasifikasi() {
  return {
    id: 'created-klasifikasi',
    nama: 'Tes 001',
    deskripsi: null,
    is_active: true,
    created_at: '2026-05-22T00:00:00.000Z',
    parent_id: null,
    kode: 'TES-001',
  }
}

function klasifikasiRows() {
  return [
    {
      id: 'root',
      nama: 'Root',
      kode: '000',
      deskripsi: null,
      parent_id: null,
      created_at: '2026-05-22T00:00:00.000Z',
    },
    {
      id: 'new-leaf',
      nama: 'Jenis Baru',
      kode: '001',
      deskripsi: null,
      parent_id: 'root',
      created_at: '2026-05-22T00:00:00.000Z',
    },
    {
      id: 'closed-leaf',
      nama: 'Jenis Ditutup',
      kode: '002',
      deskripsi: null,
      parent_id: 'root',
      created_at: '2026-05-22T00:00:00.000Z',
    },
    {
      id: 'open-leaf',
      nama: 'Jenis Terbuka',
      kode: '003',
      deskripsi: null,
      parent_id: 'root',
      created_at: '2026-05-22T00:00:00.000Z',
    },
  ]
}

function createPostRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/arsiparis/klasifikasi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  })
}

function queueSelectResults(...results: unknown[][]) {
  const queue = [...results]
  mocks.dbSelect.mockImplementation(() => createSelectBuilder(queue.shift() ?? []))
}

function createSelectBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn(async () => result)
  query.orderBy = vi.fn(async () => result)
  query.then = vi.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject))

  return query
}

function queueInsertFailure(error: unknown) {
  mocks.dbInsert.mockReturnValue({
    values: vi.fn(() => ({
      returning: vi.fn(async () => {
        throw error
      }),
    })),
  })
}

function queueInsertResult(result: unknown[]) {
  mocks.dbInsert.mockReturnValue({
    values: vi.fn(() => ({
      returning: vi.fn(async () => result),
    })),
  })
}
