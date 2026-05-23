import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CURRENT_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
    update: mocks.dbUpdate,
  },
}))

import { Route as KlasifikasiUpdateRoute } from '#/routes/api/arsiparis/klasifikasi/$id'

type RoutePatchHandler = (args: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

type RouteDeleteHandler = (args: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const patchHandler = (KlasifikasiUpdateRoute as unknown as {
  options: { server: { handlers: { PATCH: RoutePatchHandler; DELETE: RouteDeleteHandler } } }
}).options.server.handlers.PATCH

const deleteHandler = (KlasifikasiUpdateRoute as unknown as {
  options: { server: { handlers: { PATCH: RoutePatchHandler; DELETE: RouteDeleteHandler } } }
}).options.server.handlers.DELETE

describe('arsiparis klasifikasi update route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 403 for ADMIN-only update requests', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['ADMIN']))

    const response = await patchHandler({
      request: createPatchRequest({ deskripsi: 'Deskripsi baru' }),
      params: { id: CURRENT_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Hanya Kepala Sub Bagian Umum yang bisa mengubah klasifikasi',
    })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('returns 403 for ADMIN-only delete requests', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['ADMIN']))

    const response = await deleteHandler({
      request: createDeleteRequest(),
      params: { id: CURRENT_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Hanya Kepala Sub Bagian Umum yang bisa menghapus klasifikasi',
    })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('returns a clear 409 when updating to an active nama from another row', async () => {
    queueSelectResults([currentKlasifikasi()], [{ id: 'existing-nama' }])

    const response = await patchHandler({
      request: createPatchRequest({ nama: 'Nama Dipakai' }),
      params: { id: CURRENT_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Nama klasifikasi sudah digunakan.' })
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('returns a clear 409 when updating to an active kode from another row', async () => {
    queueSelectResults([currentKlasifikasi()], [{ id: 'existing-kode' }])

    const response = await patchHandler({
      request: createPatchRequest({ kode: 'DUP-001' }),
      params: { id: CURRENT_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Kode klasifikasi sudah digunakan.' })
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('does not block unchanged current row kode and nama as duplicates', async () => {
    const current = currentKlasifikasi()
    queueSelectResults([current])
    queueUpdateResult([{ ...current, deskripsi: 'Deskripsi baru' }])

    const response = await patchHandler({
      request: createPatchRequest({
        kode: current.kode,
        nama: current.nama,
        deskripsi: 'Deskripsi baru',
      }),
      params: { id: CURRENT_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: CURRENT_ID,
      kode: current.kode,
      nama: current.nama,
      deskripsi: 'Deskripsi baru',
    })
    expect(mocks.dbSelect).toHaveBeenCalledTimes(1)
    expect(mocks.dbUpdate).toHaveBeenCalledTimes(1)
  })

  it('maps database kode unique violations to 409 without leaking raw database details', async () => {
    queueSelectResults([currentKlasifikasi()], [])
    queueUpdateFailure({
      code: '23505',
      detail: 'Key (kode)=(TEST) already exists.',
      message: 'duplicate key value violates unique constraint',
    })

    const response = await patchHandler({
      request: createPatchRequest({ kode: 'TEST' }),
      params: { id: CURRENT_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Kode klasifikasi sudah digunakan.' })
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('TEST')
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('Key (kode)')
  })

  it('maps unknown database unique violations to a generic 409 conflict', async () => {
    queueSelectResults([currentKlasifikasi()], [])
    queueUpdateFailure({
      code: '23505',
      constraint: 'some_other_unique_constraint',
      detail: 'raw detail must not be returned',
      message: 'duplicate key value violates unique constraint',
    })

    const response = await patchHandler({
      request: createPatchRequest({ kode: 'TEST' }),
      params: { id: CURRENT_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Klasifikasi dengan kode atau nama tersebut sudah ada.',
    })
  })

  it('keeps unexpected update failures as a generic 500', async () => {
    queueSelectResults([currentKlasifikasi()])
    queueUpdateFailure(new Error('database unavailable'))

    const response = await patchHandler({
      request: createPatchRequest({ deskripsi: 'Deskripsi baru' }),
      params: { id: CURRENT_ID },
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Gagal memperbarui klasifikasi' })
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

function currentKlasifikasi() {
  return {
    id: CURRENT_ID,
    nama: 'Klasifikasi Lama',
    kode: 'OLD-001',
    deskripsi: 'Deskripsi lama',
    is_active: true,
    created_at: '2026-05-22T00:00:00.000Z',
    parent_id: null,
  }
}

function createPatchRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/arsiparis/klasifikasi/${CURRENT_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  })
}

function createDeleteRequest() {
  return new Request(`http://localhost/api/arsiparis/klasifikasi/${CURRENT_ID}`, {
    method: 'DELETE',
    headers: {
      Origin: 'http://localhost',
    },
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

  return query
}

function queueUpdateResult(result: unknown[]) {
  mocks.dbUpdate.mockReturnValue(createUpdateBuilder(async () => result))
}

function queueUpdateFailure(error: unknown) {
  mocks.dbUpdate.mockReturnValue(createUpdateBuilder(async () => {
    throw error
  }))
}

function createUpdateBuilder(returning: () => Promise<unknown[]>): Record<string, unknown> {
  const returningBuilder = {
    returning: vi.fn(returning),
  }
  const whereBuilder = {
    where: vi.fn(() => returningBuilder),
  }

  return {
    set: vi.fn(() => whereBuilder),
  }
}
