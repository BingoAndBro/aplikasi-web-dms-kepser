import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const KLASIFIKASI_ID = '33333333-3333-4333-8333-333333333333'
const BERKAS_ID = '44444444-4444-4444-8444-444444444444'
const TAHUN_ANGGARAN = 2026
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const MANUAL_ARSIP_ID = '66666666-6666-4666-8666-666666666666'

const mocks = vi.hoisted(() => {
  class MockBerkasArsipServiceError extends Error {
    public readonly code: string

    constructor(code: string, message: string) {
      super(message)
      this.name = 'BerkasArsipServiceError'
      this.code = code
    }
  }

  return {
    getLocalServerSession: vi.fn(),
    getOrCreateOpenBerkasForKlasifikasi: vi.fn(),
    addWorkflowDocumentToOpenBerkas: vi.fn(),
    addManualDocumentToOpenBerkas: vi.fn(),
    closeBerkasArsip: vi.fn(),
    transitionBerkasArchiveStatus: vi.fn(),
    executeBerkasPhysicalFileDestruction: vi.fn(),
    BerkasArsipServiceError: MockBerkasArsipServiceError,
  }
})

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/lib/archive/berkas-arsip-service', () => ({
  BerkasArsipServiceError: mocks.BerkasArsipServiceError,
  getOrCreateOpenBerkasForKlasifikasi: mocks.getOrCreateOpenBerkasForKlasifikasi,
  addWorkflowDocumentToOpenBerkas: mocks.addWorkflowDocumentToOpenBerkas,
  addManualDocumentToOpenBerkas: mocks.addManualDocumentToOpenBerkas,
  closeBerkasArsip: mocks.closeBerkasArsip,
  transitionBerkasArchiveStatus: mocks.transitionBerkasArchiveStatus,
}))

vi.mock('#/lib/archive/berkas-arsip-physical-destruction', () => ({
  BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE: 'HAPUS FILE FISIK ARSIP',
  executeBerkasPhysicalFileDestruction: mocks.executeBerkasPhysicalFileDestruction,
}))

import { Route as OpenBerkasRoute } from '#/routes/api/kasubag/berkas/open'
import { Route as AddBerkasItemRoute } from '#/routes/api/kasubag/berkas/$id/items'
import { Route as CloseBerkasRoute } from '#/routes/api/kasubag/berkas/$id/close'
import { Route as LifecycleBerkasRoute } from '#/routes/api/kasubag/berkas/$id/lifecycle'

type PostHandler = (args: {
  request: Request
  params?: Record<string, string>
}) => Promise<Response>

const openPostHandler = (OpenBerkasRoute as unknown as {
  options: { server: { handlers: { POST: PostHandler } } }
}).options.server.handlers.POST

const addItemPostHandler = (AddBerkasItemRoute as unknown as {
  options: { server: { handlers: { POST: PostHandler } } }
}).options.server.handlers.POST

const closePostHandler = (CloseBerkasRoute as unknown as {
  options: { server: { handlers: { POST: PostHandler } } }
}).options.server.handlers.POST

const lifecyclePostHandler = (LifecycleBerkasRoute as unknown as {
  options: { server: { handlers: { POST: PostHandler } } }
}).options.server.handlers.POST

describe('berkas arsip API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
    mocks.getOrCreateOpenBerkasForKlasifikasi.mockResolvedValue(openBerkasDto())
    mocks.addWorkflowDocumentToOpenBerkas.mockResolvedValue(workflowItemDto())
    mocks.addManualDocumentToOpenBerkas.mockResolvedValue(manualItemDto())
    mocks.closeBerkasArsip.mockResolvedValue(closedBerkasDto())
    mocks.transitionBerkasArchiveStatus.mockResolvedValue(proposedBerkasDto())
    mocks.executeBerkasPhysicalFileDestruction.mockResolvedValue(physicalDeletionReport())
  })

  it('protects POST routes with same-origin before auth or service work', async () => {
    const response = await openPostHandler({
      request: jsonRequest('/api/kasubag/berkas/open', {
        klasifikasi_id: KLASIFIKASI_ID,
      }, 'https://evil.example'),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.getOrCreateOpenBerkasForKlasifikasi).not.toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated open-folder requests', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await openPostHandler({
      request: jsonRequest('/api/kasubag/berkas/open', {
        klasifikasi_id: KLASIFIKASI_ID,
      }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.getOrCreateOpenBerkasForKlasifikasi).not.toHaveBeenCalled()
  })

  it('returns 403 for wrong-role and ADMIN-only open-folder requests', async () => {
    for (const roles of [['PEGAWAI'], ['ADMIN']]) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValueOnce(
        createSession(roles, roles[0] === 'ADMIN' ? ADMIN_ID : USER_ID),
      )

      const response = await openPostHandler({
        request: jsonRequest('/api/kasubag/berkas/open', {
          klasifikasi_id: KLASIFIKASI_ID,
        }),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
      expect(mocks.getOrCreateOpenBerkasForKlasifikasi).not.toHaveBeenCalled()
    }
  })

  it('validates open-folder klasifikasi_id before service work', async () => {
    const response = await openPostHandler({
      request: jsonRequest('/api/kasubag/berkas/open', {
        klasifikasi_id: 'not-a-uuid',
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Cara pembayaran tidak valid' })
    expect(mocks.getOrCreateOpenBerkasForKlasifikasi).not.toHaveBeenCalled()
  })

  it('opens or returns an OPEN berkas by jenis pembayaran', async () => {
    const response = await openPostHandler({
      request: jsonRequest('/api/kasubag/berkas/open', {
        klasifikasi_id: KLASIFIKASI_ID,
        tahun_anggaran: TAHUN_ANGGARAN,
      }),
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ berkas: openBerkasDto() })
    expect(mocks.getOrCreateOpenBerkasForKlasifikasi).toHaveBeenCalledWith({
      klasifikasiId: KLASIFIKASI_ID,
      tahunAnggaran: TAHUN_ANGGARAN,
      actorUserId: USER_ID,
    })
    expectNoSensitiveOutput(body)
  })

  it('maps closed jenis pembayaran open-folder rejection to 409', async () => {
    mocks.getOrCreateOpenBerkasForKlasifikasi.mockRejectedValueOnce(
      new mocks.BerkasArsipServiceError(
        'BERKAS_KLASIFIKASI_CLOSED',
        'Berkas untuk Cara Pembayaran ini sudah ditutup',
      ),
    )

    const response = await openPostHandler({
      request: jsonRequest('/api/kasubag/berkas/open', {
        klasifikasi_id: KLASIFIKASI_ID,
        tahun_anggaran: TAHUN_ANGGARAN,
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Berkas untuk Cara Pembayaran ini sudah ditutup',
    })
  })

  it('rejects invalid add-item bodies before service work', async () => {
    const cases = [
      { source_type: 'WORKFLOW', manual_arsip_id: MANUAL_ARSIP_ID },
      { source_type: 'MANUAL', dokumen_id: DOKUMEN_ID },
      { source_type: 'WORKFLOW', dokumen_id: DOKUMEN_ID, manual_arsip_id: MANUAL_ARSIP_ID },
      { source_type: 'LEGACY', dokumen_id: DOKUMEN_ID },
    ]

    for (const body of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))

      const response = await addItemPostHandler({
        request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/items`, body),
        params: { id: BERKAS_ID },
      })

      expect(response.status).toBe(400)
      expect(mocks.addWorkflowDocumentToOpenBerkas).not.toHaveBeenCalled()
      expect(mocks.addManualDocumentToOpenBerkas).not.toHaveBeenCalled()
    }
  })

  it('routes WORKFLOW and MANUAL add-item requests to the matching service helper', async () => {
    const workflow = await addItemPostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/items`, {
        source_type: 'WORKFLOW',
        dokumen_id: DOKUMEN_ID,
      }),
      params: { id: BERKAS_ID },
    })

    expect(workflow.status).toBe(201)
    expect(await workflow.json()).toEqual({ item: workflowItemDto() })
    expect(mocks.addWorkflowDocumentToOpenBerkas).toHaveBeenCalledWith({
      berkasId: BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: USER_ID,
    })

    const manual = await addItemPostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/items`, {
        source_type: 'MANUAL',
        manual_arsip_id: MANUAL_ARSIP_ID,
      }),
      params: { id: BERKAS_ID },
    })

    const manualBody = await manual.json()

    expect(manual.status).toBe(201)
    expect(manualBody).toEqual({ item: manualItemDto() })
    expect(mocks.addManualDocumentToOpenBerkas).toHaveBeenCalledWith({
      berkasId: BERKAS_ID,
      manualArsipId: MANUAL_ARSIP_ID,
      actorUserId: USER_ID,
    })
    expectNoSensitiveOutput(manualBody)
  })

  it('maps CLOSED berkas add-item rejection to 409', async () => {
    mocks.addWorkflowDocumentToOpenBerkas.mockRejectedValueOnce(
      new mocks.BerkasArsipServiceError('BERKAS_CLOSED', 'Berkas ini tidak dapat dipilih karena sudah ditutup'),
    )

    const response = await addItemPostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/items`, {
        source_type: 'WORKFLOW',
        dokumen_id: DOKUMEN_ID,
      }),
      params: { id: BERKAS_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Berkas ini tidak dapat dipilih karena sudah ditutup',
    })
  })

  it('maps missing workflow source classification to a safe blocked response', async () => {
    mocks.addWorkflowDocumentToOpenBerkas.mockRejectedValueOnce(
      new mocks.BerkasArsipServiceError(
        'SOURCE_KLASIFIKASI_UNAVAILABLE',
        'Jenis pembayaran dokumen belum tersedia untuk validasi berkas',
      ),
    )

    const response = await addItemPostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/items`, {
        source_type: 'WORKFLOW',
        dokumen_id: DOKUMEN_ID,
      }),
      params: { id: BERKAS_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Jenis pembayaran dokumen belum tersedia untuk validasi berkas',
    })
  })

  it('validates close metadata before service work', async () => {
    const response = await closePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/close`, {
        nomor_spm: '',
        retensi_aktif: '1 Tahun',
      }),
      params: { id: BERKAS_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nomor SPM wajib diisi' })
    expect(mocks.closeBerkasArsip).not.toHaveBeenCalled()
  })

  it('maps empty and already-closed close-folder rejections to 409', async () => {
    const cases = [
      ['BERKAS_EMPTY', 'Berkas kosong tidak dapat ditutup'],
      ['BERKAS_NOT_OPEN', 'Berkas sudah ditutup'],
    ] as const

    for (const [code, message] of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
      mocks.closeBerkasArsip.mockRejectedValueOnce(new mocks.BerkasArsipServiceError(code, message))

      const response = await closePostHandler({
        request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/close`, validCloseBody()),
        params: { id: BERKAS_ID },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: message })
    }
  })

  it('closes a non-empty OPEN berkas with safe DTO response', async () => {
    const response = await closePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/close`, validCloseBody()),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ berkas: closedBerkasDto() })
    expect(mocks.closeBerkasArsip).toHaveBeenCalledWith({
      berkasId: BERKAS_ID,
      actorUserId: USER_ID,
      metadata: validCloseBody(),
    })
    expectNoSensitiveOutput(body)
  })

  it('returns 401 for unauthenticated lifecycle requests', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'mark_inactive',
      }),
      params: { id: BERKAS_ID },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.transitionBerkasArchiveStatus).not.toHaveBeenCalled()
  })

  it('protects lifecycle POST with same-origin before auth or service work', async () => {
    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'mark_inactive',
      }, 'https://evil.example'),
      params: { id: BERKAS_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.transitionBerkasArchiveStatus).not.toHaveBeenCalled()
  })

  it('returns 403 for ADMIN-only lifecycle requests', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['ADMIN'], ADMIN_ID))

    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'mark_inactive',
      }),
      params: { id: BERKAS_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    expect(mocks.transitionBerkasArchiveStatus).not.toHaveBeenCalled()
  })

  it('validates lifecycle request body before service work', async () => {
    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'restore_active',
      }),
      params: { id: BERKAS_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Aksi lifecycle berkas tidak valid' })
    expect(mocks.transitionBerkasArchiveStatus).not.toHaveBeenCalled()
  })

  it('requires exact typed confirmation for approve_destruction before service work', async () => {
    for (const body of [
      { action: 'approve_destruction' },
      { action: 'approve_destruction', confirmation: 'SETUJUI PEMUSNAHAN ARSIP' },
    ]) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))

      const response = await lifecyclePostHandler({
        request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, body),
        params: { id: BERKAS_ID },
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Aksi lifecycle berkas tidak valid' })
      expect(mocks.transitionBerkasArchiveStatus).not.toHaveBeenCalled()
      expect(mocks.executeBerkasPhysicalFileDestruction).not.toHaveBeenCalled()
    }
  })

  it('moves lifecycle through the folder service for assigned KEPALA_SUB_BAGIAN_UMUM', async () => {
    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'propose_destruction',
      }),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ berkas: proposedBerkasDto() })
    expect(mocks.transitionBerkasArchiveStatus).toHaveBeenCalledWith({
      berkasId: BERKAS_ID,
      actorUserId: USER_ID,
      action: 'propose_destruction',
    })
    expect(mocks.executeBerkasPhysicalFileDestruction).not.toHaveBeenCalled()
    expectNoSensitiveOutput(body)
  })

  it('moves approve_destruction then invokes physical deletion with the internal phrase', async () => {
    mocks.transitionBerkasArchiveStatus.mockResolvedValueOnce(destroyedBerkasDto())

    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'approve_destruction',
        confirmation: 'BERSIHKAN FILE BERKAS',
      }),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      berkas: destroyedBerkasDto(),
      physical_deletion: physicalDeletionReport(),
    })
    expect(mocks.transitionBerkasArchiveStatus).toHaveBeenCalledWith({
      berkasId: BERKAS_ID,
      actorUserId: USER_ID,
      action: 'approve_destruction',
    })
    expect(mocks.executeBerkasPhysicalFileDestruction).toHaveBeenCalledWith({
      berkasId: BERKAS_ID,
      confirmation: 'HAPUS FILE FISIK ARSIP',
      actorUserId: USER_ID,
    })
    expect(
      mocks.transitionBerkasArchiveStatus.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.executeBerkasPhysicalFileDestruction.mock.invocationCallOrder[0])
    expectNoSensitiveOutput(body)
  })

  it('returns safe physical deletion partial summaries without leaking paths', async () => {
    const partialReport = physicalDeletionReport({
      status: 'partial',
      deleted_count: 1,
      already_missing_count: 1,
      skipped_unsafe_count: 1,
      skipped_duplicate_count: 1,
      failed_count: 1,
      physical_deletion_performed: true,
      errors: [
        'DUPLICATE_FILE_CANDIDATE_SKIPPED',
        'PHYSICAL_FILE_ALREADY_MISSING',
        'PHYSICAL_FILE_DELETE_FAILED',
        'UNSAFE_FILE_CANDIDATE_SKIPPED',
      ],
    })
    mocks.transitionBerkasArchiveStatus.mockResolvedValueOnce(destroyedBerkasDto())
    mocks.executeBerkasPhysicalFileDestruction.mockResolvedValueOnce(partialReport)

    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'approve_destruction',
        confirmation: 'BERSIHKAN FILE BERKAS',
      }),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      berkas: destroyedBerkasDto(),
      physical_deletion: partialReport,
    })
    expectNoSensitiveOutput(body)
  })

  it('keeps lifecycle success and returns a safe failed physical deletion summary on helper exceptions', async () => {
    mocks.transitionBerkasArchiveStatus.mockResolvedValueOnce(destroyedBerkasDto())
    mocks.executeBerkasPhysicalFileDestruction.mockRejectedValueOnce(
      new Error('D:\\storage\\owner-user\\secret-token.pdf'),
    )

    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'approve_destruction',
        confirmation: 'BERSIHKAN FILE BERKAS',
      }),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      berkas: destroyedBerkasDto(),
      physical_deletion: {
        status: 'failed',
        total_items: 0,
        workflow_attachment_candidates: 0,
        manual_attachment_candidates: 0,
        deleted_count: 0,
        already_missing_count: 0,
        skipped_unsafe_count: 0,
        skipped_duplicate_count: 0,
        failed_count: 1,
        physical_deletion_performed: false,
        errors: ['PHYSICAL_FILE_DELETE_FAILED'],
      },
    })
    expectNoSensitiveOutput(body)
  })

  it('maps invalid lifecycle transitions to a safe 409 response', async () => {
    mocks.transitionBerkasArchiveStatus.mockRejectedValueOnce(
      new mocks.BerkasArsipServiceError(
        'BERKAS_LIFECYCLE_INVALID',
        'Perubahan status berkas tidak valid',
      ),
    )

    const response = await lifecyclePostHandler({
      request: jsonRequest(`/api/kasubag/berkas/${BERKAS_ID}/lifecycle`, {
        action: 'approve_destruction',
        confirmation: 'BERSIHKAN FILE BERKAS',
      }),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({ error: 'Perubahan status berkas tidak valid' })
    expect(mocks.executeBerkasPhysicalFileDestruction).not.toHaveBeenCalled()
    expectNoSensitiveOutput(body)
  })
})

function createSession(roles: string[], userId: string) {
  return {
    user: {
      id: userId,
      username: 'user',
    },
    userId,
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function jsonRequest(path: string, body: Record<string, unknown>, origin = 'http://localhost') {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  })
}

function validCloseBody() {
  return {
    nomor_spm: 'SPM-001/2026',
    retensi_aktif: '1 Tahun',
    closed_at: '2026-05-29',
  }
}

function openBerkasDto() {
  return {
    id: BERKAS_ID,
    klasifikasi_id: KLASIFIKASI_ID,
    tahun_anggaran: TAHUN_ANGGARAN,
    klasifikasi_kode_snapshot: 'BB',
    klasifikasi_nama_snapshot: 'Belanja Barang',
    status_berkas: 'OPEN',
    status_arsip: null,
    nomor_spm: null,
    retensi_aktif: null,
    retensi_inaktif: null,
    masa_aktif_berakhir: null,
    masa_inaktif_berakhir: null,
    closed_at: null,
    closed_by: null,
    created_by: USER_ID,
  }
}

function closedBerkasDto() {
  return {
    ...openBerkasDto(),
    status_berkas: 'CLOSED',
    status_arsip: 'AKTIF',
    nomor_spm: 'SPM-001/2026',
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    masa_aktif_berakhir: '2027-05-29',
    masa_inaktif_berakhir: '2030-05-29',
    closed_at: '2026-05-29T00:00:00.000Z',
    closed_by: USER_ID,
  }
}

function proposedBerkasDto() {
  return {
    ...closedBerkasDto(),
    status_arsip: 'USUL_MUSNAH',
  }
}

function destroyedBerkasDto() {
  return {
    ...closedBerkasDto(),
    status_arsip: 'DIMUSNAHKAN',
  }
}

function physicalDeletionReport(overrides: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    total_items: 2,
    workflow_attachment_candidates: 1,
    manual_attachment_candidates: 1,
    deleted_count: 2,
    already_missing_count: 0,
    skipped_unsafe_count: 0,
    skipped_duplicate_count: 0,
    failed_count: 0,
    physical_deletion_performed: true,
    errors: [],
    ...overrides,
  }
}

function workflowItemDto() {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    berkas_id: BERKAS_ID,
    source_type: 'WORKFLOW',
    dokumen_id: DOKUMEN_ID,
    manual_arsip_id: null,
    added_by: USER_ID,
  }
}

function manualItemDto() {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    berkas_id: BERKAS_ID,
    source_type: 'MANUAL',
    dokumen_id: null,
    manual_arsip_id: MANUAL_ARSIP_ID,
    added_by: USER_ID,
  }
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('raw')
}
