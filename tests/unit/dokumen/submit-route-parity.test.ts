import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const FUNGSI_ID = '22222222-2222-4222-8222-222222222222'
const KEGIATAN_ID = '33333333-3333-4333-8333-333333333333'
const JENIS_DOKUMEN_ID = '44444444-4444-4444-8444-444444444444'
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const KELENGKAPAN_ID = '66666666-6666-4666-8666-666666666666'
const MISSING_KELENGKAPAN_ID = '77777777-7777-4777-8777-777777777777'
const TARGET_UUID = '88888888-8888-4888-8888-888888888888'
const DASH_PENDING_PATH = `${OWNER_ID}/1778064971564-random123-Laporan.pdf`
const UNDERSCORE_PENDING_PATH = `${OWNER_ID}/${KELENGKAPAN_ID}_1778064971564_Laporan.pdf`
const FORMAL_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${TARGET_UUID}.pdf`

let currentKegiatanRow: { nama: string } | null
let currentJenisDokumenRow: { nama: string } | null
let currentKetuaTimAssignmentRow: { id: string } | null

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createDokumen: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getKelengkapanRequired: vi.fn(),
  getServerSession: vi.fn(),
  insertLog: vi.fn(),
  resolveLeafNodeName: vi.fn(),
  updateDokumenStatus: vi.fn(),
}))

vi.mock('#/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}))

vi.mock('#/lib/supabase-admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('#/lib/auth', () => ({
  getServerSession: mocks.getServerSession,
}))

vi.mock('#/lib/dokumen-helpers', () => ({
  createDokumen: mocks.createDokumen,
  getKelengkapanRequired: mocks.getKelengkapanRequired,
  insertLog: mocks.insertLog,
  resolveLeafNodeName: mocks.resolveLeafNodeName,
  updateDokumenStatus: mocks.updateDokumenStatus,
}))

import { Route } from '#/routes/api/dokumen/submit'

type SubmitHandler = (args: { request: Request }) => Promise<Response>

const submitHandler = (Route as unknown as {
  options: { server: { handlers: { POST: SubmitHandler } } }
}).options.server.handlers.POST

describe('/api/dokumen/submit legacy route parity', () => {
  let storageMove: ReturnType<typeof vi.fn>
  let storageFrom: ReturnType<typeof vi.fn>
  let supabaseClient: { from: ReturnType<typeof vi.fn> }
  let adminClient: { storage: { from: ReturnType<typeof vi.fn> } }

  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()

    currentKegiatanRow = { nama: 'Kegiatan Pengujian' }
    currentJenisDokumenRow = { nama: 'Dokumen Non Material' }
    currentKetuaTimAssignmentRow = { id: 'ketua-tim-assignment-id' }
    storageMove = vi.fn(async () => ({ error: null }))
    storageFrom = vi.fn(() => ({ move: storageMove }))
    supabaseClient = createSupabaseClientMock()
    adminClient = { storage: { from: storageFrom } }

    mocks.createServerSupabaseClient.mockReturnValue(supabaseClient)
    mocks.createAdminClient.mockReturnValue(adminClient)
    mocks.getServerSession.mockResolvedValue(createSession())
    mocks.getKelengkapanRequired.mockResolvedValue([])
    mocks.resolveLeafNodeName.mockResolvedValue('Detail Permintaan')
    mocks.createDokumen.mockImplementation(async (_supabase: unknown, input: Record<string, unknown>) => ({
      data: createDokumenRow(input),
      error: null,
    }))
    mocks.updateDokumenStatus.mockResolvedValue({ error: null })
    mocks.insertLog.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns 400 Invalid JSON body for missing or malformed JSON bodies', async () => {
    const missingBodyResponse = await submitHandler({
      request: new Request('http://localhost/api/dokumen/submit', {
        method: 'POST',
      }),
    })

    expect(missingBodyResponse.status).toBe(400)
    expect(await missingBodyResponse.json()).toEqual({ error: 'Invalid JSON body' })

    const malformedBodyResponse = await submitHandler({
      request: new Request('http://localhost/api/dokumen/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{',
      }),
    })

    expect(malformedBodyResponse.status).toBe(400)
    expect(await malformedBodyResponse.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns 400 Validasi gagal with details for schema validation failure', async () => {
    const response = await submitHandler({
      request: createJsonRequest({
        fungsiId: 'not-a-uuid',
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: 'Validasi gagal',
      details: {
        fieldErrors: {
          fungsiId: expect.any(Array),
        },
      },
    })
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns 400 when material nominal_realisasi is missing or invalid', async () => {
    for (const payload of [
      createValidMaterialSubmitPayload({
        nominal_realisasi: undefined,
      }),
      createValidMaterialSubmitPayload({
        nominal_realisasi: 0,
      }),
    ]) {
      const response = await submitHandler({
        request: createJsonRequest(payload),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        error: 'Nominal_realisasi wajib untuk dokumen Material',
      })
    }
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns 401 Unauthorized when the Supabase session is missing', async () => {
    mocks.getServerSession.mockResolvedValue(null)

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.getKelengkapanRequired).not.toHaveBeenCalled()
    expect(mocks.createDokumen).not.toHaveBeenCalled()
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('returns 400 when required lampiran are missing', async () => {
    mocks.getKelengkapanRequired.mockResolvedValue([
      {
        id: MISSING_KELENGKAPAN_ID,
        nama_dokumen: 'Form Permintaan',
        required: true,
      },
    ])

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Lampiran wajib belum lengkap: Form Permintaan',
    })
    expect(mocks.createDokumen).not.toHaveBeenCalled()
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('returns 400 when lampiranUrls is empty after required-lampiran validation passes', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [],
      })),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Minimal upload satu lampiran sebelum mengajukan dokumen',
    })
    expect(mocks.createDokumen).not.toHaveBeenCalled()
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('returns 400 when kegiatan is missing', async () => {
    currentKegiatanRow = null

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Kegiatan tidak ditemukan' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createDokumen).not.toHaveBeenCalled()
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('returns 403 when Ketua Tim assignment is missing', async () => {
    currentKetuaTimAssignmentRow = null

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        isKetuaTim: true,
      })),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Anda bukan Ketua Tim yang ditunjuk untuk kegiatan ini.',
    })
    expect(mocks.createDokumen).not.toHaveBeenCalled()
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('returns 500 with logical move details when Supabase Storage move fails', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(TARGET_UUID)
    storageMove.mockResolvedValueOnce({ error: { message: 'storage object missing' } })

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: DASH_PENDING_PATH })],
      })),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: `Gagal menyimpan perubahan: file "${DASH_PENDING_PATH}" gagal diproses. Silakan coba lagi.`,
      details: {
        failedPath: DASH_PENDING_PATH,
        newPath: `${OWNER_ID}/temp-id/${TARGET_UUID}.pdf`,
        reason: 'storage object missing',
      },
    })
    expect(storageFrom).toHaveBeenCalledWith('dokumen-lampiran')
    expect(storageMove).toHaveBeenCalledWith(
      DASH_PENDING_PATH,
      `${OWNER_ID}/temp-id/${TARGET_UUID}.pdf`,
    )
    expect(mocks.createDokumen).not.toHaveBeenCalled()
  })

  it('returns 500 when createDokumen fails', async () => {
    mocks.createDokumen.mockResolvedValue({
      data: null,
      error: 'Gagal membuat dokumen',
    })

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Gagal membuat dokumen' })
    expect(mocks.updateDokumenStatus).not.toHaveBeenCalled()
    expect(mocks.insertLog).not.toHaveBeenCalled()
  })

  it('returns 500 when updateDokumenStatus fails', async () => {
    mocks.updateDokumenStatus.mockResolvedValue({
      error: 'Gagal memperbarui status',
    })

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Gagal memperbarui status' })
    expect(mocks.insertLog).not.toHaveBeenCalled()
  })

  it('returns 201 for material success with IN_PPK_VALIDATION parity fields', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      success: true,
      dokumen: {
        id: DOKUMEN_ID,
        status: 'IN_PPK_VALIDATION',
        current_step: 'PPK',
        revision_target: null,
      },
    })
    expect(mocks.updateDokumenStatus).toHaveBeenCalledWith(adminClient, DOKUMEN_ID, {
      status: 'IN_PPK_VALIDATION',
      currentStep: 'PPK',
      revisionTarget: null,
    })
    expect(mocks.insertLog).toHaveBeenCalledWith(adminClient, {
      dokumenId: DOKUMEN_ID,
      userId: OWNER_ID,
      aksi: 'SUBMIT',
      stepUrutan: 1,
    })
  })

  it('returns 201 for non-material success with TERSIMPAN parity fields', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidNonMaterialSubmitPayload()),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      success: true,
      dokumen: {
        id: DOKUMEN_ID,
        status: 'TERSIMPAN',
        current_step: null,
        revision_target: null,
      },
    })
    expect(mocks.resolveLeafNodeName).not.toHaveBeenCalled()
    expect(mocks.insertLog).toHaveBeenCalledWith(adminClient, {
      dokumenId: DOKUMEN_ID,
      userId: OWNER_ID,
      aksi: 'STORE',
      stepUrutan: 1,
    })
  })

  it('does not move underscore pending paths in the current legacy submit route', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
      })),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.dokumen.lampiran_urls).toEqual([
      createLampiran({ url: UNDERSCORE_PENDING_PATH }),
    ])
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('does not move already formal paths in the current legacy submit route', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
      })),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.dokumen.lampiran_urls).toEqual([
      createLampiran({ url: FORMAL_PATH }),
    ])
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('documents that returned insertLog error objects are ignored by the route', async () => {
    mocks.insertLog.mockResolvedValue({ error: 'audit insert failed' })

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      success: true,
      dokumen: {
        status: 'IN_PPK_VALIDATION',
      },
    })
    expect(mocks.insertLog).toHaveBeenCalledTimes(1)
  })
})

function createJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/dokumen/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function createValidMaterialSubmitPayload(
  overrides: Partial<SubmitPayloadFixture> = {},
) {
  return {
    ...createBaseSubmitPayload(),
    nominal_realisasi: 100000,
    is_non_material: false,
    jenisPermintaanId: '99999999-9999-4999-8999-999999999999',
    ...overrides,
  }
}

function createValidNonMaterialSubmitPayload(
  overrides: Partial<SubmitPayloadFixture> = {},
) {
  return {
    ...createBaseSubmitPayload(),
    nominal_realisasi: null,
    is_non_material: true,
    jenisDokumenId: JENIS_DOKUMEN_ID,
    ...overrides,
  }
}

function createBaseSubmitPayload() {
  return {
    fungsiId: FUNGSI_ID,
    kegiatanJenisId: KEGIATAN_ID,
    isKetuaTim: false,
    tahun: 2024,
    tanggal: '2024-01-15',
    lampiranUrls: [createLampiran()],
  }
}

type SubmitPayloadFixture = ReturnType<typeof createBaseSubmitPayload> & {
  nominal_realisasi?: number | null
  is_non_material?: boolean
  jenisDokumenId?: string
  keteranganDetail?: string
  jenisPermintaanId?: string
  kategoriPermintaanId?: string
  detailPermintaanId?: string
}

function createLampiran(overrides: Partial<LampiranFixture> = {}): LampiranFixture {
  return {
    kelengkapan_id: KELENGKAPAN_ID,
    nama: 'Laporan',
    url: `${OWNER_ID}/safe/existing.pdf`,
    uploaded_at: '2024-01-15T00:00:00.000Z',
    ...overrides,
  }
}

type LampiranFixture = {
  kelengkapan_id: string
  nama: string
  url: string
  uploaded_at: string
}

function createSession() {
  return {
    user: {
      id: OWNER_ID,
      email: 'pegawai@example.test',
      user_metadata: {
        nama_lengkap: 'Pegawai Test',
      },
    },
  }
}

function createDokumenRow(input: Record<string, unknown>) {
  return {
    id: DOKUMEN_ID,
    judul: input.judul,
    fungsi_id: input.fungsiId,
    kegiatan_jenis_id: input.kegiatanJenisId,
    is_ketua_tim: input.isKetuaTim,
    status: 'DRAFT',
    current_step: null,
    revision_target: null,
    revision_notes: null,
    lampiran_urls: input.lampiranUrls,
    tahun: input.tahun,
    tanggal: input.tanggal,
    created_by: input.createdBy,
    nominal_realisasi: input.nominalRealisasi,
    is_non_material: input.isNonMaterial,
    jenis_dokumen_id: input.jenisDokumenId,
    keterangan_detail: input.keteranganDetail,
    jenis_permintaan_id: input.jenisPermintaanId,
    kategori_permintaan_id: input.kategoriPermintaanId,
    detail_permintaan_id: input.detailPermintaanId,
    created_at: '2024-01-15T00:00:00.000Z',
    updated_at: '2024-01-15T00:00:00.000Z',
  }
}

function createSupabaseClientMock() {
  return {
    from: vi.fn((tableName: string) => createSupabaseQueryMock(tableName)),
  }
}

function createSupabaseQueryMock(tableName: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => ({ data: dataForSingle(tableName), error: null })),
    maybeSingle: vi.fn(async () => ({ data: dataForMaybeSingle(tableName), error: null })),
  }

  return query
}

function dataForSingle(tableName: string) {
  if (tableName === 'master_kegiatan') return currentKegiatanRow
  if (tableName === 'master_jenis_dokumen') return currentJenisDokumenRow
  return null
}

function dataForMaybeSingle(tableName: string) {
  if (tableName === 'ketua_tim_assignments') return currentKetuaTimAssignmentRow
  return null
}
