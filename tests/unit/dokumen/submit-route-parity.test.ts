import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const FUNGSI_ID = '22222222-2222-4222-8222-222222222222'
const KEGIATAN_ID = '33333333-3333-4333-8333-333333333333'
const JENIS_DOKUMEN_ID = '44444444-4444-4444-8444-444444444444'
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const KELENGKAPAN_ID = '66666666-6666-4666-8666-666666666666'
const KOMPONEN_ID = '77777777-7777-4777-8777-777777777777'
const TARGET_UUID = '88888888-8888-4888-8888-888888888888'
const DASH_PENDING_PATH = `${OWNER_ID}/1778064971564-random123-Laporan.pdf`
const UNDERSCORE_PENDING_PATH = `${OWNER_ID}/${KELENGKAPAN_ID}_1778064971564_Laporan.pdf`
const FORMAL_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${TARGET_UUID}.pdf`

let preflightCheckSourceExists: ReturnType<typeof vi.fn>
let preflightCheckTargetAvailable: ReturnType<typeof vi.fn>
let localSubmitAdapterCalls: unknown[]

const mocks = vi.hoisted(() => ({
  createDokumen: vi.fn(),
  createLiveLocalSubmitDrizzleAdapter: vi.fn(),
  createSubmitDiskPreflightChecker: vi.fn(),
  getKelengkapanRequired: vi.fn(),
  getLocalServerSession: vi.fn(),
  insertLog: vi.fn(),
  moveLocalPendingFileToFormal: vi.fn(),
  resolveLeafNodeName: vi.fn(),
  updateDokumenStatus: vi.fn(),
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

vi.mock('#/lib/storage/local-pending-move', () => ({
  LocalPendingMoveError: class LocalPendingMoveError extends Error {
    constructor(message: string, readonly code: string) {
      super(message)
      this.name = 'LocalPendingMoveError'
    }
  },
  moveLocalPendingFileToFormal: mocks.moveLocalPendingFileToFormal,
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

describe('/api/dokumen/submit local default parity', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()

    preflightCheckSourceExists = vi.fn(async () => true)
    preflightCheckTargetAvailable = vi.fn(async () => true)
    localSubmitAdapterCalls = []

    mocks.createSubmitDiskPreflightChecker.mockReturnValue({
      checkSourceExists: preflightCheckSourceExists,
      checkTargetAvailable: preflightCheckTargetAvailable,
    })
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(createLocalSubmitAdapter())
    mocks.moveLocalPendingFileToFormal.mockImplementation(async (input: {
      sourceLogicalPath: string
      ownerUserId: string
      dokumenId: string
      targetUuid: string
    }) => ({
      action: 'moved',
      sourceLogicalPath: input.sourceLogicalPath,
      targetLogicalPath: `${input.ownerUserId}/${input.dokumenId}/${input.targetUuid}.pdf`,
      sourceClassification: input.sourceLogicalPath === DASH_PENDING_PATH
        ? 'pending-dash'
        : 'pending-upload-api',
    }))
    mocks.getLocalServerSession.mockResolvedValue(createLocalSession({
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns 400 Invalid JSON body for missing or malformed JSON bodies', async () => {
    const missingBodyResponse = await submitHandler({
      request: new Request('http://localhost/api/dokumen/submit', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
        },
      }),
    })

    expect(missingBodyResponse.status).toBe(400)
    expect(await missingBodyResponse.json()).toEqual({ error: 'Invalid JSON body' })

    const malformedBodyResponse = await submitHandler({
      request: new Request('http://localhost/api/dokumen/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
        },
        body: '{',
      }),
    })

    expect(malformedBodyResponse.status).toBe(400)
    expect(await malformedBodyResponse.json()).toEqual({ error: 'Invalid JSON body' })
    expectNoLegacySubmitCalls()
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
    expectNoLegacySubmitCalls()
  })

  it('returns 400 when material nominal_realisasi is missing or invalid', async () => {
    for (const payload of [
      createValidMaterialSubmitPayload({ nominal_realisasi: undefined }),
      createValidMaterialSubmitPayload({ nominal_realisasi: 0 }),
    ]) {
      const response = await submitHandler({
        request: createJsonRequest(payload),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        error: 'Nominal_realisasi wajib untuk dokumen Material',
      })
    }
    expectNoLegacySubmitCalls()
  })

  it('returns 400 when the workflow chain field required per characteristic is missing', async () => {
    const missingKomponen = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({ komponenId: undefined })),
    })

    expect(missingKomponen.status).toBe(400)
    expect(await missingKomponen.json()).toEqual({
      error: 'Komponen wajib dipilih untuk dokumen Material',
    })

    const missingNamaDokumen = await submitHandler({
      request: createJsonRequest(createValidNonMaterialSubmitPayload({ namaDokumen: undefined })),
    })

    expect(missingNamaDokumen.status).toBe(400)
    expect(await missingNamaDokumen.json()).toEqual({
      error: 'Nama Dokumen wajib diisi untuk dokumen Non-Material',
    })
    expectNoLegacySubmitCalls()
  })

  it('uses the local default path and succeeds for formal/no-move material payload', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
      })),
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
    expect(mocks.getLocalServerSession).toHaveBeenCalledTimes(1)
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).toHaveBeenCalledTimes(1)
    expect(preflightCheckSourceExists).not.toHaveBeenCalled()
    expect(preflightCheckTargetAvailable).not.toHaveBeenCalled()
    expect(localSubmitAdapterCalls).toContainEqual(['insertLog', expect.objectContaining({
      dokumenId: DOKUMEN_ID,
      userId: OWNER_ID,
      aksi: 'SUBMIT',
      stepUrutan: 1,
    })])
    expect(mocks.moveLocalPendingFileToFormal).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
  })

  it('uses the local default path and succeeds for move-required local pending payload after movement success', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
      })),
    })
    const body = await response.json()
    const returnedPath = body.dokumen.lampiran_urls[0].url

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
    expect(returnedPath).not.toBe(UNDERSCORE_PENDING_PATH)
    expect(returnedPath).toMatch(new RegExp(`^${OWNER_ID}/temp-id/[0-9a-f-]{36}\\.pdf$`))
    expect(preflightCheckSourceExists).toHaveBeenCalledWith(UNDERSCORE_PENDING_PATH)
    expect(preflightCheckTargetAvailable).toHaveBeenCalledTimes(1)
    expect(mocks.moveLocalPendingFileToFormal).toHaveBeenCalledWith({
      sourceLogicalPath: UNDERSCORE_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: 'temp-id',
      targetUuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(localSubmitAdapterCalls).toContainEqual(['insertDokumen', expect.objectContaining({
      lampiranUrls: [expect.objectContaining({ url: returnedPath })],
    })])
    expectNoLegacySubmitCalls()
  })

  it('uses the local default path and succeeds for non-material payload', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidNonMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
      })),
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
    expectNoLegacySubmitCalls()
  })

  it('keeps useLocalDbSubmit=true as a redundant alias for the same local path', async () => {
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
    expect(body).toMatchObject({ success: true, dokumen: { id: DOKUMEN_ID } })
    expect(mocks.getLocalServerSession).toHaveBeenCalledTimes(1)
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).toHaveBeenCalledTimes(1)
    expectNoLegacySubmitCalls()
  })

  it('returns 401 Unauthorized for default local submit without a local session', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload()),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
  })

  it('returns 403 for default local submit when the local actor is not PEGAWAI-compatible', async () => {
    for (const localSession of [
      createLocalSession({ roles: ['ADMIN'], activeRole: 'ADMIN' }),
      createLocalSession({ roles: ['PPK'], activeRole: 'PPK' }),
    ]) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValue(localSession)

      const response = await submitHandler({
        request: createJsonRequest(createValidMaterialSubmitPayload()),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
      expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
      expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
      expectNoLegacySubmitCalls()
    }
  })

  it('returns controlled 400 before DB write when the local source is missing', async () => {
    preflightCheckSourceExists.mockResolvedValue(false)

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: DASH_PENDING_PATH })],
      })),
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
          checkKind: 'source',
        }),
      ],
    })
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expect(mocks.moveLocalPendingFileToFormal).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
  })

  it('returns controlled 400 before DB write when the target conflicts', async () => {
    preflightCheckTargetAvailable.mockResolvedValue(false)

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
      })),
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
          checkKind: 'target',
        }),
      ],
    })
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expect(mocks.moveLocalPendingFileToFormal).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
  })

  it('returns safe 500 when the local DB transaction fails and does not move files', async () => {
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(
      createLocalSubmitAdapter({ failStatusUpdate: true }),
    )

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
      })),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Gagal mengajukan dokumen' })
    expect(JSON.stringify(body)).not.toContain('DATABASE' + '_URL')
    expect(localSubmitAdapterCalls).toEqual(expect.arrayContaining([
      ['transaction:rollback'],
    ]))
    expect(mocks.moveLocalPendingFileToFormal).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
  })

  it('fails default local submit when audit insert fails inside the local transaction', async () => {
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(
      createLocalSubmitAdapter({ failAuditInsert: true }),
    )

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
      })),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Gagal mengajukan dokumen' })
    expect(localSubmitAdapterCalls).toEqual(expect.arrayContaining([
      ['insertLog', expect.any(Object)],
      ['transaction:rollback'],
    ]))
    expect(mocks.moveLocalPendingFileToFormal).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
  })

  it('returns safe non-success when local movement fails after DB success', async () => {
    mocks.moveLocalPendingFileToFormal.mockRejectedValue(
      new Error('raw ' + 'filesystem failure at C:\\' + 'private\\storage with secret' + '-token'),
    )

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
      })),
    })
    const body = await response.json()
    const serializedBody = JSON.stringify(body)

    expect(response.status).toBe(500)
    expect(body).toMatchObject({
      error: 'Local file movement failed after local DB submit.',
      code: 'local-file-movement-failed',
      writePathExecuted: true,
      filesystemMovementExecuted: true,
      compensationRequired: true,
      partialMovement: false,
      movedCount: 0,
      issues: [
        expect.objectContaining({
          code: 'move-failed',
          clientCategory: 'preflight-unavailable',
          index: 0,
          sourceLogicalPath: UNDERSCORE_PENDING_PATH,
        }),
      ],
    })
    expect(body).not.toHaveProperty('success', true)
    expect(body).not.toHaveProperty('dokumen')
    expect(localSubmitAdapterCalls).toEqual(expect.arrayContaining([
      ['transaction:commit'],
    ]))
    expect(mocks.moveLocalPendingFileToFormal).toHaveBeenCalledTimes(1)
    expect(serializedBody).not.toContain('C:\\' + 'private')
    expect(serializedBody).not.toContain('secret' + '-token')
    expect(serializedBody).not.toContain('raw ' + 'filesystem failure')
    expectNoLegacySubmitCalls()
  })

  it('returns safe non-success for partial local movement failure after DB success', async () => {
    mocks.moveLocalPendingFileToFormal
      .mockImplementationOnce(async (input: {
        sourceLogicalPath: string
        ownerUserId: string
        dokumenId: string
        targetUuid: string
      }) => ({
        action: 'moved',
        sourceLogicalPath: input.sourceLogicalPath,
        targetLogicalPath: `${input.ownerUserId}/${input.dokumenId}/${input.targetUuid}.pdf`,
        sourceClassification: 'pending-upload-api',
      }))
      .mockRejectedValueOnce(
        new Error('partial failure with DATABASE' + '_URL and storage' + ' root'),
      )

    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [
          createLampiran({ url: UNDERSCORE_PENDING_PATH }),
          createLampiran({ url: DASH_PENDING_PATH }),
        ],
      })),
    })
    const body = await response.json()
    const serializedBody = JSON.stringify(body)

    expect(response.status).toBe(500)
    expect(body).toMatchObject({
      error: 'Local file movement failed after local DB submit.',
      code: 'local-file-movement-failed',
      writePathExecuted: true,
      filesystemMovementExecuted: true,
      compensationRequired: true,
      partialMovement: true,
      movedCount: 1,
      issues: [
        expect.objectContaining({
          code: 'move-failed',
          index: 1,
          sourceLogicalPath: DASH_PENDING_PATH,
        }),
      ],
    })
    expect(body).not.toHaveProperty('success', true)
    expect(mocks.moveLocalPendingFileToFormal).toHaveBeenCalledTimes(2)
    expect(serializedBody).not.toContain('DATABASE' + '_URL')
    expect(serializedBody).not.toContain('storage' + ' root')
    expect(serializedBody).not.toContain('partial failure')
    expectNoLegacySubmitCalls()
  })

  it('does not echo unsafe logical paths in default local preflight failures', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: 'C:\\storage\\secret.pdf' })],
      })),
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
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expect(mocks.moveLocalPendingFileToFormal).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
  })

  it('does not expose sensitive values in local default responses', async () => {
    const response = await submitHandler({
      request: createJsonRequest(createValidMaterialSubmitPayload({
        lampiranUrls: [createLampiran({ url: FORMAL_PATH })],
      })),
    })
    const serializedBody = JSON.stringify(await response.json())

    expectNoSensitiveFragments(serializedBody)
    expectNoLegacySubmitCalls()
  })

  it('keeps the local auth dry-run diagnostic branch non-writing', async () => {
    const response = await submitHandler({
      request: createJsonRequest(
        createValidMaterialSubmitPayload({
          lampiranUrls: [createLampiran({ url: UNDERSCORE_PENDING_PATH })],
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
    expect(mocks.createSubmitDiskPreflightChecker).not.toHaveBeenCalled()
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expect(mocks.moveLocalPendingFileToFormal).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
  })

  it('keeps the local preflight dry-run diagnostic branch non-writing', async () => {
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
    expect(body).not.toHaveProperty('success', true)
    expect(body).not.toHaveProperty('dokumen')
    expect(preflightCheckSourceExists).toHaveBeenCalledWith(UNDERSCORE_PENDING_PATH)
    expect(preflightCheckTargetAvailable).toHaveBeenCalledTimes(1)
    expect(mocks.createLiveLocalSubmitDrizzleAdapter).not.toHaveBeenCalled()
    expect(mocks.moveLocalPendingFileToFormal).not.toHaveBeenCalled()
    expectNoLegacySubmitCalls()
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
      Origin: 'http://localhost',
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
    komponenId: KOMPONEN_ID,
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
    namaDokumen: 'Notulen Rapat',
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
  namaDokumen?: string
  keteranganDetail?: string
  komponenId?: string
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

function createLocalSession(overrides: {
  roles: Array<'PEGAWAI' | 'PPK' | 'BENDAHARA' | 'KEPALA_SUB_BAGIAN_UMUM' | 'ADMIN'>
  activeRole: 'PEGAWAI' | 'PPK' | 'BENDAHARA' | 'KEPALA_SUB_BAGIAN_UMUM' | 'ADMIN'
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

function expectNoLegacySubmitCalls() {
  expect(mocks.getKelengkapanRequired).not.toHaveBeenCalled()
  expect(mocks.createDokumen).not.toHaveBeenCalled()
  expect(mocks.updateDokumenStatus).not.toHaveBeenCalled()
  expect(mocks.insertLog).not.toHaveBeenCalled()
}

function expectNoSensitiveFragments(serializedBody: string) {
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
    async selectKomponenById(id: string) {
      localSubmitAdapterCalls.push(['selectKomponenById', id])
      return { id, nama: 'Komponen Pengujian' }
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
    namaDokumen: values.namaDokumen,
    keteranganDetail: values.keteranganDetail,
    komponenId: values.komponenId,
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
