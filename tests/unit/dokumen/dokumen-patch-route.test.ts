import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PATCH /api/dokumen/$id (Pegawai):
// - D-12: changing kegiatan re-derives is_ketua_tim on the server

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OTHER_KEGIATAN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
  txUpdateSet: vi.fn(),
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

import { Route as DokumenIdRoute } from '#/routes/api/dokumen.$id'

type Handler = (args: { request: Request; params: Record<string, string> }) => Promise<Response>

const patchHandler = (DokumenIdRoute as unknown as {
  options: { server: { handlers: { PATCH: Handler } } }
}).options.server.handlers.PATCH

function patch(body: Record<string, unknown>) {
  return patchHandler({
    request: new Request(`http://localhost/api/dokumen/${DOKUMEN_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify(body),
    }),
    params: { id: DOKUMEN_ID },
  })
}

// Every select chain (from/leftJoin/where) resolves on limit() with the next queued result.
function queueSelectResults(...results: unknown[][]) {
  const queue = [...results]
  mocks.dbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const builder: Record<string, unknown> = {}
    builder.from = vi.fn(() => builder)
    builder.leftJoin = vi.fn(() => builder)
    builder.where = vi.fn(() => builder)
    builder.limit = vi.fn(async () => result)
    return builder
  })
}

function materialRevisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOKUMEN_ID,
    created_by: USER_ID,
    status: 'NEED_REVISION',
    revision_target: 'USER',
    lampiran_urls: [],
    is_non_material: false,
    jenis_permintaan_id: 'jenis-1',
    kategori_permintaan_id: 'kategori-1',
    detail_permintaan_id: null,
    tahun: 2026,
    nama_dokumen: null,
    lampiran_dibersihkan_at: null,
    ...overrides,
  }
}

function nonMaterialRow(overrides: Record<string, unknown> = {}) {
  return materialRevisionRow({
    status: 'TERSIMPAN',
    revision_target: null,
    is_non_material: true,
    jenis_permintaan_id: null,
    kategori_permintaan_id: null,
    ...overrides,
  })
}

const updatedRow = {
  id: DOKUMEN_ID,
  judul: 'Dokumen',
  lampiran_urls: [],
  nominal_realisasi: '1000.00',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.getLocalServerSession.mockResolvedValue({
    user: { id: USER_ID, username: 'pegawai' },
    userId: USER_ID,
    roles: ['PEGAWAI'],
    activeRole: 'PEGAWAI',
  })
  mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation({
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.txUpdateSet(values)
        return { where: () => ({ returning: async () => [{ id: DOKUMEN_ID }] }) }
      },
    }),
    insert: () => ({ values: async () => undefined }),
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PATCH /api/dokumen/$id — Ketua Tim follows the kegiatan (D-12)', () => {
  it('sets is_ketua_tim=true when the pengaju is Ketua Tim of the new kegiatan', async () => {
    queueSelectResults([nonMaterialRow()], [{ id: 'assignment-1' }], [updatedRow])

    const response = await patch({ kegiatanId: OTHER_KEGIATAN_ID })

    expect(response.status).toBe(200)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      kegiatanJenisId: OTHER_KEGIATAN_ID,
      isKetuaTim: true,
    }))
  })

  it('sets is_ketua_tim=false when the pengaju has no assignment in the new kegiatan', async () => {
    queueSelectResults([nonMaterialRow()], [], [updatedRow])

    const response = await patch({ kegiatanId: OTHER_KEGIATAN_ID })

    expect(response.status).toBe(200)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      kegiatanJenisId: OTHER_KEGIATAN_ID,
      isKetuaTim: false,
    }))
  })

  it('leaves is_ketua_tim untouched when kegiatan does not change', async () => {
    queueSelectResults([nonMaterialRow()], [updatedRow])

    const response = await patch({ judul: 'Judul baru' })

    expect(response.status).toBe(200)
    expect(mocks.txUpdateSet.mock.calls[0][0]).not.toHaveProperty('isKetuaTim')
  })
})

describe('PATCH /api/dokumen/$id — nominal follows the SUBMIT rule (D-2)', () => {
  it.each([
    ['0', 0],
    ['null', null],
  ])('rejects Material nominal %s', async (_label, nominal) => {
    queueSelectResults([materialRevisionRow()])

    const response = await patch({ nominalRealisasi: nominal })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal_realisasi wajib untuk dokumen Material' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('accepts a positive Material nominal', async () => {
    queueSelectResults([materialRevisionRow()], [updatedRow])

    const response = await patch({ nominalRealisasi: 1500000 })

    expect(response.status).toBe(200)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ nominalRealisasi: '1500000' }))
  })

  it.each([
    ['0', 0],
    ['a positive value', 5000],
    ['null', null],
  ])('rejects any nominal (%s) on a Non-Material document', async (_label, nominal) => {
    queueSelectResults([nonMaterialRow()])

    const response = await patch({ nominalRealisasi: nominal })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Dokumen Non-Material tidak memiliki nominal realisasi' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('keeps Material metadata locked once COMPLETED', async () => {
    queueSelectResults([materialRevisionRow({ status: 'COMPLETED', revision_target: null })])

    const response = await patch({ nominalRealisasi: 2000000 })

    expect(response.status).toBe(400)
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })
})
