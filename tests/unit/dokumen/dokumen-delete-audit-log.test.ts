import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const KEGIATAN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  txDelete: vi.fn(),
  tandaiFileDihapusUntukSumber: vi.fn(),
  triggerDriveRunner: vi.fn(),
}))

// Hook Drive (section 09) dijalankan dengan tx rute; tx tiruan di sini hanya
// mengenal insert/delete, jadi hook di-mock dan urutannya diperiksa terpisah.
vi.mock('#/lib/google-drive/penghapusan', () => ({ tandaiFileDihapusUntukSumber: mocks.tandaiFileDihapusUntukSumber }))
vi.mock('#/lib/google-drive/runner', () => ({ triggerDriveRunner: mocks.triggerDriveRunner }))

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

type RouteDeleteHandler = (args: { request: Request; params: Record<string, string> }) => Promise<Response>

const deleteHandler = (DokumenIdRoute as unknown as {
  options: { server: { handlers: { DELETE: RouteDeleteHandler } } }
}).options.server.handlers.DELETE

function makeDeleteRequest(): Request {
  return new Request(`http://localhost/api/dokumen/${DOKUMEN_ID}`, {
    method: 'DELETE',
    headers: { origin: 'http://localhost' },
  })
}

function queueSelectResults(results: unknown[][]) {
  const queue = [...results]
  mocks.dbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => result),
        })),
      })),
    }
  })
}

describe('DELETE /api/dokumen/$id -- hard delete audit trail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLocalServerSession.mockResolvedValue({
      user: { id: USER_ID },
      roles: ['PEGAWAI'],
    })

    const txInsertValues = vi.fn(async () => undefined)
    mocks.txInsert = vi.fn(() => ({ values: txInsertValues }))
    mocks.txInsertValues = txInsertValues
    mocks.txDelete = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: DOKUMEN_ID }]),
      })),
    }))

    mocks.tandaiFileDihapusUntukSumber.mockResolvedValue({ tautanTerdampak: 0 })
    mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      await callback({
        insert: mocks.txInsert,
        delete: mocks.txDelete,
      })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes an audit.audit_log DOKUMEN_DIHAPUS_PERMANEN snapshot before deleting the row', async () => {
    queueSelectResults([
      // 1st select: dokumen lookup
      [{
        id: DOKUMEN_ID,
        judul: 'Laporan Bulanan Januari',
        nama_dokumen: 'Laporan Bulanan Januari',
        created_by: USER_ID,
        kegiatan_jenis_id: KEGIATAN_ID,
        status: 'TERSIMPAN',
        lampiran_urls: [],
        is_non_material: true,
        jenis_permintaan_id: null,
        kategori_permintaan_id: null,
        detail_permintaan_id: null,
      }],
      // 2nd select: berkas_arsip_item membership check (must be empty)
      [],
    ])

    const response = await deleteHandler({
      request: makeDeleteRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(200)

    // Two inserts inside the transaction: audit_log first, then log_aktivitas.
    expect(mocks.txInsert).toHaveBeenCalledTimes(2)
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(1, {
      entityType: 'DOKUMEN',
      entityId: DOKUMEN_ID,
      aksi: 'DOKUMEN_DIHAPUS_PERMANEN',
      actorUserId: USER_ID,
      metadataSnapshot: {
        judul: 'Laporan Bulanan Januari',
        nama_dokumen: 'Laporan Bulanan Januari',
        pemilik_id: USER_ID,
        kegiatan_id: KEGIATAN_ID,
        jumlah_lampiran: 0,
      },
    })

    // The audit insert must be called (and thus queued in the transaction)
    // before the row delete -- since log_aktivitas.dokumen_id cascades away
    // on delete, only the FK-free audit_log row survives as a real trail.
    const auditInsertOrder = mocks.txInsert.mock.invocationCallOrder[0]
    const deleteOrder = mocks.txDelete.mock.invocationCallOrder[0]
    expect(auditInsertOrder).toBeLessThan(deleteOrder)
  })

  it('rejects deletion (and writes no audit row) for a document that is not pure non-material TERSIMPAN', async () => {
    queueSelectResults([
      [{
        id: DOKUMEN_ID,
        judul: 'Dokumen Material',
        nama_dokumen: null,
        created_by: USER_ID,
        kegiatan_jenis_id: KEGIATAN_ID,
        status: 'COMPLETED',
        lampiran_urls: [],
        is_non_material: false,
        jenis_permintaan_id: 'jenis-1',
        kategori_permintaan_id: null,
        detail_permintaan_id: null,
      }],
    ])

    const response = await deleteHandler({
      request: makeDeleteRequest(),
      params: { id: DOKUMEN_ID },
    })

    expect(response.status).toBe(400)
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/dokumen/$id -- salinan Google Drive ikut dihapus (P4, section 09)', () => {
  const dokumenRow = (overrides: Record<string, unknown> = {}) => ({
    id: DOKUMEN_ID,
    judul: 'Notulen',
    nama_dokumen: 'Notulen',
    created_by: USER_ID,
    kegiatan_jenis_id: KEGIATAN_ID,
    status: 'TERSIMPAN',
    lampiran_urls: [],
    is_non_material: true,
    jenis_permintaan_id: null,
    kategori_permintaan_id: null,
    detail_permintaan_id: null,
    ...overrides,
  })

  let txObject: unknown

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLocalServerSession.mockResolvedValue({ user: { id: USER_ID }, roles: ['PEGAWAI'] })
    const txInsertValues = vi.fn(async () => undefined)
    mocks.txInsert = vi.fn(() => ({ values: txInsertValues }))
    mocks.txDelete = vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: DOKUMEN_ID }]) })) }))
    mocks.tandaiFileDihapusUntukSumber.mockResolvedValue({ tautanTerdampak: 1 })
    mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      txObject = { insert: mocks.txInsert, delete: mocks.txDelete }
      await callback(txObject)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('menandai salinan Drive DIHAPUS_PEMILIK di transaksi DELETE yang sama, sebelum baris dihapus; lalu memicu runner', async () => {
    queueSelectResults([[dokumenRow()], []])

    const response = await deleteHandler({ request: makeDeleteRequest(), params: { id: DOKUMEN_ID } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.tandaiFileDihapusUntukSumber).toHaveBeenCalledTimes(1)
    const [tx, input] = mocks.tandaiFileDihapusUntukSumber.mock.calls[0]
    expect(tx).toBe(txObject)
    expect(input).toEqual({ dokumenIds: [DOKUMEN_ID], keterangan: 'DIHAPUS_PEMILIK', now: expect.any(Date) })
    expect(mocks.tandaiFileDihapusUntukSumber.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.txDelete.mock.invocationCallOrder[0])
    expect(mocks.triggerDriveRunner).toHaveBeenCalledTimes(1)
    expect(mocks.triggerDriveRunner.mock.invocationCallOrder[0])
      .toBeGreaterThan(mocks.dbTransaction.mock.invocationCallOrder[0])
  })

  it('hook gagal -> transaksi gagal (500), dokumen tidak dihapus, runner tidak dipicu', async () => {
    queueSelectResults([[dokumenRow()], []])
    mocks.tandaiFileDihapusUntukSumber.mockRejectedValue(new Error('drive_job insert failed'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await deleteHandler({ request: makeDeleteRequest(), params: { id: DOKUMEN_ID } })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Gagal menghapus dokumen' })
    expect(mocks.txDelete).not.toHaveBeenCalled()
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })

  it('dokumen yang tidak boleh dihapus (400) / bukan pemilik (403) tidak menyentuh Drive', async () => {
    queueSelectResults([[dokumenRow({ status: 'COMPLETED', is_non_material: false })]])
    expect((await deleteHandler({ request: makeDeleteRequest(), params: { id: DOKUMEN_ID } })).status).toBe(400)

    queueSelectResults([[dokumenRow({ created_by: 'orang-lain' })]])
    expect((await deleteHandler({ request: makeDeleteRequest(), params: { id: DOKUMEN_ID } })).status).toBe(403)

    expect(mocks.tandaiFileDihapusUntukSumber).not.toHaveBeenCalled()
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })
})
