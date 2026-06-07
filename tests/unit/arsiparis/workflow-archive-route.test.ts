import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_USER_ID = '11111111-1111-4111-8111-111111111111'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const KLASIFIKASI_ID = '44444444-4444-4444-8444-444444444444'
const BERKAS_ID = '55555555-5555-4555-8555-555555555555'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  txInsertReturning: vi.fn(),
  txSelect: vi.fn(),
  txUpdate: vi.fn(),
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

import { Route as WorkflowArchiveRoute } from '#/routes/api/arsiparis/dokumen.$id.archive'

type RoutePostHandler = (args: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const postHandler = (WorkflowArchiveRoute as unknown as {
  options: { server: { handlers: { POST: RoutePostHandler } } }
}).options.server.handlers.POST

describe('workflow classification to berkas route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('classifies a COMPLETED workflow document into a new OPEN berkas without canonical archive writes or status transition', async () => {
    queueSelectResults(
      [dokumenRow()],
      [klasifikasiRow()],
    )
    queueSuccessfulTransaction()

    const response = await postHandler({
      request: createPostRequest({
        ...validArchiveBody(),
        klasifikasi: 'Client supplied classification must be ignored',
      }),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      success: true,
      message: 'Dokumen berhasil diklasifikasikan',
    })

    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(1, expect.objectContaining({
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: 'KA.01',
      klasifikasiNamaSnapshot: 'Keuangan',
      statusBerkas: 'OPEN',
      createdBy: SESSION_USER_ID,
    }))
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({
      berkasId: BERKAS_ID,
      eventType: 'BERKAS_DIBUKA',
      actorUserId: SESSION_USER_ID,
      sourceType: null,
      workflowDocumentId: null,
      manualDocumentId: null,
    }))
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(3, expect.objectContaining({
      berkasId: BERKAS_ID,
      sourceType: 'WORKFLOW',
      dokumenId: DOCUMENT_ID,
      manualArsipId: null,
      addedBy: SESSION_USER_ID,
    }))
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(4, expect.objectContaining({
      berkasId: BERKAS_ID,
      eventType: 'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN',
      actorUserId: SESSION_USER_ID,
      sourceType: 'WORKFLOW',
      workflowDocumentId: DOCUMENT_ID,
      manualDocumentId: null,
    }))
    expect(mocks.txInsertValues).toHaveBeenCalledTimes(4)
    expect(mocks.txInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({ statusArsip: 'AKTIF' }))
    expect(mocks.txInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({ archivedBy: SESSION_USER_ID }))
    expect(mocks.txUpdate).not.toHaveBeenCalled()

    const responseText = JSON.stringify(body)
    expect(responseText).not.toContain('logical_path')
    expect(responseText).not.toContain('storage')
    expect(responseText).not.toContain('token')
    expect(responseText).not.toContain('formal/path.pdf')
  })

  it('allows initial classification without nomor_surat', async () => {
    queueSelectResults(
      [dokumenRow()],
      [klasifikasiRow()],
    )
    queueSuccessfulTransaction()

    const body = validArchiveBody() as Record<string, unknown>
    delete body.nomor_surat

    const response = await postHandler({
      request: createPostRequest(body),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      message: 'Dokumen berhasil diklasifikasikan',
    })
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(1, expect.objectContaining({
      klasifikasiId: KLASIFIKASI_ID,
      statusBerkas: 'OPEN',
    }))
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })

  it('allows initial classification without final retention metadata', async () => {
    queueSelectResults(
      [dokumenRow()],
      [klasifikasiRow()],
    )
    queueSuccessfulTransaction()

    const body = validArchiveBody() as Record<string, unknown>
    delete body.retensi_aktif
    delete body.retensi_inaktif
    delete body.masa_aktif_berakhir
    delete body.masa_inaktif_berakhir

    const response = await postHandler({
      request: createPostRequest(body),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      message: 'Dokumen berhasil diklasifikasikan',
    })
    expect(mocks.txInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({ retensiAktif: expect.anything() }))
    expect(mocks.txInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({ retensiInaktif: expect.anything() }))
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })

  it('reuses an existing OPEN berkas and attaches the workflow item', async () => {
    queueSelectResults(
      [dokumenRow()],
      [klasifikasiRow()],
    )
    queueSuccessfulTransaction({
      txSelectResults: [
        [openBerkasRow()],
        [openBerkasRow()],
        [workflowSourceRow()],
      ],
    })

    const response = await postHandler({
      request: createPostRequest(validArchiveBody()),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(200)
    expect(mocks.txInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({
      statusBerkas: 'OPEN',
    }))
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(1, expect.objectContaining({
      berkasId: BERKAS_ID,
      sourceType: 'WORKFLOW',
      dokumenId: DOCUMENT_ID,
    }))
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({
      berkasId: BERKAS_ID,
      eventType: 'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN',
      sourceType: 'WORKFLOW',
      workflowDocumentId: DOCUMENT_ID,
    }))
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })

  it('rejects workflow classification when the selected jenis pembayaran already has a CLOSED berkas', async () => {
    queueSelectResults(
      [dokumenRow()],
      [klasifikasiRow()],
    )
    queueSuccessfulTransaction({
      txSelectResults: [
        [closedBerkasRow()],
      ],
    })

    const response = await postHandler({
      request: createPostRequest(validArchiveBody()),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Berkas untuk Jenis Pembayaran ini sudah ditutup',
    })
    expect(mocks.txInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({
      statusBerkas: 'OPEN',
    }))
    expect(mocks.txInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({ statusArsip: 'AKTIF' }))
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })

  it('maps duplicate berkas item assignment to a safe conflict response', async () => {
    queueSelectResults(
      [dokumenRow()],
      [klasifikasiRow()],
    )
    queueSuccessfulTransaction({
      txInsertReturningByCall: {
        3: Object.assign(new Error('unique conflict'), { code: '23505' }),
      },
    })

    const response = await postHandler({
      request: createPostRequest(validArchiveBody()),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Dokumen sudah terhubung ke berkas' })
    expect(mocks.txInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({ statusArsip: 'AKTIF' }))
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })

  it('rejects missing klasifikasi_id before DB writes', async () => {
    const body = validArchiveBody() as Record<string, unknown>
    delete body.klasifikasi_id

    const response = await postHandler({
      request: createPostRequest(body),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Jenis pembayaran wajib dipilih' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects inactive or missing classification without inserting berkas items', async () => {
    queueSelectResults(
      [dokumenRow()],
      [],
    )

    const response = await postHandler({
      request: createPostRequest(validArchiveBody()),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Jenis pembayaran tidak ditemukan' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects ARCHIVED documents with already-archived copy before archive writes', async () => {
    queueSelectResults([dokumenRow({ status: 'ARCHIVED' })])

    const response = await postHandler({
      request: createPostRequest(validArchiveBody()),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Dokumen sudah diarsipkan' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })

  it('rejects non-COMPLETED non-ARCHIVED documents with safe not-final copy', async () => {
    queueSelectResults([dokumenRow({ status: 'IN_PPK_VALIDATION' })])

    const response = await postHandler({
      request: createPostRequest(validArchiveBody()),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Dokumen belum berada di tahap final' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })

  it('keeps ADMIN-only users out of workflow archive writes', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['ADMIN']))

    const response = await postHandler({
      request: createPostRequest(validArchiveBody()),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })
})

function createSession(roles: string[]) {
  return {
    user: {
      id: SESSION_USER_ID,
      email: 'kasubag@example.test',
    },
    userId: SESSION_USER_ID,
    email: 'kasubag@example.test',
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function validArchiveBody() {
  return {
    nomor_surat: 'B-123',
    klasifikasi_id: KLASIFIKASI_ID,
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    masa_aktif_berakhir: '2027-05-01',
    masa_inaktif_berakhir: '2030-05-01',
    catatan_arsiparis: 'Siap diarsipkan',
  }
}

function createPostRequest(body: Record<string, unknown>, origin = 'http://localhost') {
  return new Request(`http://localhost/api/arsiparis/dokumen/${DOCUMENT_ID}/archive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  })
}

function dokumenRow(overrides: Partial<{
  judul: string | null
  status: string
  jenis_dokumen_nama: string | null
  kegiatan_nama: string | null
  nominal_realisasi: string | null
  lampiran_urls: unknown
}> = {}) {
  return {
    id: DOCUMENT_ID,
    judul: overrides.judul ?? 'Realisasi Triwulan I',
    status: overrides.status ?? 'COMPLETED',
    jenis_dokumen_nama: overrides.jenis_dokumen_nama ?? 'Laporan Kinerja',
    kegiatan_nama: overrides.kegiatan_nama ?? 'Penyusunan Publikasi',
    nominal_realisasi: overrides.nominal_realisasi ?? '1500000.00',
    lampiran_urls: overrides.lampiran_urls ?? [{
      kelengkapan_id: 'lampiran-1',
      nama: 'Bukti',
      url: 'formal/path.pdf',
    }],
  }
}

function klasifikasiRow() {
  return {
    id: KLASIFIKASI_ID,
    kode: 'KA.01',
    nama: 'Keuangan',
  }
}

function queueSelectResults(...results: unknown[][]) {
  const queue = [...results]
  mocks.dbSelect.mockImplementation(() => createSelectBuilder(queue.shift() ?? []))
}

function createSelectBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.leftJoin = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn(async () => result)
  query.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => {
    return Promise.resolve(result).then(resolve, reject)
  }

  return query
}

function queueSuccessfulTransaction(options: {
  txSelectResults?: unknown[][]
  txInsertReturningByCall?: Record<number, unknown>
} = {}) {
  mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
    let txInsertCall = 0
    const txSelectResults = [...(options.txSelectResults ?? [
      [],
      [],
      [klasifikasiRow()],
      [openBerkasRow()],
      [workflowSourceRow()],
    ])]

    const tx = {
      select: mocks.txSelect.mockImplementation(() => createSelectBuilder(txSelectResults.shift() ?? [])),
      insert: mocks.txInsert.mockImplementation(() => ({
        values: (value: Record<string, unknown>) => {
          mocks.txInsertValues(value)
          txInsertCall += 1

          return {
            returning: async () => {
              mocks.txInsertReturning()
              const override = options.txInsertReturningByCall?.[txInsertCall]
              if (override instanceof Error) throw override
              if (override) return override

              if (value.statusBerkas === 'OPEN') return [openBerkasRow()]
              if (value.sourceType === 'WORKFLOW') return [berkasItemRow()]
              return []
            },
          }
        },
      })),
      update: mocks.txUpdate.mockReturnValue({
        set: mocks.txUpdateSet.mockReturnValue({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: DOCUMENT_ID }]),
          })),
        }),
      }),
    }

    return operation(tx)
  })
}

function openBerkasRow() {
  return {
    id: BERKAS_ID,
    klasifikasiId: KLASIFIKASI_ID,
    klasifikasiKodeSnapshot: 'KA.01',
    klasifikasiNamaSnapshot: 'Keuangan',
    statusBerkas: 'OPEN',
    statusArsip: null,
    nomorSpm: null,
    retensiAktif: null,
    retensiInaktif: null,
    masaAktifBerakhir: null,
    masaInaktifBerakhir: null,
    closedAt: null,
    closedBy: null,
    createdBy: SESSION_USER_ID,
  }
}

function closedBerkasRow() {
  return {
    ...openBerkasRow(),
    statusBerkas: 'CLOSED',
    statusArsip: 'AKTIF',
    nomorSpm: 'SPM-001/2026',
    retensiAktif: '1 Tahun',
    retensiInaktif: '3 Tahun',
    masaAktifBerakhir: '2027-05-29',
    masaInaktifBerakhir: '2030-05-29',
    closedAt: new Date('2026-05-29T00:00:00.000Z'),
    closedBy: SESSION_USER_ID,
  }
}

function workflowSourceRow() {
  return {
    id: DOCUMENT_ID,
    klasifikasiId: KLASIFIKASI_ID,
  }
}

function berkasItemRow() {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    berkasId: BERKAS_ID,
    sourceType: 'WORKFLOW',
    dokumenId: DOCUMENT_ID,
    manualArsipId: null,
    addedBy: SESSION_USER_ID,
  }
}
