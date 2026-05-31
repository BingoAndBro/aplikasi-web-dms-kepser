import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  hasLocalRole: vi.fn(),
  analyzeLocalStorageReferences: vi.fn(),
  deleteLocalOrphanCandidates: vi.fn(),
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
    deleteLocalOrphanCandidates: mocks.deleteLocalOrphanCandidates,
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

import { Route } from '#/routes/api/admin/cleanup-orphan-files'

type CleanupHandler = (args: { request: Request }) => Promise<Response>

const cleanupHandler = (Route as unknown as {
  options: { server: { handlers: { GET: CleanupHandler, POST: CleanupHandler } } }
}).options.server.handlers

const ORPHAN_PATH = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf'
const OLD_PENDING_PATH = '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444_1778064971564_Bukti.pdf'
const RECENT_PENDING_PATH = '11111111-1111-4111-8111-111111111111/1778064971564-AbCd1234-Bukti.pdf'

describe('/api/admin/cleanup-orphan-files', () => {
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
    mocks.deleteLocalOrphanCandidates.mockResolvedValue({
      deletedCount: 1,
      missingCount: 0,
      failedCount: 0,
      failures: [],
    })
  })

  it('defaults to dry-run and does not call deletion', async () => {
    const response = await cleanupHandler.GET({
      request: new Request('http://localhost/api/admin/cleanup-orphan-files'),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      message: 'Cleanup dry-run',
      deleted_count: 0,
      orphan_count: 1,
      dry_run: true,
      pending_only: false,
      include_pending: false,
    })
    expectNoPathLeak(body)
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('keeps GET dry_run=false non-destructive and reports POST requirement', async () => {
    const response = await cleanupHandler.GET({
      request: new Request('http://localhost/api/admin/cleanup-orphan-files?dry_run=false'),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      message: 'Destructive cleanup requires POST.',
      deleted_count: 0,
      orphan_count: 1,
      dry_run: true,
      pending_count: 2,
      eligible_pending_count: 0,
      skipped_pending_count: 2,
    })
    expectNoPathLeak(body)
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests before analysis', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await cleanupHandler.GET({
      request: new Request('http://localhost/api/admin/cleanup-orphan-files'),
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mocks.analyzeLocalStorageReferences).not.toHaveBeenCalled()
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('rejects non-admin requests before analysis', async () => {
    mocks.hasLocalRole.mockReturnValue(false)

    const response = await cleanupHandler.POST({
      request: jsonRequest({ dry_run: false, confirm: true }),
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'Akses ditolak - hanya admin' })
    expect(mocks.analyzeLocalStorageReferences).not.toHaveBeenCalled()
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('rejects cross-origin POST before auth and analysis', async () => {
    const response = await cleanupHandler.POST({
      request: jsonRequest({ dry_run: false, confirm: true }, 'https://evil.example'),
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.analyzeLocalStorageReferences).not.toHaveBeenCalled()
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('keeps POST without confirm non-destructive even when dry_run=false', async () => {
    const response = await cleanupHandler.POST({
      request: jsonRequest({ dry_run: false }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      message: 'Cleanup dry-run; destructive cleanup requires confirm=true.',
      deleted_count: 0,
      orphan_count: 1,
      dry_run: true,
      pending_cleanup_confirmed: false,
    })
    expectNoPathLeak(body)
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('keeps POST dry_run=true non-destructive', async () => {
    const response = await cleanupHandler.POST({
      request: jsonRequest({ dry_run: true, confirm: true }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      message: 'Cleanup dry-run',
      deleted_count: 0,
      orphan_count: 1,
      dry_run: true,
      pending_cleanup_confirmed: true,
    })
    expectNoPathLeak(body)
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('deletes only non-pending orphan candidates with POST dry_run=false and confirm=true', async () => {
    const response = await cleanupHandler.POST({
      request: jsonRequest({ dry_run: false, confirm: true }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      message: 'Cleanup berhasil',
      deleted_count: 1,
      orphan_count: 1,
      pending_count: 2,
      eligible_pending_count: 0,
      skipped_pending_count: 2,
    })
    expectNoPathLeak(body)
    expect(mocks.deleteLocalOrphanCandidates).toHaveBeenCalledWith([ORPHAN_PATH], {
      allowedClassifications: ['formal'],
    })
  })

  it('reports pending-only candidates without deleting unless pending deletion is explicitly armed', async () => {
    const response = await cleanupHandler.POST({
      request: jsonRequest({
        dry_run: false,
        pending_only: true,
        include_pending: true,
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      deleted_count: 0,
      orphan_count: 0,
      pending_only: true,
      include_pending: true,
      pending_cleanup_confirmed: false,
      eligible_pending_count: 1,
      skipped_pending_count: 2,
    })
    expectNoPathLeak(body)
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('reports eligible pending candidates consistently during explicit pending-only dry-run', async () => {
    const response = await cleanupHandler.GET({
      request: new Request('http://localhost/api/admin/cleanup-orphan-files?pending_only=true&dry_run=true&include_pending=true&confirm=true&min_age_minutes=0'),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      message: 'Cleanup pending dry-run',
      deleted_count: 0,
      orphan_count: 0,
      dry_run: true,
      pending_only: true,
      include_pending: true,
      pending_cleanup_confirmed: true,
      min_age_minutes: 0,
      eligible_pending_count: 2,
      skipped_recent_pending_count: 0,
      skipped_pending_count: 2,
    })
    expectNoPathLeak(body)
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })

  it('deletes eligible pending files only with POST dry_run=false, include_pending=true, and confirm=true', async () => {
    const response = await cleanupHandler.POST({
      request: jsonRequest({
        dry_run: false,
        pending_only: true,
        include_pending: true,
        confirm: true,
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      deleted_count: 1,
      orphan_count: 0,
      eligible_pending_count: 1,
      skipped_recent_pending_count: 1,
      skipped_pending_count: 1,
    })
    expectNoPathLeak(body)
    expect(mocks.deleteLocalOrphanCandidates).toHaveBeenCalledWith([OLD_PENDING_PATH], {
      allowedClassifications: ['formal', 'pending-dash', 'pending-upload-api'],
    })
  })

  it('rejects invalid POST body values with 400', async () => {
    const response = await cleanupHandler.POST({
      request: jsonRequest({ dry_run: 'false', confirm: true }),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Body cleanup tidak valid')
    expect(mocks.deleteLocalOrphanCandidates).not.toHaveBeenCalled()
  })
})

function analysisFixture() {
  return {
    summary: {
      total_folders: 1,
      total_storage_files: 3,
      total_orphan_files: 1,
      total_referenced_files: 0,
      total_pending_files: 2,
      total_unsupported_files: 0,
      total_unsafe_files: 0,
      total_missing_referenced_files: 0,
      total_legacy_unsupported_metadata_references: 0,
      total_eligible_pending_files_for_default_cleanup: 1,
      total_recent_pending_files_for_default_cleanup: 1,
    },
    folder_details: {},
    orphan_paths: [ORPHAN_PATH],
    referenced_paths_count: 0,
    referenced_paths: [],
    missing_referenced_paths: [],
    pending_paths: [OLD_PENDING_PATH, RECENT_PENDING_PATH].sort(),
    pending_path_details: [
      {
        path: OLD_PENDING_PATH,
        classification: 'pending-upload-api',
        age_minutes: 1500,
        last_modified_at: '2026-05-18T23:00:00.000Z',
        eligible_for_cleanup_default: true,
      },
      {
        path: RECENT_PENDING_PATH,
        classification: 'pending-dash',
        age_minutes: 5,
        last_modified_at: '2026-05-19T23:55:00.000Z',
        eligible_for_cleanup_default: false,
      },
    ],
    eligible_pending_paths: [OLD_PENDING_PATH],
    recent_pending_paths: [RECENT_PENDING_PATH],
    unsupported_paths: [],
    unsafe_paths: [],
    metadata_issues: [],
  }
}

function expectNoPathLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(ORPHAN_PATH)
  expect(serialized).not.toContain(OLD_PENDING_PATH)
  expect(serialized).not.toContain(RECENT_PENDING_PATH)
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

function jsonRequest(body: unknown, origin = 'http://localhost'): Request {
  return new Request('http://localhost/api/admin/cleanup-orphan-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
}
