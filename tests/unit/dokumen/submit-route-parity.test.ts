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
let preflightCheckSourceExists: ReturnType<typeof vi.fn>
let preflightCheckTargetAvailable: ReturnType<typeof vi.fn>
let localSubmitAdapterCalls: unknown[]

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createDokumen: vi.fn(),
  createLiveLocalSubmitDrizzleAdapter: vi.fn(),
  createSubmitDiskPreflightChecker: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getKelengkapanRequired: vi.fn(),
  getLocalServerSession: vi.fn(),
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

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/lib/dokumen/submit-disk-preflight-checker', () => ({
  createSubmitDiskPreflightChecker: mocks.createSubmitDiskPreflightChecker,
}))

vi.mock('#/lib/dokumen/local-submit-drizzle-adapter', () => ({
  createLiveLocalSubmitDrizzleAdapter: mocks.createLiveLocalSubmitDrizzleAdapter,
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
    preflightCheckSourceExists = vi.fn(async () => true)
    preflightCheckTargetAvailable = vi.fn(async () => true)
    localSubmitAdapterCalls = []
    supabaseClient = createSupabaseClientMock()
    adminClient = { storage: { from: storageFrom } }

    mocks.createServerSupabaseClient.mockReturnValue(supabaseClient)
    mocks.createAdminClient.mockReturnValue(adminClient)
    mocks.createSubmitDiskPreflightChecker.mockReturnValue({
      checkSourceExists: preflightCheckSourceExists,
      checkTargetAvailable: preflightCheckTargetAvailable,
    })
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(
      createLocalSubmitAdapter(),
    )
    mocks.getLocalServerSession.mockResolvedValue(null)
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

  it('preserves the default legacy path when useLocalAuthDryRun is absent', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })

    expect(response.status).toBe(201)
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expect(mocks.createServerSupabaseClient).toHaveBeenCalledTimes(1)
    expect(mocks.createDokumen).toHaveBeenCalledTimes(1)
    expect(mocks.updateDokumenStatus).toHaveBeenCalledTimes(1)
    expect(mocks.insertLog).toHaveBeenCalledTimes(1)
  })

  it('returns 401 Unauthorized for local auth dry-run without a local session', async () => {
    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload(),
        'http://localhost/api/dokumen/submit?useLocalAuthDryRun=true',
      ),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.getLocalServerSession).toHaveBeenCalledTimes(1)
    expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createDokumen).not.toHaveBeenCalled()
    expect(mocks.updateDokumenStatus).not.toHaveBeenCalled()
    expect(mocks.insertLog).not.toHaveBeenCalled()
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('returns 403 for local auth dry-run when the local actor is not PEGAWAI-compatible', async () => {
    for (const localSession of [
      createLocalSession({ roles: ['ADMIN'], activeRole: 'ADMIN' }),
      createLocalSession({ roles: ['PPK'], activeRole: 'PPK' }),
    ]) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(localSession)

      const response = await submitHandler({
        request: createJsonRequest(
          createValidMaterialSubmitPayload(),
          'http://localhost/api/dokumen/submit?useLocalAuthDryRun=true',
        ),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
      expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
      expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
      expect(mocks.createAdminClient).not.toHaveBeenCalled()
      expect(mocks.createDokumen).not.toHaveBeenCalled()
      expect(mocks.updateDokumenStatus).not.toHaveBeenCalled()
      expect(mocks.insertLog).not.toHaveBeenCalled()
      expect(storageMove).not.toHaveBeenCalled()
    }
  })

  it('returns a non-success local auth dry-run response for a valid PEGAWAI session without writes or moves', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: DASH_PENDING_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalAuthDryRun=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      dryRun: true,
      boundary: 'local-auth',
      submitCompatible: true,
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      message: 'Local auth boundary validated; submit write path was not executed.',
    })
    expect(body).not.toHaveProperty('success', true)
    expect(body).not.toHaveProperty('dokumen')
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
    expect(mocks.getKelengkapanRequired).not.toHaveBeenCalled()
    expect(mocks.createDokumen).not.toHaveBeenCalled()
    expect(mocks.updateDokumenStatus).not.toHaveBeenCalled()
    expect(mocks.insertLog).not.toHaveBeenCalled()
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('does not expose sensitive values in the local auth dry-run response', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload(),
        'http://localhost/api/dokumen/submit?useLocalAuthDryRun=true',
      ),
    })
    const serializedBody = JSON.stringify(await response.json())
    const forbiddenFragments = [
      'tok' + 'en',
      'ha' + 'sh',
      'DATABASE' + '_URL',
      'DMS_LOCAL_STORAGE' + '_ROOT',
      'signed' + 'Url',
      'signed URL',
      'storage' + ' root',
      'sec' + 'ret',
      'password' + '_hash',
    ]

    for (const fragment of forbiddenFragments) {
      expect(serializedBody.toLowerCase()).not.toContain(fragment.toLowerCase())
    }
    expect(serializedBody).not.toMatch(/[A-Za-z]:\\|\\\\/)
  })

  it('returns 401 Unauthorized for local preflight dry-run without a local session', async () => {
    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload(),
        'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
      ),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.getLocalServerSession).toHaveBeenCalledTimes(1)
    expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createDokumen).not.toHaveBeenCalled()
    expect(mocks.updateDokumenStatus).not.toHaveBeenCalled()
    expect(mocks.insertLog).not.toHaveBeenCalled()
    expect(storageMove).not.toHaveBeenCalled()
  })

  it('returns 403 for local preflight dry-run when the local actor is not PEGAWAI-compatible', async () => {
    for (const localSession of [
      createLocalSession({ roles: ['ADMIN'], activeRole: 'ADMIN' }),
      createLocalSession({ roles: ['PPK'], activeRole: 'PPK' }),
    ]) {
      vi.clearAllMocks()
      mocks.createSubmitDiskPreflightChecker.mockReturnValue({
        checkSourceExists: preflightCheckSourceExists,
        checkTargetAvailable: preflightCheckTargetAvailable,
      })
      mocks.getLocalServerSession.mockResolvedValue(localSession)

      const response = await submitHandler({
        request: createJsonRequest(
          createValidMaterialSubmitPayload(),
          'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
        ),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
      expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
      expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
      expect(mocks.createAdminClient).not.toHaveBeenCalled()
      expect(mocks.createDokumen).not.toHaveBeenCalled()
      expect(mocks.updateDokumenStatus).not.toHaveBeenCalled()
      expect(mocks.insertLog).not.toHaveBeenCalled()
      expect(storageMove).not.toHaveBeenCalled()
    }
  })

  it('returns controlled 400 for local preflight dry-run when the local source is missing', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))
    preflightCheckSourceExists.mockResolvedValue(false)

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: DASH_PENDING_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      dryRun: true,
      boundary: 'local-preflight',
      submitCompatible: true,
      preflightOk: false,
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      error: 'Local submit preflight failed; submit write path was not executed.',
      issues: [
        expect.objectContaining({
          code: 'source-missing',
          clientCategory: 'local-storage-missing',
          sourceLogicalPath: DASH_PENDING_PATH,
          checkKind: 'source',
        }),
      ],
    })
    expect(body).not.toHaveProperty('success', true)
    expect(body).not.toHaveProperty('dokumen')
    expect(preflightCheckSourceExists).toHaveBeenCalledWith(DASH_PENDING_PATH)
    expect(preflightCheckTargetAvailable).not.toHaveBeenCalled()
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns controlled 400 for local preflight dry-run when the target already exists', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))
    preflightCheckTargetAvailable.mockResolvedValue(false)

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      dryRun: true,
      boundary: 'local-preflight',
      preflightOk: false,
      issues: [
        expect.objectContaining({
          code: 'target-already-exists',
          clientCategory: 'local-storage-conflict',
          sourceLogicalPath: UNDERSCORE_PENDING_PATH,
          checkKind: 'target',
        }),
      ],
    })
    expect(body.issues[0].targetLogicalPath).toEqual(expect.stringMatching(
      new RegExp(`^${OWNER_ID}/temp-id/[0-9a-f-]{36}\\.pdf$`),
    ))
    expect(preflightCheckSourceExists).toHaveBeenCalledWith(UNDERSCORE_PENDING_PATH)
    expect(preflightCheckTargetAvailable).toHaveBeenCalledTimes(1)
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns controlled 400 for local preflight dry-run when an attachment path is unsupported', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: `${OWNER_ID}/safe/existing.pdf` })],
        }),
        'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      dryRun: true,
      boundary: 'local-preflight',
      preflightOk: false,
      issues: [
        expect.objectContaining({
          code: 'unsupported-source-path',
          sourceLogicalPath: `${OWNER_ID}/safe/existing.pdf`,
          sourceClassification: 'unsupported',
        }),
      ],
    })
    expect(preflightCheckSourceExists).not.toHaveBeenCalled()
    expect(preflightCheckTargetAvailable).not.toHaveBeenCalled()
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('does not echo unsafe logical paths in local preflight dry-run failures', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: 'C:\\storage\\secret.pdf' })],
        }),
        'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.issues).toEqual([
      expect.objectContaining({
        code: 'unsafe-logical-path',
        sourceLogicalPath: null,
        targetLogicalPath: null,
      }),
    ])
    expect(JSON.stringify(body)).not.toContain('C:\\storage\\secret.pdf')
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns successful local preflight dry-run for already formal attachments without movement', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      dryRun: true,
      boundary: 'local-preflight',
      submitCompatible: true,
      preflightOk: true,
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      message: 'Local submit preflight validated; submit write path was not executed.',
    })
    expect(body).not.toHaveProperty('success', true)
    expect(body).not.toHaveProperty('dokumen')
    expect(mocks.createSubmitDiskPreflightChecker).toHaveBeenCalledTimes(1)
    expect(preflightCheckSourceExists).not.toHaveBeenCalled()
    expect(preflightCheckTargetAvailable).not.toHaveBeenCalled()
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns successful local preflight dry-run for a valid local pending source and available target', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      dryRun: true,
      boundary: 'local-preflight',
      submitCompatible: true,
      preflightOk: true,
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      message: 'Local submit preflight validated; submit write path was not executed.',
    })
    expect(preflightCheckSourceExists).toHaveBeenCalledWith(UNDERSCORE_PENDING_PATH)
    expect(preflightCheckTargetAvailable).toHaveBeenCalledTimes(1)
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('does not expose sensitive values in the local preflight dry-run response', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))
    preflightCheckSourceExists.mockResolvedValue(false)

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: DASH_PENDING_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalPreflightDryRun=true',
      ),
    })
    const serializedBody = JSON.stringify(await response.json())
    const forbiddenFragments = [
      'tok' + 'en',
      'ha' + 'sh',
      'DATABASE' + '_URL',
      'DMS_LOCAL_STORAGE' + '_ROOT',
      'signed' + 'Url',
      'signed URL',
      'storage' + ' root',
      'physical' + ' path',
      'sec' + 'ret',
      'password' + '_hash',
    ]

    for (const fragment of forbiddenFragments) {
      expect(serializedBody.toLowerCase()).not.toContain(fragment.toLowerCase())
    }
    expect(serializedBody).not.toMatch(/[A-Za-z]:\\|\\\\/)
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns 401 Unauthorized for local DB submit without a local session', async () => {
    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload(),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.getLocalServerSession).toHaveBeenCalledTimes(1)
    expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns 403 for local DB submit when the local actor is not PEGAWAI-compatible', async () => {
    for (const localSession of [
      createLocalSession({ roles: ['ADMIN'], activeRole: 'ADMIN' }),
      createLocalSession({ roles: ['PPK'], activeRole: 'PPK' }),
    ]) {
      vi.clearAllMocks()
      mocks.createSubmitDiskPreflightChecker.mockReturnValue({
        checkSourceExists: preflightCheckSourceExists,
        checkTargetAvailable: preflightCheckTargetAvailable,
      })
      mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(
        createLocalSubmitAdapter(),
      )
      mocks.getLocalServerSession.mockResolvedValue(localSession)

      const response = await submitHandler({
        request: createJsonRequest(
          createValidMaterialSubmitPayload(),
          'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
        ),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
      expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
      expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
      expectNoWriteOrMoveCalls(storageMove)
    }
  })

  it('blocks local DB submit for move-required preflight success before any DB write', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'Local DB submit is blocked until local file movement is implemented.',
      code: 'local-file-movement-required',
      writePathExecuted: false,
      filesystemMovementExecuted: false,
    })
    expect(body).not.toHaveProperty('success', true)
    expect(body).not.toHaveProperty('dokumen')
    expect(preflightCheckSourceExists).toHaveBeenCalledWith(UNDERSCORE_PENDING_PATH)
    expect(preflightCheckTargetAvailable).toHaveBeenCalledTimes(1)
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns controlled 400 for local DB submit when the local source is missing before any DB write', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))
    preflightCheckSourceExists.mockResolvedValue(false)

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: DASH_PENDING_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: 'Local submit preflight failed; submit write path was not executed.',
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      issues: [
        expect.objectContaining({
          code: 'source-missing',
          clientCategory: 'local-storage-missing',
          sourceLogicalPath: DASH_PENDING_PATH,
        }),
      ],
    })
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns controlled 400 for local DB submit when the target conflicts before any DB write', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))
    preflightCheckTargetAvailable.mockResolvedValue(false)

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: 'Local submit preflight failed; submit write path was not executed.',
      issues: [
        expect.objectContaining({
          code: 'target-already-exists',
          clientCategory: 'local-storage-conflict',
          sourceLogicalPath: UNDERSCORE_PENDING_PATH,
        }),
      ],
    })
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns 201 for formal/no-move local DB material submit with workflow parity fields', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
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
        lampiran_urls: [createLampiran({ url: FORMAL_PATH })],
      },
    })
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).toHaveBeenCalledTimes(1)
    expect(localSubmitAdapterCalls).toContainEqual(['insertLog', expect.objectContaining({
      dokumenId: DOKUMEN_ID,
      userId: OWNER_ID,
      aksi: 'SUBMIT',
      stepUrutan: 1,
    })])
    expect(preflightCheckSourceExists).not.toHaveBeenCalled()
    expect(preflightCheckTargetAvailable).not.toHaveBeenCalled()
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns 201 for formal/no-move local DB non-material submit with TERSIMPAN parity fields', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidNonMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
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
        lampiran_urls: [createLampiran({ url: FORMAL_PATH })],
      },
    })
    expect(localSubmitAdapterCalls).toContainEqual(['insertLog', expect.objectContaining({
      dokumenId: DOKUMEN_ID,
      userId: OWNER_ID,
      aksi: 'STORE',
      stepUrutan: 1,
    })])
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('returns a safe non-success response when the local DB transaction fails', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(
      createLocalSubmitAdapter({ failStatusUpdate: true }),
    )

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Gagal mengajukan dokumen' })
    expect(JSON.stringify(body)).not.toContain('status update failed')
    expect(localSubmitAdapterCalls).toEqual(expect.arrayContaining([
      ['transaction:begin'],
      ['transaction:rollback'],
    ]))
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('fails local DB submit when audit insert fails inside the local transaction', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(
      createLocalSubmitAdapter({ failAuditInsert: true }),
    )

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Gagal mengajukan dokumen' })
    expect(JSON.stringify(body)).not.toContain('audit insert failed')
    expect(localSubmitAdapterCalls).toEqual(expect.arrayContaining([
      ['insertLog', expect.any(Object)],
      ['transaction:rollback'],
    ]))
    expectNoWriteOrMoveCalls(storageMove)
  })

  it('does not expose sensitive values in local DB submit responses', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))

    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
        }),
        'http://localhost/api/dokumen/submit?useLocalDbSubmit=true',
      ),
    })
    const serializedBody = JSON.stringify(await response.json())
    const forbiddenFragments = [
      'tok' + 'en',
      'ha' + 'sh',
      'DATABASE' + '_URL',
      'DMS_LOCAL_STORAGE' + '_ROOT',
      'signed' + 'Url',
      'signed URL',
      'storage' + ' root',
      'physical' + ' path',
      'sec' + 'ret',
      'password' + '_hash',
    ]

    for (const fragment of forbiddenFragments) {
      expect(serializedBody.toLowerCase()).not.toContain(fragment.toLowerCase())
    }
    expect(serializedBody).not.toMatch(/[A-Za-z]:\\|\\\\/)
    expectNoWriteOrMoveCalls(storageMove)
  })
})

function createJsonRequest(
  body: unknown,
  url = 'http://localhost/api/dokumen/submit',
): Request {
  return new Request(url, {
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

function createLocalSession(overrides: {
  roles: Array<'PEGAWAI' | 'PPK' | 'BENDAHARA' | 'ARSIPARIS' | 'ADMIN'>
  activeRole: 'PEGAWAI' | 'PPK' | 'BENDAHARA' | 'ARSIPARIS' | 'ADMIN'
}) {
  return {
    user: {
      id: OWNER_ID,
      email: 'pegawai@example.test',
      userName: 'Pegawai Test',
    },
    userId: OWNER_ID,
    email: 'pegawai@example.test',
    roles: overrides.roles,
    activeRole: overrides.activeRole,
    sessionId: 'local-session-id',
  }
}

function expectNoWriteOrMoveCalls(storageMove: ReturnType<typeof vi.fn>) {
  expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled()
  expect(mocks.createAdminClient).not.toHaveBeenCalled()
  expect(mocks.getServerSession).not.toHaveBeenCalled()
  expect(mocks.getKelengkapanRequired).not.toHaveBeenCalled()
  expect(mocks.createDokumen).not.toHaveBeenCalled()
  expect(mocks.updateDokumenStatus).not.toHaveBeenCalled()
  expect(mocks.insertLog).not.toHaveBeenCalled()
  expect(storageMove).not.toHaveBeenCalled()
}

function createLocalSubmitAdapter(options: {
  failStatusUpdate?: boolean
  failAuditInsert?: boolean
} = {}) {
  return {
    async selectKegiatanById(kegiatanId: string) {
      localSubmitAdapterCalls.push(['selectKegiatanById', kegiatanId])
      return { id: kegiatanId, nama: 'Kegiatan Pengujian', fungsiId: FUNGSI_ID }
    },
    async selectRequiredKelengkapan(input: unknown) {
      localSubmitAdapterCalls.push(['selectRequiredKelengkapan', input])
      return [{ id: KELENGKAPAN_ID, namaDokumen: 'Laporan', required: true }]
    },
    async selectJenisDokumenById(id: string) {
      localSubmitAdapterCalls.push(['selectJenisDokumenById', id])
      return { id, nama: 'Dokumen Non Material' }
    },
    async selectJenisPermintaanById(id: string) {
      localSubmitAdapterCalls.push(['selectJenisPermintaanById', id])
      return { id, nama: 'Jenis Permintaan' }
    },
    async selectKategoriPermintaanById(id: string) {
      localSubmitAdapterCalls.push(['selectKategoriPermintaanById', id])
      return { id, nama: 'Kategori Permintaan' }
    },
    async selectDetailPermintaanById(id: string) {
      localSubmitAdapterCalls.push(['selectDetailPermintaanById', id])
      return { id, nama: 'Detail Permintaan' }
    },
    async selectKetuaTimAssignmentExists(input: unknown) {
      localSubmitAdapterCalls.push(['selectKetuaTimAssignmentExists', input])
      return true
    },
    async withSubmitTransaction(operation: (tx: unknown) => Promise<unknown>) {
      localSubmitAdapterCalls.push(['transaction:begin'])
      try {
        const result = await operation(createLocalSubmitTransactionAdapter(options))
        localSubmitAdapterCalls.push(['transaction:commit'])
        return result
      } catch (error) {
        localSubmitAdapterCalls.push(['transaction:rollback'])
        throw error
      }
    },
  }
}

function createLocalSubmitTransactionAdapter(options: {
  failStatusUpdate?: boolean
  failAuditInsert?: boolean
}) {
  return {
    async insertDokumen(values: Record<string, unknown>) {
      localSubmitAdapterCalls.push(['insertDokumen', values])
      return createLocalDokumenRow(values)
    },
    async updateDokumenStatus(dokumenId: string, values: Record<string, unknown>) {
      localSubmitAdapterCalls.push(['updateDokumenStatus', dokumenId, values])
      if (options.failStatusUpdate) {
        throw new Error('status update failed with DATABASE' + '_URL and physical ' + 'path')
      }
    },
    async insertLog(values: Record<string, unknown>) {
      localSubmitAdapterCalls.push(['insertLog', values])
      if (options.failAuditInsert) {
        throw new Error('audit insert failed with secret' + '-token and storage ' + 'root')
      }
    },
  }
}

function createLocalDokumenRow(values: Record<string, unknown>) {
  return {
    id: DOKUMEN_ID,
    judul: values.judul,
    fungsiId: values.fungsiId,
    kegiatanJenisId: values.kegiatanJenisId,
    isKetuaTim: values.isKetuaTim,
    status: values.status,
    currentStep: values.currentStep,
    revisionTarget: values.revisionTarget,
    revisionNotes: values.revisionNotes,
    lampiranUrls: values.lampiranUrls,
    tahun: values.tahun,
    tanggal: values.tanggal,
    createdBy: values.createdBy,
    nominalRealisasi: values.nominalRealisasi,
    isNonMaterial: values.isNonMaterial,
    jenisDokumenId: values.jenisDokumenId,
    keteranganDetail: values.keteranganDetail,
    jenisPermintaanId: values.jenisPermintaanId,
    kategoriPermintaanId: values.kategoriPermintaanId,
    detailPermintaanId: values.detailPermintaanId,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    fungsiNama: 'Fungsi Pengujian',
    kegiatanNama: 'Kegiatan Pengujian',
    jenisDokumenNama: values.jenisDokumenId ? 'Dokumen Non Material' : undefined,
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
