import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const KLASIFIKASI_ID = '33333333-3333-4333-8333-333333333333'
const BERKAS_ID = '44444444-4444-4444-8444-444444444444'
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const MANUAL_ARSIP_ID = '66666666-6666-4666-8666-666666666666'
const CANONICAL_ARSIP_ID = '77777777-7777-4777-8777-777777777777'

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
}))

import { Route as OpenBerkasRoute } from '#/routes/api/arsiparis/berkas/open'
import { Route as AddBerkasItemRoute } from '#/routes/api/arsiparis/berkas/$id/items'
import { Route as CloseBerkasRoute } from '#/routes/api/arsiparis/berkas/$id/close'

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

describe('berkas arsip API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
    mocks.getOrCreateOpenBerkasForKlasifikasi.mockResolvedValue(openBerkasDto())
    mocks.addWorkflowDocumentToOpenBerkas.mockResolvedValue(workflowItemDto())
    mocks.addManualDocumentToOpenBerkas.mockResolvedValue(manualItemDto())
    mocks.closeBerkasArsip.mockResolvedValue(closedBerkasDto())
  })

  it('protects POST routes with same-origin before auth or service work', async () => {
    const response = await openPostHandler({
      request: jsonRequest('/api/arsiparis/berkas/open', {
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
      request: jsonRequest('/api/arsiparis/berkas/open', {
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
        request: jsonRequest('/api/arsiparis/berkas/open', {
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
      request: jsonRequest('/api/arsiparis/berkas/open', {
        klasifikasi_id: 'not-a-uuid',
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Jenis pembayaran tidak valid' })
    expect(mocks.getOrCreateOpenBerkasForKlasifikasi).not.toHaveBeenCalled()
  })

  it('opens or returns an OPEN berkas by jenis pembayaran', async () => {
    const response = await openPostHandler({
      request: jsonRequest('/api/arsiparis/berkas/open', {
        klasifikasi_id: KLASIFIKASI_ID,
      }),
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ berkas: openBerkasDto() })
    expect(mocks.getOrCreateOpenBerkasForKlasifikasi).toHaveBeenCalledWith({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: USER_ID,
    })
    expectNoSensitiveOutput(body)
  })

  it('maps closed jenis pembayaran open-folder rejection to 409', async () => {
    mocks.getOrCreateOpenBerkasForKlasifikasi.mockRejectedValueOnce(
      new mocks.BerkasArsipServiceError(
        'BERKAS_KLASIFIKASI_CLOSED',
        'Berkas untuk Jenis Pembayaran ini sudah ditutup',
      ),
    )

    const response = await openPostHandler({
      request: jsonRequest('/api/arsiparis/berkas/open', {
        klasifikasi_id: KLASIFIKASI_ID,
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Berkas untuk Jenis Pembayaran ini sudah ditutup',
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
        request: jsonRequest(`/api/arsiparis/berkas/${BERKAS_ID}/items`, body),
        params: { id: BERKAS_ID },
      })

      expect(response.status).toBe(400)
      expect(mocks.addWorkflowDocumentToOpenBerkas).not.toHaveBeenCalled()
      expect(mocks.addManualDocumentToOpenBerkas).not.toHaveBeenCalled()
    }
  })

  it('routes WORKFLOW and MANUAL add-item requests to the matching service helper', async () => {
    const workflow = await addItemPostHandler({
      request: jsonRequest(`/api/arsiparis/berkas/${BERKAS_ID}/items`, {
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
      request: jsonRequest(`/api/arsiparis/berkas/${BERKAS_ID}/items`, {
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
      request: jsonRequest(`/api/arsiparis/berkas/${BERKAS_ID}/items`, {
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

  it('validates close metadata before service work', async () => {
    const response = await closePostHandler({
      request: jsonRequest(`/api/arsiparis/berkas/${BERKAS_ID}/close`, {
        nomor_spm: '',
        retensi_aktif: '1 Tahun',
        retensi_inaktif: '3 Tahun',
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
        request: jsonRequest(`/api/arsiparis/berkas/${BERKAS_ID}/close`, validCloseBody()),
        params: { id: BERKAS_ID },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: message })
    }
  })

  it('closes a non-empty OPEN berkas with safe DTO response', async () => {
    const response = await closePostHandler({
      request: jsonRequest(`/api/arsiparis/berkas/${BERKAS_ID}/close`, validCloseBody()),
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
    retensi_inaktif: '3 Tahun',
    closed_at: '2026-05-29',
  }
}

function openBerkasDto() {
  return {
    id: BERKAS_ID,
    klasifikasi_id: KLASIFIKASI_ID,
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

function workflowItemDto() {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    berkas_id: BERKAS_ID,
    source_type: 'WORKFLOW',
    dokumen_id: DOKUMEN_ID,
    manual_arsip_id: null,
    canonical_arsip_id: CANONICAL_ARSIP_ID,
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
    canonical_arsip_id: CANONICAL_ARSIP_ID,
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
