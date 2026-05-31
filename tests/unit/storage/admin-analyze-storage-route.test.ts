import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  hasLocalRole: vi.fn(),
  analyzeLocalStorageReferences: vi.fn(),
  dbSelect: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: mocks.hasLocalRole,
}))

vi.mock('#/lib/storage/local-storage-diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/storage/local-storage-diagnostics')>()

  return {
    ...actual,
    analyzeLocalStorageReferences: mocks.analyzeLocalStorageReferences,
  }
})

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
  },
}))

vi.mock('#/db/schema/dokumen', () => ({
  dokumenTransaksi: {
    id: 'dokumen.id',
    lampiranUrls: 'dokumen.lampiranUrls',
  },
}))

vi.mock('#/db/schema/arsip', () => ({
  manualArsipAttachment: {
    id: 'manualArsipAttachment.id',
    logicalPath: 'manualArsipAttachment.logicalPath',
  },
}))

import { Route } from '#/routes/api/admin/analyze-storage'

type AnalyzeHandler = (args: { request: Request }) => Promise<Response>

const analyzeHandler = (Route as unknown as {
  options: { server: { handlers: { GET: AnalyzeHandler } } }
}).options.server.handlers.GET

const WORKFLOW_PATH = '11111111-1111-4111-8111-111111111111/dokumen/file.pdf'
const MANUAL_PATH = 'manual-arsip/11111111-1111-4111-8111-111111111111/file.pdf'
const ORPHAN_PATH = '11111111-1111-4111-8111-111111111111/orphan/file.pdf'

describe('/api/admin/analyze-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLocalServerSession.mockResolvedValue({
      userId: 'admin-user',
      roles: ['ADMIN'],
      activeRole: 'ADMIN',
    })
    mocks.hasLocalRole.mockReturnValue(true)
    mocks.dbSelect.mockReturnValue({ from: vi.fn().mockResolvedValue([]) })
    mocks.analyzeLocalStorageReferences.mockResolvedValue(analysisFixture())
  })

  it('rejects unauthenticated requests before analysis', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await analyzeHandler({
      request: new Request('http://localhost/api/admin/analyze-storage'),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.analyzeLocalStorageReferences).not.toHaveBeenCalled()
  })

  it('uses current workflow and manual attachment references and returns safe counts only', async () => {
    const response = await analyzeHandler({
      request: new Request('http://localhost/api/admin/analyze-storage'),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.analyzeLocalStorageReferences).toHaveBeenCalledWith({
      documents: [],
      manualAttachments: [],
    })
    expect(body).toMatchObject({
      referenced_paths_count: 2,
      orphan_count: 1,
      pending_count: 0,
      eligible_pending_count: 0,
      metadata_issue_counts: [],
    })
    expectNoPathLeak(body)
  })
})

function analysisFixture() {
  return {
    summary: {
      total_folders: 1,
      total_storage_files: 3,
      total_orphan_files: 1,
      total_referenced_files: 2,
      total_pending_files: 0,
      total_unsupported_files: 0,
      total_unsafe_files: 0,
      total_missing_referenced_files: 0,
      total_legacy_unsupported_metadata_references: 0,
      total_eligible_pending_files_for_default_cleanup: 0,
      total_recent_pending_files_for_default_cleanup: 0,
    },
    folder_details: {},
    orphan_paths: [ORPHAN_PATH],
    referenced_paths_count: 2,
    referenced_paths: [WORKFLOW_PATH, MANUAL_PATH],
    missing_referenced_paths: [],
    pending_paths: [],
    pending_path_details: [],
    eligible_pending_paths: [],
    recent_pending_paths: [],
    unsupported_paths: [],
    unsafe_paths: [],
    metadata_issues: [],
  }
}

function expectNoPathLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(WORKFLOW_PATH)
  expect(serialized).not.toContain(MANUAL_PATH)
  expect(serialized).not.toContain(ORPHAN_PATH)
  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('storage root')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
}
