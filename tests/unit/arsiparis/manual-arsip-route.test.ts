import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const MANUAL_ARSIP_ID = '33333333-3333-4333-8333-333333333333'
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444'
const KLASIFIKASI_ID = '55555555-5555-4555-8555-555555555555'
const CANONICAL_ARSIP_ID = '66666666-6666-4666-8666-666666666666'
const ATTACHMENT_ID = '77777777-7777-4777-8777-777777777777'
const ATTACHMENT_LOGICAL_PATH = 'manual-arsip/test-user/test-arsip/test.pdf'
const TEST_STORAGE_ROOT = path.resolve('.tmp', 'manual-arsip-route-storage')
const TEST_FILE_CONTENT = '%PDF-1.4 manual archive test file'
const ORIGINAL_STORAGE_ROOT = process.env.DMS_LOCAL_STORAGE_ROOT

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  dbTransaction: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  txUpdate: vi.fn(),
  txUpdateSet: vi.fn(),
  txWhere: vi.fn(),
  writeManualArsipAttachmentContent: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
    update: mocks.dbUpdate,
    transaction: mocks.dbTransaction,
  },
}))

vi.mock('#/lib/storage/manual-arsip-upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/storage/manual-arsip-upload')>()

  return {
    ...actual,
    writeManualArsipAttachmentContent: mocks.writeManualArsipAttachmentContent,
  }
})

import { Route as ManualArsipCategoriesRoute } from '#/routes/api/arsiparis/manual-arsip/categories'
import { Route as ManualArsipIndexRoute } from '#/routes/api/arsiparis/manual-arsip/index'
import { Route as ManualArsipDetailRoute } from '#/routes/api/arsiparis/manual-arsip/$id'
import { Route as ManualArsipAttachmentsRoute } from '#/routes/api/arsiparis/manual-arsip/$id/attachments'
import { Route as ManualArsipAttachmentPreviewRoute } from '#/routes/api/arsiparis/manual-arsip/$id/attachments/$attachmentId/preview'
import { Route as ManualArsipAttachmentDownloadRoute } from '#/routes/api/arsiparis/manual-arsip/$id/attachments/$attachmentId/download'
import { calculateManualArchiveRetentionDates } from '#/lib/archive/retention'

type RouteGetHandler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>
type RoutePostHandler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>
type RoutePatchHandler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>

const categoriesGetHandler = (ManualArsipCategoriesRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const indexHandlers = (ManualArsipIndexRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler; POST: RoutePostHandler } } }
}).options.server.handlers

const detailHandlers = (ManualArsipDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler; PATCH: RoutePatchHandler } } }
}).options.server.handlers

const detailGetHandler = detailHandlers.GET
const detailPatchHandler = detailHandlers.PATCH

const attachmentsPostHandler = (ManualArsipAttachmentsRoute as unknown as {
  options: { server: { handlers: { POST: RoutePostHandler } } }
}).options.server.handlers.POST

const attachmentPreviewGetHandler = (ManualArsipAttachmentPreviewRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const attachmentDownloadGetHandler = (ManualArsipAttachmentDownloadRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('manual archive retention helper', () => {
  it('calculates date-only retention periods from archive date and labels', () => {
    expect(calculateManualArchiveRetentionDates({
      tanggalDiarsipkan: '2026-05-24',
      retensiAktif: '1 Tahun',
      retensiInaktif: '3 Tahun',
    })).toEqual({
      masaAktifBerakhir: '2027-05-24',
      masaInaktifBerakhir: '2030-05-24',
    })
  })

  it('uses a transitional sentinel for Permanen retention labels', () => {
    expect(calculateManualArchiveRetentionDates({
      tanggalDiarsipkan: '2026-05-24',
      retensiAktif: 'Permanen',
      retensiInaktif: '1 Tahun',
    })).toEqual({
      masaAktifBerakhir: '9999-12-31',
      masaInaktifBerakhir: '9999-12-31',
    })

    expect(calculateManualArchiveRetentionDates({
      tanggalDiarsipkan: '2026-05-24',
      retensiAktif: '1 Tahun',
      retensiInaktif: 'Permanen',
    })).toEqual({
      masaAktifBerakhir: '2027-05-24',
      masaInaktifBerakhir: '9999-12-31',
    })
  })

  it('clamps leap-day calendar-year additions to the last valid day of February', () => {
    expect(calculateManualArchiveRetentionDates({
      tanggalDiarsipkan: '2024-02-29',
      retensiAktif: '1 Tahun',
      retensiInaktif: '1 Tahun',
    })).toEqual({
      masaAktifBerakhir: '2025-02-28',
      masaInaktifBerakhir: '2026-02-28',
    })
  })

  it('rejects invalid date-only input before calculating retention dates', () => {
    expect(() => calculateManualArchiveRetentionDates({
      tanggalDiarsipkan: '2026-02-31',
      retensiAktif: '1 Tahun',
      retensiInaktif: '1 Tahun',
    })).toThrow('Tanggal arsip harus valid dengan format YYYY-MM-DD')
  })
})

describe('manual arsip API foundation routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
    mocks.writeManualArsipAttachmentContent.mockResolvedValue({
      logicalPath: ATTACHMENT_LOGICAL_PATH,
      bytesWritten: 10,
    })
    process.env.DMS_LOCAL_STORAGE_ROOT = TEST_STORAGE_ROOT
    await rm(TEST_STORAGE_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    if (ORIGINAL_STORAGE_ROOT === undefined) {
      delete process.env.DMS_LOCAL_STORAGE_ROOT
    } else {
      process.env.DMS_LOCAL_STORAGE_ROOT = ORIGINAL_STORAGE_ROOT
    }
    await rm(TEST_STORAGE_ROOT, { force: true, recursive: true })
  })

  it('requires assigned KEPALA_SUB_BAGIAN_UMUM for category list', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['PEGAWAI'], USER_ID))

    const rejected = await categoriesGetHandler({
      request: new Request('http://localhost/api/arsiparis/manual-arsip/categories'),
    })

    expect(rejected.status).toBe(403)
    expect(await rejected.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()

    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['ADMIN'], ADMIN_ID))

    const adminRejected = await categoriesGetHandler({
      request: new Request('http://localhost/api/arsiparis/manual-arsip/categories'),
    })

    expect(adminRejected.status).toBe(403)
    expect(await adminRejected.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()

    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
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

  it('allows a multi-role non-admin user with KEPALA_SUB_BAGIAN_UMUM', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(
      ['PEGAWAI', 'KEPALA_SUB_BAGIAN_UMUM'],
      USER_ID,
    ))
    queueSelectResults([{
      id: CATEGORY_ID,
      nama: 'Pemeliharaan',
      deskripsi: 'Kategori pemeliharaan',
    }])

    const response = await categoriesGetHandler({
      request: new Request('http://localhost/api/arsiparis/manual-arsip/categories'),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
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

  it('rejects unauthenticated create with 401', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await indexHandlers.POST({
      request: createPostRequest(validCreateBody()),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('rejects ADMIN-only create with 403', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['ADMIN'], ADMIN_ID))

    const response = await indexHandlers.POST({
      request: createPostRequest(validCreateBody()),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
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

  it('rejects invalid or partial final retention metadata without a 500', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...validCreateBody(), tanggal_diarsipkan: '24/05/2026' }, 'Tanggal arsip harus valid dengan format YYYY-MM-DD'],
      [{ ...validCreateBody(), tanggal_diarsipkan: '2026-05-24T00:00:00.000Z' }, 'Tanggal arsip harus valid dengan format YYYY-MM-DD'],
      [{ ...validCreateBody(), tanggal_diarsipkan: '2026-02-31' }, 'Tanggal arsip harus valid dengan format YYYY-MM-DD'],
      [{ ...validCreateBody(), tanggal_diarsipkan: '2026-05-24' }, 'Metadata retensi final harus lengkap atau dikosongkan'],
      [{ ...validCreateBody(), retensi_aktif: '1 Tahun' }, 'Metadata retensi final harus lengkap atau dikosongkan'],
    ]

    for (const [body, expectedError] of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))

      const response = await indexHandlers.POST({
        request: createPostRequest(body),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: expectedError })
      expect(mocks.dbInsert).not.toHaveBeenCalled()
    }
  })

  it('rejects missing or invalid klasifikasi_id without a 500', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [omit(validCreateBody(), 'klasifikasi_id'), 'Jenis pembayaran wajib dipilih'],
      [{ ...validCreateBody(), klasifikasi_id: null }, 'Jenis pembayaran wajib dipilih'],
      [{ ...validCreateBody(), klasifikasi_id: 'not-a-uuid' }, 'Jenis pembayaran tidak valid'],
    ]

    for (const [body, expectedError] of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))

      const response = await indexHandlers.POST({
        request: createPostRequest(body),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: expectedError })
      expect(mocks.dbInsert).not.toHaveBeenCalled()
    }
  })

  it('rejects invalid legacy retention labels without a 500', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...validCreateBody(), retensi_aktif: '2 Tahun' }, 'Retensi aktif tidak valid'],
      [{ ...validCreateBody(), retensi_inaktif: 'Selamanya' }, 'Retensi inaktif tidak valid'],
    ]

    for (const [body, expectedError] of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))

      const response = await indexHandlers.POST({
        request: createPostRequest(body),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: expectedError })
      expect(mocks.dbInsert).not.toHaveBeenCalled()
    }
  })

  it('rejects missing nominal_realisasi without a 500', async () => {
    const body = validCreateBody() as Record<string, unknown>
    delete body.nominal_realisasi

    const response = await indexHandlers.POST({
      request: createPostRequest(body),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal realisasi wajib diisi' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('rejects null nominal_realisasi without a 500', async () => {
    const response = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        nominal_realisasi: null,
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal realisasi wajib diisi' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('rejects empty nominal_realisasi without a 500', async () => {
    const response = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        nominal_realisasi: '',
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal realisasi wajib diisi' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('rejects formatted nominal_realisasi strings without a 500', async () => {
    for (const nominal_realisasi of ['Rp 1.500.000', '1.500.000']) {
      const response = await indexHandlers.POST({
        request: createPostRequest({
          ...validCreateBody(),
          nominal_realisasi,
        }),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Nominal realisasi harus berupa angka' })
      expect(mocks.dbInsert).not.toHaveBeenCalled()
    }
  })

  it('rejects decimal nominal_realisasi without a 500', async () => {
    const response = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        nominal_realisasi: 1000.5,
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal realisasi harus berupa bilangan bulat' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('rejects zero nominal_realisasi without a 500', async () => {
    const response = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        nominal_realisasi: 0,
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal realisasi harus lebih dari 0' })
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
    expect(await response.json()).toEqual({ error: 'Nominal realisasi harus lebih dari 0' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })

  it('creates transitional manual document metadata without final archive fields', async () => {
    queueSelectResults([manualCategoryRow()], [klasifikasiRow()])
    queueManualArchiveCreateTransaction({
      source: {
        ...manualArsipRow(),
        nomor_surat: null,
        tanggal_diarsipkan: null,
        retensi_aktif: null,
        retensi_inaktif: null,
        masa_aktif_berakhir: null,
        masa_inaktif_berakhir: null,
        archived_by: null,
      },
    })

    const response = await indexHandlers.POST({
      request: createPostRequest(validCreateBody()),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.dbInsert).not.toHaveBeenCalled()
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(1, expect.objectContaining({
      createdBy: USER_ID,
      archivedBy: null,
      statusArsip: 'AKTIF',
      categoryId: CATEGORY_ID,
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: '001.02',
      klasifikasiNamaSnapshot: 'Klasifikasi A',
      nomorSurat: null,
      tanggalDiarsipkan: null,
      retensiAktif: null,
      retensiInaktif: null,
      masaAktifBerakhir: null,
      masaInaktifBerakhir: null,
      nominalRealisasi: '1000',
      canonicalArsipId: null,
    }))
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sourceType: 'MANUAL',
      dokumenId: null,
      namaArsip: 'Arsip manual uji',
      nomorSurat: null,
      klasifikasiId: KLASIFIKASI_ID,
      retensiAktif: null,
      retensiInaktif: null,
      masaAktifBerakhir: null,
      masaInaktifBerakhir: null,
      archivedAt: null,
      archivedBy: null,
      createdBy: USER_ID,
      nominalRealisasi: '1000.00',
      statusArsip: 'AKTIF',
    }))
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      canonicalArsipId: CANONICAL_ARSIP_ID,
    }))
    expect(JSON.stringify(body)).not.toContain('logical_path')
    expect(JSON.stringify(body)).not.toContain('logicalPath')
    expect(JSON.stringify(body)).not.toContain('file_url')
    expect(JSON.stringify(body)).not.toContain('storage_root')
    expect(JSON.stringify(body)).not.toContain('token')
    expect(JSON.stringify(body)).not.toContain('sql')
    expect(JSON.stringify(body)).not.toContain('env')
    expect(JSON.stringify(body.manual_arsip.attachments)).toBe('[]')
  })

  it('creates with Permanen retention using the transitional sentinel dates', async () => {
    queueSelectResults([manualCategoryRow()], [klasifikasiRow()])
    queueManualArchiveCreateTransaction()

    const response = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        tanggal_diarsipkan: '2026-05-24',
        retensi_aktif: 'Permanen',
        retensi_inaktif: '1 Tahun',
      }),
    })

    expect(response.status).toBe(201)
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(1, expect.objectContaining({
      retensiAktif: 'Permanen',
      retensiInaktif: '1 Tahun',
      masaAktifBerakhir: '9999-12-31',
      masaInaktifBerakhir: '9999-12-31',
    }))
  })

  it('creates a canonical MANUAL row from the inserted source row in the same transaction', async () => {
    queueSelectResults([manualCategoryRow()], [klasifikasiRow()])
    queueManualArchiveCreateTransaction({
      source: manualArsipRow({
        nama: 'Canonical source row',
        nomor_surat: 'B-099/2026',
        tanggal_diarsipkan: '2026-06-02',
        klasifikasi_kode_snapshot: '001.02',
        klasifikasi_nama_snapshot: 'Klasifikasi A',
        retensi_aktif: '5 Tahun',
        retensi_inaktif: '10 Tahun',
        masa_aktif_berakhir: '2031-06-02',
        masa_inaktif_berakhir: '2041-06-02',
        nominal_realisasi: '250000.00',
      }),
    })

    const response = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        nama: 'Canonical source row',
        nomor_surat: 'B-099/2026',
        tanggal_diarsipkan: '2026-06-02',
        retensi_aktif: '5 Tahun',
        retensi_inaktif: '10 Tahun',
        nominal_realisasi: 250000,
      }),
    })

    expect(response.status).toBe(201)
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.txInsertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sourceType: 'MANUAL',
      dokumenId: null,
      namaArsip: 'Canonical source row',
      nomorSurat: 'B-099/2026',
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: '001.02',
      klasifikasiNamaSnapshot: 'Klasifikasi A',
      retensiAktif: '5 Tahun',
      retensiInaktif: '10 Tahun',
      masaAktifBerakhir: '2031-06-02',
      masaInaktifBerakhir: '2041-06-02',
      archivedAt: new Date('2026-06-02T00:00:00.000Z'),
      archivedBy: USER_ID,
      createdBy: USER_ID,
      nominalRealisasi: '250000.00',
      statusArsip: 'AKTIF',
      metadata: {},
    }))
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      canonicalArsipId: CANONICAL_ARSIP_ID,
    }))
  })

  it('surfaces a safe create failure when canonical MANUAL insert fails inside the transaction', async () => {
    queueSelectResults([manualCategoryRow()], [klasifikasiRow()])
    queueManualArchiveCreateTransaction({
      canonicalError: new Error('CANONICAL_INSERT_FAILED'),
    })

    const response = await indexHandlers.POST({
      request: createPostRequest(validCreateBody()),
    })
    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(500)
    expect(body).toBe('{"error":"Gagal membuat dokumen manual"}')
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.txInsertValues).toHaveBeenCalledTimes(2)
    expect(mocks.txUpdateSet).not.toHaveBeenCalled()
    expect(body).not.toContain('logical_path')
    expect(body).not.toContain('logicalPath')
    expect(body).not.toContain('physical')
    expect(body).not.toContain('storage')
    expect(body).not.toContain('token')
    expect(body).not.toContain('sql')
    expect(body).not.toContain('env')
    expect(body).not.toContain('secret')
  })

  it('rejects missing active klasifikasi lookup on create', async () => {
    queueSelectResults([manualCategoryRow()], [])

    const response = await indexHandlers.POST({
      request: createPostRequest(validCreateBody()),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Jenis pembayaran tidak ditemukan' })
    expect(mocks.dbInsert).not.toHaveBeenCalled()
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

  it('rejects client-provided classification snapshots on create', async () => {
    const topLevelResponse = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        klasifikasi_kode_snapshot: 'CLIENT-CODE',
      }),
    })

    expect(topLevelResponse.status).toBe(400)
    expect(mocks.dbInsert).not.toHaveBeenCalled()

    const metadataResponse = await indexHandlers.POST({
      request: createPostRequest({
        ...validCreateBody(),
        metadata: { klasifikasi_nama_snapshot: 'Client Snapshot' },
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
        judul_lampiran: 'Bukti Kegiatan',
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
      judul_lampiran: 'Bukti Kegiatan',
      original_filename: 'lampiran.pdf',
      content_type: 'application/pdf',
      size_bytes: 10,
      created_at: '2026-05-22T00:00:00.000Z',
    }])
  })

  it('rejects unauthenticated manual archive metadata PATCH with 401', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('rejects ADMIN-only manual archive metadata PATCH with 403', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['ADMIN'], ADMIN_ID))

    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('rejects non-Kasubag manual archive metadata PATCH with 403', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['PEGAWAI'], USER_ID))

    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('returns safe 404 for invalid manual archive PATCH id', async () => {
    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: 'not-a-uuid' },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Dokumen manual tidak ditemukan' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('returns safe 404 for missing manual archive metadata PATCH target', async () => {
    queueSelectResults([])

    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Dokumen manual tidak ditemukan' })
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('updates AKTIF manual archive parent metadata and safe snapshots', async () => {
    const updateBody = {
      ...validCreateBody(),
      nama: 'Arsip manual diperbarui',
      tanggal: '2026-05-24',
      nomor_surat: 'B-002/2026',
      tanggal_diarsipkan: '2026-06-01',
      retensi_aktif: '5 Tahun',
      retensi_inaktif: '10 Tahun',
      keterangan: 'Keterangan diperbarui',
      metadata: { sumber: 'patch' },
    }

    queueSelectResults(
      [manualArsipEditParentRow('AKTIF')],
      [manualCategoryRow()],
      [klasifikasiRow()],
    )
    queueUpdateResult([manualArsipRow({
      nama: updateBody.nama,
      tanggal: updateBody.tanggal,
      keterangan: updateBody.keterangan,
      metadata: updateBody.metadata,
      updated_at: new Date('2026-05-24T00:00:00.000Z'),
    })])

    const response = await detailPatchHandler({
      request: createPatchRequest(updateBody),
      params: { id: MANUAL_ARSIP_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      nama: 'Arsip manual diperbarui',
      tanggal: '2026-05-24',
      keterangan: 'Keterangan diperbarui',
      categoryId: CATEGORY_ID,
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: '001.02',
      klasifikasiNamaSnapshot: 'Klasifikasi A',
      nomorSurat: 'B-002/2026',
      tanggalDiarsipkan: '2026-06-01',
      retensiAktif: '5 Tahun',
      retensiInaktif: '10 Tahun',
      masaAktifBerakhir: '2031-06-01',
      masaInaktifBerakhir: '2041-06-01',
      nominalRealisasi: '1000',
      metadata: { sumber: 'patch' },
      updatedAt: expect.any(Date),
    }))
    expect(mocks.updateSet).not.toHaveBeenCalledWith(expect.objectContaining({
      statusArsip: expect.anything(),
      createdBy: expect.anything(),
      archivedBy: expect.anything(),
      canonicalArsipId: expect.anything(),
    }))
    expect(mocks.txInsert).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    expect(body.manual_arsip).toEqual({
      id: MANUAL_ARSIP_ID,
      nama: 'Arsip manual diperbarui',
      tanggal: '2026-05-24',
      keterangan: 'Keterangan diperbarui',
      nominal_realisasi: 1000,
      status_arsip: 'AKTIF',
      category: {
        id: CATEGORY_ID,
        nama: 'Pemeliharaan',
        deskripsi: null,
      },
      klasifikasi: {
        id: KLASIFIKASI_ID,
        nama: 'Klasifikasi A',
        nama_snapshot: 'Klasifikasi A',
      },
      metadata: { sumber: 'patch' },
      created_by: USER_ID,
      created_at: '2026-05-22T00:00:00.000Z',
      updated_at: '2026-05-24T00:00:00.000Z',
    })
  })

  it('syncs AKTIF linked manual archive PATCH to the canonical MANUAL row in one transaction', async () => {
    const updateBody = {
      ...validCreateBody(),
      nama: 'Arsip manual linked diperbarui',
      tanggal: '2026-05-25',
      nomor_surat: 'B-010/2026',
      tanggal_diarsipkan: '2026-06-02',
      retensi_aktif: '5 Tahun',
      retensi_inaktif: '10 Tahun',
      keterangan: 'Keterangan linked diperbarui',
      nominal_realisasi: 250000,
      metadata: { sumber: 'linked-patch' },
    }

    queueSelectResults(
      [manualArsipEditParentRow('AKTIF', { canonical_arsip_id: CANONICAL_ARSIP_ID })],
      [manualCategoryRow()],
      [klasifikasiRow()],
    )
    queueManualArchivePatchTransaction({
      source: manualArsipRow({
        nama: updateBody.nama,
        tanggal: updateBody.tanggal,
        nomor_surat: updateBody.nomor_surat,
        tanggal_diarsipkan: updateBody.tanggal_diarsipkan,
        keterangan: updateBody.keterangan,
        nominal_realisasi: '250000.00',
        klasifikasi_kode_snapshot: '001.02',
        klasifikasi_nama_snapshot: 'Klasifikasi A',
        retensi_aktif: '5 Tahun',
        retensi_inaktif: '10 Tahun',
        masa_aktif_berakhir: '2031-06-02',
        masa_inaktif_berakhir: '2041-06-02',
        archived_by: ADMIN_ID,
        canonical_arsip_id: CANONICAL_ARSIP_ID,
        metadata: updateBody.metadata,
        created_by: ADMIN_ID,
        updated_at: new Date('2026-05-24T00:00:00.000Z'),
      }),
    })

    const response = await detailPatchHandler({
      request: createPatchRequest(updateBody),
      params: { id: MANUAL_ARSIP_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
    expect(mocks.txInsert).not.toHaveBeenCalled()
    expect(mocks.txUpdate).toHaveBeenCalledTimes(2)
    expect(mocks.txUpdate.mock.calls[1][0]).toEqual(expect.objectContaining({
      id: expect.anything(),
      sourceType: expect.anything(),
    }))
    expect(mocks.txWhere).toHaveBeenCalledTimes(2)
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(1, expect.objectContaining({
      nama: 'Arsip manual linked diperbarui',
      tanggal: '2026-05-25',
      keterangan: 'Keterangan linked diperbarui',
      categoryId: CATEGORY_ID,
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: '001.02',
      klasifikasiNamaSnapshot: 'Klasifikasi A',
      nomorSurat: 'B-010/2026',
      tanggalDiarsipkan: '2026-06-02',
      retensiAktif: '5 Tahun',
      retensiInaktif: '10 Tahun',
      masaAktifBerakhir: '2031-06-02',
      masaInaktifBerakhir: '2041-06-02',
      nominalRealisasi: '250000',
      metadata: { sumber: 'linked-patch' },
      updatedAt: expect.any(Date),
    }))
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(2, expect.objectContaining({
      namaArsip: 'Arsip manual linked diperbarui',
      nomorSurat: 'B-010/2026',
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: '001.02',
      klasifikasiNamaSnapshot: 'Klasifikasi A',
      retensiAktif: '5 Tahun',
      retensiInaktif: '10 Tahun',
      masaAktifBerakhir: '2031-06-02',
      masaInaktifBerakhir: '2041-06-02',
      archivedAt: new Date('2026-06-02T00:00:00.000Z'),
      archivedBy: ADMIN_ID,
      createdBy: ADMIN_ID,
      nominalRealisasi: '250000.00',
      statusArsip: 'AKTIF',
      metadata: {},
      updatedAt: expect.any(Date),
    }))
    expect(mocks.txUpdateSet).not.toHaveBeenNthCalledWith(1, expect.objectContaining({
      statusArsip: expect.anything(),
      createdBy: expect.anything(),
      archivedBy: expect.anything(),
      canonicalArsipId: expect.anything(),
    }))
    expect(body.manual_arsip).toMatchObject({
      id: MANUAL_ARSIP_ID,
      nama: 'Arsip manual linked diperbarui',
      nominal_realisasi: 250000,
      status_arsip: 'AKTIF',
      metadata: { sumber: 'linked-patch' },
      created_by: ADMIN_ID,
    })
  })

  it('fails safely when linked canonical MANUAL update affects no row', async () => {
    queueSelectResults(
      [manualArsipEditParentRow('AKTIF', { canonical_arsip_id: CANONICAL_ARSIP_ID })],
      [manualCategoryRow()],
      [klasifikasiRow()],
    )
    queueManualArchivePatchTransaction({
      canonical: null,
    })

    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: MANUAL_ARSIP_ID },
    })
    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(500)
    expect(body).toBe('{"error":"Gagal memperbarui dokumen manual"}')
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.txUpdateSet).toHaveBeenCalledTimes(2)
    expect(body).not.toContain('logical_path')
    expect(body).not.toContain('logicalPath')
    expect(body).not.toContain('physical')
    expect(body).not.toContain('storage')
    expect(body).not.toContain('token')
    expect(body).not.toContain('sql')
    expect(body).not.toContain('env')
    expect(body).not.toContain('secret')
  })

  it('rejects manual archive metadata PATCH for non-AKTIF statuses with 409', async () => {
    for (const status_arsip of ['INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN']) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
      queueSelectResults([manualArsipEditParentRow(status_arsip)])

      const response = await detailPatchHandler({
        request: createPatchRequest(validCreateBody()),
        params: { id: MANUAL_ARSIP_ID },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        error: 'Dokumen manual hanya dapat diedit saat status AKTIF',
      })
      expect(mocks.dbUpdate).not.toHaveBeenCalled()
    }
  })

  it('rejects missing required metadata fields on manual archive PATCH', async () => {
    const body = validCreateBody() as Record<string, unknown>
    delete body.nama

    queueSelectResults([manualArsipEditParentRow('AKTIF')])

    const response = await detailPatchHandler({
      request: createPatchRequest(body),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: expect.any(String) })
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('rejects invalid date-only values on manual archive PATCH', async () => {
    for (const tanggal of ['24/05/2026', '2026-05-24T00:00:00.000Z']) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
      queueSelectResults([manualArsipEditParentRow('AKTIF')])

      const response = await detailPatchHandler({
        request: createPatchRequest({
          ...validCreateBody(),
          tanggal,
        }),
        params: { id: MANUAL_ARSIP_ID },
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Tanggal harus valid dengan format YYYY-MM-DD' })
      expect(mocks.dbUpdate).not.toHaveBeenCalled()
    }
  })

  it('rejects invalid or partial final metadata fields on manual archive PATCH', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...validCreateBody(), tanggal_diarsipkan: '2026-05-24T00:00:00.000Z' }, 'Tanggal arsip harus valid dengan format YYYY-MM-DD'],
      [{ ...validCreateBody(), tanggal_diarsipkan: '2026-05-24' }, 'Metadata retensi final harus lengkap atau dikosongkan'],
      [{ ...validCreateBody(), retensi_aktif: '1 Tahun' }, 'Metadata retensi final harus lengkap atau dikosongkan'],
      [omit(validCreateBody(), 'klasifikasi_id'), 'Jenis pembayaran wajib dipilih'],
      [{ ...validCreateBody(), klasifikasi_id: 'not-a-uuid' }, 'Jenis pembayaran tidak valid'],
      [{ ...validCreateBody(), retensi_inaktif: '2 Tahun' }, 'Retensi inaktif tidak valid'],
    ]

    for (const [body, expectedError] of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
      queueSelectResults([manualArsipEditParentRow('AKTIF')])

      const response = await detailPatchHandler({
        request: createPatchRequest(body),
        params: { id: MANUAL_ARSIP_ID },
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: expectedError })
      expect(mocks.dbUpdate).not.toHaveBeenCalled()
    }
  })

  it('rejects invalid nominal_realisasi values on manual archive PATCH', async () => {
    const cases: Array<[unknown, string]> = [
      [undefined, 'Nominal realisasi wajib diisi'],
      [null, 'Nominal realisasi wajib diisi'],
      ['', 'Nominal realisasi wajib diisi'],
      [0, 'Nominal realisasi harus lebih dari 0'],
      [-1, 'Nominal realisasi harus lebih dari 0'],
      [1000.5, 'Nominal realisasi harus berupa bilangan bulat'],
      ['Rp 1.500.000', 'Nominal realisasi harus berupa angka'],
      ['1.500.000', 'Nominal realisasi harus berupa angka'],
    ]

    for (const [nominal_realisasi, expectedError] of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
      const body = validCreateBody() as Record<string, unknown>
      if (nominal_realisasi === undefined) {
        delete body.nominal_realisasi
      } else {
        body.nominal_realisasi = nominal_realisasi
      }
      queueSelectResults([manualArsipEditParentRow('AKTIF')])

      const response = await detailPatchHandler({
        request: createPatchRequest(body),
        params: { id: MANUAL_ARSIP_ID },
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: expectedError })
      expect(mocks.dbUpdate).not.toHaveBeenCalled()
    }
  })

  it('rejects invalid category on manual archive PATCH', async () => {
    queueSelectResults(
      [manualArsipEditParentRow('AKTIF')],
      [],
    )

    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Kategori dokumen tidak ditemukan' })
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('rejects invalid klasifikasi on manual archive PATCH', async () => {
    queueSelectResults(
      [manualArsipEditParentRow('AKTIF')],
      [manualCategoryRow()],
      [],
    )

    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Jenis pembayaran tidak ditemukan' })
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })

  it('does not expose file access or sensitive fields in manual archive PATCH response', async () => {
    queueSelectResults(
      [manualArsipEditParentRow('AKTIF')],
      [manualCategoryRow()],
      [klasifikasiRow()],
    )
    queueUpdateResult([{
      ...manualArsipRow(),
      logical_path: 'must-not-leak.pdf',
      physical_path: 'C:\\storage\\must-not-leak.pdf',
      storage_root: TEST_STORAGE_ROOT,
      token: 'secret-token',
      sql: 'select * from secret',
    }])

    const response = await detailPatchHandler({
      request: createPatchRequest(validCreateBody()),
      params: { id: MANUAL_ARSIP_ID },
    })
    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(200)
    expect(body).not.toContain('logical_path')
    expect(body).not.toContain('logicalPath')
    expect(body).not.toContain('physical_path')
    expect(body).not.toContain('storage_root')
    expect(body).not.toContain(TEST_STORAGE_ROOT)
    expect(body).not.toContain('token')
    expect(body).not.toContain('sql')
    expect(body).not.toContain('env')
    expect(body).not.toContain('secret')
  })

  it('allows KEPALA_SUB_BAGIAN_UMUM to upload a PDF attachment with a matching title', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])
    queueTransactionInsertResult([manualArsipAttachmentRow({
      judul_lampiran: 'Bukti Kegiatan',
      original_filename: 'lampiran.pdf',
      content_type: 'application/pdf',
      size_bytes: 10,
    })])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], [' Bukti Kegiatan ']),
      params: { id: MANUAL_ARSIP_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.txInsertValues).toHaveBeenCalledWith([expect.objectContaining({
      manualArsipId: MANUAL_ARSIP_ID,
      originalFilename: 'lampiran.pdf',
      judulLampiran: 'Bukti Kegiatan',
      contentType: 'application/pdf',
      sizeBytes: 10,
      createdBy: USER_ID,
    })])
    expect(JSON.stringify(body)).not.toContain('logical_path')
    expect(JSON.stringify(body)).not.toContain('logicalPath')
    expect(JSON.stringify(body)).not.toContain('storage')
    expect(JSON.stringify(body)).not.toContain('signed')
    expect(JSON.stringify(body)).not.toContain('token')
    expect(JSON.stringify(body)).not.toContain('SQL')
    expect(JSON.stringify(body)).not.toContain('env')
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(body).toEqual({
      attachments: [{
        id: '77777777-7777-4777-8777-777777777777',
        judul_lampiran: 'Bukti Kegiatan',
        original_filename: 'lampiran.pdf',
        content_type: 'application/pdf',
        size_bytes: 10,
        created_at: '2026-05-22T00:00:00.000Z',
      }],
    })
  })

  it('allows KEPALA_SUB_BAGIAN_UMUM to upload an image attachment with a matching title', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])
    queueTransactionInsertResult([manualArsipAttachmentRow({
      judul_lampiran: 'Foto Bukti',
      original_filename: 'bukti.png',
      content_type: 'image/png',
      size_bytes: 12,
    })])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(12)], 'bukti.png', { type: 'image/png' }),
      ], ['Foto Bukti']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      attachments: [{
        id: '77777777-7777-4777-8777-777777777777',
        judul_lampiran: 'Foto Bukti',
        original_filename: 'bukti.png',
        content_type: 'image/png',
        size_bytes: 12,
        created_at: '2026-05-22T00:00:00.000Z',
      }],
    })
  })

  it('rejects ADMIN-only attachment upload with 403', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['ADMIN'], ADMIN_ID))

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], ['Lampiran Admin']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('rejects non-Kasubag attachment upload with 403', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['PEGAWAI'], USER_ID))

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], ['Lampiran Pegawai']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('rejects attachment upload for non-AKTIF manual archive parents', async () => {
    for (const status_arsip of ['INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN']) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
      queueSelectResults([manualArsipUploadParentRow(status_arsip)])

      const response = await attachmentsPostHandler({
        request: createAttachmentUploadRequest([
          new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
        ], ['Lampiran Nonaktif']),
        params: { id: MANUAL_ARSIP_ID },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        error: 'Lampiran hanya dapat diunggah untuk dokumen manual berstatus AKTIF',
      })
      expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    }
  })

  it('rejects unsupported attachment content type', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'script.txt', { type: 'text/plain' }),
      ], ['Lampiran Tidak Valid']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Tipe file tidak diizinkan. Gunakan PDF atau gambar.',
    })
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects SVG image attachments with the unsupported file type error', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'vector.svg', { type: 'image/svg+xml' }),
      ], ['Lampiran SVG']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Tipe file tidak diizinkan. Gunakan PDF atau gambar.',
    })
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects unknown image subtypes with the unsupported file type error', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'unknown.xyz', { type: 'image/x-unknown' }),
      ], ['Lampiran Unknown']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Tipe file tidak diizinkan. Gunakan PDF atau gambar.',
    })
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects more than five attachment files', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest(Array.from(
        { length: 6 },
        (_, index) => new File([new Uint8Array(1)], `lampiran-${index}.pdf`, { type: 'application/pdf' }),
      ), Array.from({ length: 6 }, (_, index) => `Lampiran ${index}`)),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Maksimal 5 file lampiran per unggahan' })
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects attachment files larger than 10 MB before writing content', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array((10 * 1024 * 1024) + 1)], 'besar.pdf', { type: 'application/pdf' }),
      ], ['Lampiran Besar']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Ukuran file maksimal 10MB' })
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('requires at least one attachment file under the files field', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([], [], 'file'),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Minimal satu file lampiran wajib diunggah' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated attachment upload with 401', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], ['Lampiran Tanpa Sesi']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('protects attachment upload with same-origin guard before auth/db work', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], ['Lampiran Evil'], 'files', 'http://evil.test'),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('returns 404 when uploading to a missing manual archive parent', async () => {
    queueSelectResults([])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], ['Lampiran Hilang Parent']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Dokumen manual tidak ditemukan' })
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects attachment upload when titles field is missing', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ]),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Jumlah judul lampiran harus sesuai dengan jumlah file',
    })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('rejects attachment upload with fewer titles than files', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'satu.pdf', { type: 'application/pdf' }),
        new File([new Uint8Array(10)], 'dua.pdf', { type: 'application/pdf' }),
      ], ['Judul satu']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Jumlah judul lampiran harus sesuai dengan jumlah file',
    })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('rejects attachment upload with more titles than files', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'satu.pdf', { type: 'application/pdf' }),
      ], ['Judul satu', 'Judul dua']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Jumlah judul lampiran harus sesuai dengan jumlah file',
    })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('rejects attachment upload with an empty title', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], ['']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Judul lampiran wajib diisi' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('rejects attachment upload with a whitespace-only title', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], ['   ']),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Judul lampiran wajib diisi' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('rejects attachment upload with a title longer than 120 characters', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ], ['a'.repeat(121)]),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Judul lampiran maksimal 120 karakter' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('rejects attachment upload with non-string title entries', async () => {
    const formData = new FormData()
    formData.append('files', new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }))
    formData.append('titles', new File([new Uint8Array(1)], 'judul.txt', { type: 'text/plain' }))

    const response = await attachmentsPostHandler({
      request: new Request(`http://localhost/api/arsiparis/manual-arsip/${MANUAL_ARSIP_ID}/attachments`, {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
        body: formData,
      }),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Judul lampiran wajib diisi' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
  })

  it('does not fall back from original filename to judul_lampiran', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])
    queueTransactionInsertResult([manualArsipAttachmentRow({
      judul_lampiran: 'Judul Eksplisit',
      original_filename: 'nama-file.pdf',
      content_type: 'application/pdf',
      size_bytes: 10,
    })])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'nama-file.pdf', { type: 'application/pdf' }),
      ], ['Judul Eksplisit']),
      params: { id: MANUAL_ARSIP_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.txInsertValues).toHaveBeenCalledWith([expect.objectContaining({
      originalFilename: 'nama-file.pdf',
      judulLampiran: 'Judul Eksplisit',
    })])
    expect(body.attachments[0].judul_lampiran).toBe('Judul Eksplisit')
    expect(body.attachments[0].judul_lampiran).not.toBe('nama-file.pdf')
  })

  it('allows KEPALA_SUB_BAGIAN_UMUM to preview an AKTIF attachment inline', async () => {
    await writeManualArsipAttachmentTestFile(ATTACHMENT_LOGICAL_PATH, TEST_FILE_CONTENT)
    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF')],
      [manualArsipAttachmentFileRow()],
    )

    const response = await attachmentPreviewGetHandler({
      request: createAttachmentFileRequest('preview'),
      params: attachmentFileParams(),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toBe(
      'inline; filename="Bukti_Kegiatan_Nama_Arsip_Kategori_2026-05-23.pdf"',
    )
    expect(response.headers.get('Content-Disposition')).not.toContain('token')
    expect(await response.text()).toBe(TEST_FILE_CONTENT)
  })

  it('allows KEPALA_SUB_BAGIAN_UMUM to download an AKTIF attachment', async () => {
    await writeManualArsipAttachmentTestFile(ATTACHMENT_LOGICAL_PATH, TEST_FILE_CONTENT)
    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF')],
      [manualArsipAttachmentFileRow()],
    )

    const response = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams(),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Bukti_Kegiatan_Nama_Arsip_Kategori_2026-05-23.pdf"',
    )
    expect(await response.text()).toBe(TEST_FILE_CONTENT)
  })

  it('rejects ADMIN-only preview and download with 403 before DB access', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['ADMIN'], ADMIN_ID))

    const preview = await attachmentPreviewGetHandler({
      request: createAttachmentFileRequest('preview'),
      params: attachmentFileParams(),
    })
    const download = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams(),
    })

    expect(preview.status).toBe(403)
    expect(download.status).toBe(403)
    expect(await preview.json()).toEqual({ error: 'Forbidden' })
    expect(await download.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('rejects non-Kasubag preview and download with 403 before DB access', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['PEGAWAI'], USER_ID))

    const preview = await attachmentPreviewGetHandler({
      request: createAttachmentFileRequest('preview'),
      params: attachmentFileParams(),
    })
    const download = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams(),
    })

    expect(preview.status).toBe(403)
    expect(download.status).toBe(403)
    expect(await preview.json()).toEqual({ error: 'Forbidden' })
    expect(await download.json()).toEqual({ error: 'Forbidden' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated preview and download with 401 before DB access', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const preview = await attachmentPreviewGetHandler({
      request: createAttachmentFileRequest('preview'),
      params: attachmentFileParams(),
    })
    const download = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams(),
    })

    expect(preview.status).toBe(401)
    expect(download.status).toBe(401)
    expect(await preview.json()).toEqual({ error: 'Unauthorized' })
    expect(await download.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('returns safe 404 for missing parent or wrong attachment ids', async () => {
    queueSelectResults([])

    const missingParent = await attachmentPreviewGetHandler({
      request: createAttachmentFileRequest('preview'),
      params: attachmentFileParams(),
    })

    expect(missingParent.status).toBe(404)
    expect(await missingParent.json()).toEqual({ error: 'Lampiran dokumen manual tidak ditemukan' })

    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF')],
      [],
    )

    const wrongAttachment = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams({ attachmentId: '88888888-8888-4888-8888-888888888888' }),
    })

    expect(wrongAttachment.status).toBe(404)
    expect(await wrongAttachment.json()).toEqual({ error: 'Lampiran dokumen manual tidak ditemukan' })
  })

  it('returns safe 404 when attachment does not belong to the requested parent', async () => {
    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF')],
      [],
    )

    const response = await attachmentPreviewGetHandler({
      request: createAttachmentFileRequest('preview'),
      params: attachmentFileParams({ manualArsipId: '99999999-9999-4999-8999-999999999999' }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Lampiran dokumen manual tidak ditemukan' })
  })

  it('blocks preview and download for DIMUSNAHKAN parents with 410', async () => {
    for (const handler of [attachmentPreviewGetHandler, attachmentDownloadGetHandler]) {
      queueSelectResults(
        [manualArsipUploadParentRow('DIMUSNAHKAN')],
        [manualArsipAttachmentFileRow()],
      )

      const response = await handler({
        request: createAttachmentFileRequest('preview'),
        params: attachmentFileParams(),
      })

      expect(response.status).toBe(410)
      expect(await response.json()).toEqual({
        error: 'File lampiran tidak tersedia - arsip telah dimusnahkan',
      })
    }
  })

  it('returns a safe 404 for missing attachment files without path details', async () => {
    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF')],
      [manualArsipAttachmentFileRow()],
    )

    const response = await attachmentPreviewGetHandler({
      request: createAttachmentFileRequest('preview'),
      params: attachmentFileParams(),
    })
    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(404)
    expect(body).toBe('{"error":"File lampiran tidak ditemukan"}')
    expect(body).not.toContain('manual-arsip')
    expect(body).not.toContain('test.pdf')
    expect(body).not.toContain(TEST_STORAGE_ROOT)
  })

  it('does not serve stored unsafe content types inline or as download', async () => {
    await writeManualArsipAttachmentTestFile(ATTACHMENT_LOGICAL_PATH, '<svg></svg>')

    for (const handler of [attachmentPreviewGetHandler, attachmentDownloadGetHandler]) {
      queueSelectResults(
        [manualArsipUploadParentRow('AKTIF')],
        [manualArsipAttachmentFileRow({
          content_type: 'image/svg+xml',
          original_filename: 'vector.svg',
        })],
      )

      const response = await handler({
        request: createAttachmentFileRequest('preview'),
        params: attachmentFileParams(),
      })
      const body = JSON.stringify(await response.json())

      expect(response.status).toBe(404)
      expect(body).toBe('{"error":"File lampiran tidak ditemukan"}')
      expect(response.headers.get('Content-Type')).toContain('application/json')
      expect(response.headers.get('Content-Disposition')).toBeNull()
    }
  })

  it('sanitizes unsafe filename policy segments', async () => {
    await writeManualArsipAttachmentTestFile(ATTACHMENT_LOGICAL_PATH, TEST_FILE_CONTENT)
    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF', {
        nama: 'Nama/Arsip "Rahasia"',
        category_nama: 'Kategori\r\nA: B',
      })],
      [manualArsipAttachmentFileRow({
        judul_lampiran: 'Bukti\\Kegiatan<>?',
        original_filename: 'lampiran.pdf',
      })],
    )

    const response = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams(),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Bukti_Kegiatan_Nama_Arsip_Rahasia_Kategori_A_B_2026-05-23.pdf"',
    )
  })

  it('sanitizes header injection attempts and prefers content-type extension on conflicts', async () => {
    await writeManualArsipAttachmentTestFile(ATTACHMENT_LOGICAL_PATH, TEST_FILE_CONTENT)
    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF')],
      [manualArsipAttachmentFileRow({
        judul_lampiran: 'unsafe"\r\nContent-Type: text/html',
        original_filename: 'payload.html',
      })],
    )

    const response = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams(),
    })
    const contentDisposition = response.headers.get('Content-Disposition')

    expect(response.status).toBe(200)
    expect(contentDisposition).toBe(
      'attachment; filename="unsafe_Content-Type_text_html_Nama_Arsip_Kategori_2026-05-23.pdf"',
    )
    expect(contentDisposition).not.toContain('\r')
    expect(contentDisposition).not.toContain('\n')
    expect(contentDisposition).not.toContain('"Content-Type')
    expect(contentDisposition).not.toContain('.html')
    expect(contentDisposition).not.toContain('.svg')
    expect(contentDisposition).not.toContain('.exe')
    expect(contentDisposition).not.toContain('.bat')
    expect(contentDisposition).not.toContain('manual-arsip')
    expect(contentDisposition).not.toContain('test.pdf')
    expect(contentDisposition).not.toContain(TEST_STORAGE_ROOT)
    expect(contentDisposition).not.toContain('logical_path')
    expect(contentDisposition).not.toContain('storage')
    expect(JSON.stringify([...response.headers.entries()])).not.toContain('token')
  })

  it('uses fallback segments when policy segments sanitize to empty', async () => {
    await writeManualArsipAttachmentTestFile(ATTACHMENT_LOGICAL_PATH, TEST_FILE_CONTENT)
    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF', {
        nama: '////',
        category_nama: '\r\n"',
        tanggal: 'not-a-date',
      })],
      [manualArsipAttachmentFileRow({
        judul_lampiran: '""',
        original_filename: 'photo.jpeg',
        content_type: 'image/jpeg',
      })],
    )

    const response = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams(),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Lampiran_Arsip_Kategori_Tanggal.jpeg"',
    )
  })

  it('truncates long filenames while preserving extension', async () => {
    await writeManualArsipAttachmentTestFile(ATTACHMENT_LOGICAL_PATH, TEST_FILE_CONTENT)
    queueSelectResults(
      [manualArsipUploadParentRow('AKTIF')],
      [manualArsipAttachmentFileRow({
        judul_lampiran: 'x'.repeat(220),
        original_filename: 'lampiran.pdf',
        content_type: 'application/pdf',
      })],
    )

    const response = await attachmentDownloadGetHandler({
      request: createAttachmentFileRequest('download'),
      params: attachmentFileParams(),
    })
    const contentDisposition = response.headers.get('Content-Disposition') ?? ''
    const filename = contentDisposition.match(/^attachment; filename="([^"]+)"$/)?.[1] ?? ''

    expect(response.status).toBe(200)
    expect(filename.length).toBeLessThanOrEqual(180)
    expect(filename.endsWith('.pdf')).toBe(true)
    expect(contentDisposition).not.toContain('\r')
    expect(contentDisposition).not.toContain('\n')
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

function omit(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const clone = { ...source }
  delete clone[key]
  return clone
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

function createPatchRequest(body: Record<string, unknown>, origin = 'http://localhost') {
  return new Request(`http://localhost/api/arsiparis/manual-arsip/${MANUAL_ARSIP_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  })
}

function createAttachmentUploadRequest(
  files: File[],
  titles: string[] = [],
  fieldName = 'files',
  origin = 'http://localhost',
) {
  const formData = new FormData()
  for (const file of files) {
    formData.append(fieldName, file)
  }
  for (const title of titles) {
    formData.append('titles', title)
  }

  return new Request(`http://localhost/api/arsiparis/manual-arsip/${MANUAL_ARSIP_ID}/attachments`, {
    method: 'POST',
    headers: {
      Origin: origin,
    },
    body: formData,
  })
}

function createAttachmentFileRequest(purpose: 'preview' | 'download') {
  return new Request(
    `http://localhost/api/arsiparis/manual-arsip/${MANUAL_ARSIP_ID}/attachments/${ATTACHMENT_ID}/${purpose}`,
  )
}

function attachmentFileParams(overrides: Partial<{
  manualArsipId: string
  attachmentId: string
}> = {}) {
  return {
    id: overrides.manualArsipId ?? MANUAL_ARSIP_ID,
    attachmentId: overrides.attachmentId ?? ATTACHMENT_ID,
  }
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
    kode: '001.02',
  }
}

function manualArsipRow(overrides: Partial<{
  nama: string
  tanggal: string
  nomor_surat: string | null
  tanggal_diarsipkan: string | null
  keterangan: string
  nominal_realisasi: string | number | null
  status_arsip: string
  category_id: string
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: string | null
  masa_inaktif_berakhir: string | null
  archived_by: string | null
  canonical_arsip_id: string | null
  metadata: Record<string, unknown>
  created_by: string
  created_at: Date
  updated_at: Date
}> = {}) {
  return {
    id: MANUAL_ARSIP_ID,
    nama: overrides.nama ?? 'Arsip manual uji',
    tanggal: overrides.tanggal ?? '2026-05-22',
    nomor_surat: overrides.nomor_surat ?? 'B-001/2026',
    tanggal_diarsipkan: overrides.tanggal_diarsipkan ?? '2026-05-24',
    keterangan: overrides.keterangan ?? 'Keterangan arsip manual',
    nominal_realisasi: overrides.nominal_realisasi ?? '1000.00',
    status_arsip: overrides.status_arsip ?? 'AKTIF',
    category_id: overrides.category_id ?? CATEGORY_ID,
    klasifikasi_id: overrides.klasifikasi_id ?? KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: overrides.klasifikasi_kode_snapshot ?? '001.02',
    klasifikasi_nama_snapshot: overrides.klasifikasi_nama_snapshot ?? 'Klasifikasi A',
    retensi_aktif: overrides.retensi_aktif ?? '1 Tahun',
    retensi_inaktif: overrides.retensi_inaktif ?? '3 Tahun',
    masa_aktif_berakhir: overrides.masa_aktif_berakhir ?? '2027-05-24',
    masa_inaktif_berakhir: overrides.masa_inaktif_berakhir ?? '2030-05-24',
    archived_by: overrides.archived_by ?? USER_ID,
    canonical_arsip_id: overrides.canonical_arsip_id ?? null,
    metadata: overrides.metadata ?? { sumber: 'manual' },
    created_by: overrides.created_by ?? USER_ID,
    created_at: overrides.created_at ?? new Date('2026-05-22T00:00:00.000Z'),
    updated_at: overrides.updated_at ?? new Date('2026-05-22T00:00:00.000Z'),
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

function manualArsipUploadParentRow(status_arsip: string, overrides: Partial<{
  nama: string
  tanggal: string
  category_nama: string | null
}> = {}) {
  return {
    id: MANUAL_ARSIP_ID,
    nama: overrides.nama ?? 'Nama Arsip',
    tanggal: overrides.tanggal ?? '2026-05-23',
    status_arsip,
    category_nama: overrides.category_nama ?? 'Kategori',
  }
}

function manualArsipEditParentRow(
  status_arsip: string,
  overrides: Partial<{ canonical_arsip_id: string | null }> = {},
) {
  return {
    id: MANUAL_ARSIP_ID,
    status_arsip,
    canonical_arsip_id: overrides.canonical_arsip_id ?? null,
  }
}

function manualArsipAttachmentRow(overrides: Partial<{
  judul_lampiran: string
  original_filename: string
  content_type: string
  size_bytes: number
}> = {}) {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    judul_lampiran: overrides.judul_lampiran ?? 'Bukti Kegiatan',
    original_filename: overrides.original_filename ?? 'lampiran.pdf',
    content_type: overrides.content_type ?? 'application/pdf',
    size_bytes: overrides.size_bytes ?? 10,
    created_at: new Date('2026-05-22T00:00:00.000Z'),
  }
}

function manualArsipAttachmentFileRow(overrides: Partial<{
  judul_lampiran: string
  original_filename: string
  content_type: string
  size_bytes: number
  logical_path: string
}> = {}) {
  return {
    id: ATTACHMENT_ID,
    judul_lampiran: overrides.judul_lampiran ?? 'Bukti Kegiatan',
    original_filename: overrides.original_filename ?? 'lampiran.pdf',
    content_type: overrides.content_type ?? 'application/pdf',
    size_bytes: overrides.size_bytes ?? TEST_FILE_CONTENT.length,
    logical_path: overrides.logical_path ?? ATTACHMENT_LOGICAL_PATH,
  }
}

async function writeManualArsipAttachmentTestFile(
  logicalPath: string,
  content: string,
): Promise<void> {
  const targetPath = path.join(TEST_STORAGE_ROOT, ...logicalPath.split('/'))

  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)
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

function queueUpdateResult(result: unknown[]) {
  const updateQuery: Record<string, unknown> = {}

  updateQuery.set = mocks.updateSet.mockReturnValue({
    where: vi.fn(() => ({
      returning: vi.fn(async () => result),
    })),
  })

  mocks.dbUpdate.mockReturnValue(updateQuery)
}

function queueTransactionInsertResult(result: unknown[]) {
  mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      insert: mocks.txInsert.mockReturnValue({
        values: mocks.txInsertValues.mockReturnValue({
          returning: vi.fn(async () => result),
        }),
      }),
    }

    return operation(tx)
  })
}

function queueManualArchiveCreateTransaction(options: {
  source?: ReturnType<typeof manualArsipRow>
  canonical?: { id: string } | null
  linked?: { id: string; canonical_arsip_id: string | null } | null
  canonicalError?: Error
  linkError?: Error
} = {}) {
  const insertResults = [
    [options.source ?? manualArsipRow()],
    [options.canonical ?? { id: CANONICAL_ARSIP_ID }],
  ]

  mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      insert: mocks.txInsert.mockImplementation(() => ({
        values: mocks.txInsertValues.mockImplementation(() => ({
          returning: vi.fn(async () => {
            const callNumber = mocks.txInsertValues.mock.calls.length
            if (callNumber === 2 && options.canonicalError) {
              throw options.canonicalError
            }

            return insertResults.shift() ?? []
          }),
        })),
      })),
      update: mocks.txUpdate.mockImplementation(() => ({
        set: mocks.txUpdateSet.mockImplementation(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (options.linkError) throw options.linkError

              return [options.linked ?? {
                id: MANUAL_ARSIP_ID,
                canonical_arsip_id: CANONICAL_ARSIP_ID,
              }]
            }),
          })),
        })),
      })),
    }

    return operation(tx)
  })
}

function queueManualArchivePatchTransaction(options: {
  source?: ReturnType<typeof manualArsipRow> | null
  canonical?: { id: string } | null
  sourceError?: Error
  canonicalError?: Error
} = {}) {
  const updateResults = [
    options.source === undefined
      ? [manualArsipRow({ canonical_arsip_id: CANONICAL_ARSIP_ID })]
      : options.source === null
        ? []
        : [options.source],
    options.canonical === undefined
      ? [{ id: CANONICAL_ARSIP_ID }]
      : options.canonical === null
        ? []
        : [options.canonical],
  ]

  mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      update: mocks.txUpdate.mockImplementation(() => ({
        set: mocks.txUpdateSet.mockImplementation(() => ({
          where: mocks.txWhere.mockImplementation(() => ({
            returning: vi.fn(async () => {
              const callNumber = mocks.txUpdateSet.mock.calls.length
              if (callNumber === 1 && options.sourceError) {
                throw options.sourceError
              }
              if (callNumber === 2 && options.canonicalError) {
                throw options.canonicalError
              }

              return updateResults.shift() ?? []
            }),
          })),
        })),
      })),
    }

    return operation(tx)
  })
}
