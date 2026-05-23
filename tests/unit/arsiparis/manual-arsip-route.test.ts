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
  dbTransaction: vi.fn(),
  insertValues: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
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

type RouteGetHandler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>
type RoutePostHandler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>

const categoriesGetHandler = (ManualArsipCategoriesRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const indexHandlers = (ManualArsipIndexRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler; POST: RoutePostHandler } } }
}).options.server.handlers

const detailGetHandler = (ManualArsipDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const attachmentsPostHandler = (ManualArsipAttachmentsRoute as unknown as {
  options: { server: { handlers: { POST: RoutePostHandler } } }
}).options.server.handlers.POST

describe('manual arsip API foundation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
    mocks.writeManualArsipAttachmentContent.mockResolvedValue({
      logicalPath: 'manual-arsip/test-user/test-arsip/test.pdf',
      bytesWritten: 10,
    })
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

  it('allows KEPALA_SUB_BAGIAN_UMUM to upload a PDF attachment', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])
    queueTransactionInsertResult([manualArsipAttachmentRow({
      original_filename: 'lampiran.pdf',
      content_type: 'application/pdf',
      size_bytes: 10,
    })])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(10)], 'lampiran.pdf', { type: 'application/pdf' }),
      ]),
      params: { id: MANUAL_ARSIP_ID },
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.txInsertValues).toHaveBeenCalledWith([expect.objectContaining({
      manualArsipId: MANUAL_ARSIP_ID,
      originalFilename: 'lampiran.pdf',
      judulLampiran: 'lampiran.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
      createdBy: USER_ID,
    })])
    expect(JSON.stringify(body)).not.toContain('logical_path')
    expect(JSON.stringify(body)).not.toContain('logicalPath')
    expect(JSON.stringify(body)).not.toContain('storage')
    expect(JSON.stringify(body)).not.toContain('signed')
    expect(body).toEqual({
      attachments: [{
        id: '77777777-7777-4777-8777-777777777777',
        original_filename: 'lampiran.pdf',
        content_type: 'application/pdf',
        size_bytes: 10,
        created_at: '2026-05-22T00:00:00.000Z',
      }],
    })
  })

  it('allows KEPALA_SUB_BAGIAN_UMUM to upload an image attachment', async () => {
    queueSelectResults([manualArsipUploadParentRow('AKTIF')])
    queueTransactionInsertResult([manualArsipAttachmentRow({
      original_filename: 'bukti.png',
      content_type: 'image/png',
      size_bytes: 12,
    })])

    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([
        new File([new Uint8Array(12)], 'bukti.png', { type: 'image/png' }),
      ]),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      attachments: [{
        id: '77777777-7777-4777-8777-777777777777',
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
      ]),
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
      ]),
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
        ]),
        params: { id: MANUAL_ARSIP_ID },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        error: 'Lampiran hanya dapat diunggah untuk arsip manual berstatus AKTIF',
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
      ]),
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
      ]),
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
      ]),
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
      )),
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
      ]),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Ukuran file maksimal 10MB' })
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('requires at least one attachment file under the files field', async () => {
    const response = await attachmentsPostHandler({
      request: createAttachmentUploadRequest([], 'file'),
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
      ]),
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
      ], 'files', 'http://evil.test'),
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
      ]),
      params: { id: MANUAL_ARSIP_ID },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Arsip manual tidak ditemukan' })
    expect(mocks.writeManualArsipAttachmentContent).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
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

function createAttachmentUploadRequest(files: File[], fieldName = 'files', origin = 'http://localhost') {
  const formData = new FormData()
  for (const file of files) {
    formData.append(fieldName, file)
  }

  return new Request(`http://localhost/api/arsiparis/manual-arsip/${MANUAL_ARSIP_ID}/attachments`, {
    method: 'POST',
    headers: {
      Origin: origin,
    },
    body: formData,
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

function manualArsipUploadParentRow(status_arsip: string) {
  return {
    id: MANUAL_ARSIP_ID,
    status_arsip,
  }
}

function manualArsipAttachmentRow(overrides: Partial<{
  original_filename: string
  content_type: string
  size_bytes: number
}> = {}) {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    original_filename: overrides.original_filename ?? 'lampiran.pdf',
    content_type: overrides.content_type ?? 'application/pdf',
    size_bytes: overrides.size_bytes ?? 10,
    created_at: new Date('2026-05-22T00:00:00.000Z'),
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
