import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  createUnifiedArchiveAttachmentFileResponse,
} from '#/lib/archive/unified-archive-file-actions'
import {
  destroyPhysicalFilesForDestroyedArchive,
  type PhysicalFileDeleteOutcome,
  type UnifiedArchivePhysicalDestructionDatabase,
  type UnifiedArchivePhysicalDestructionStorage,
} from '#/lib/archive/unified-archive-physical-destruction'

const WORKFLOW_ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const MANUAL_ARCHIVE_ID = '22222222-2222-4222-8222-222222222222'
const MANUAL_SOURCE_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444'
const WORKFLOW_LOGICAL_PATH = 'owner-user/workflow-doc/report.pdf'
const WORKFLOW_SECOND_LOGICAL_PATH = 'owner-user/workflow-doc/support.pdf'
const MANUAL_LOGICAL_PATH = 'manual-arsip/source-id/attachment.pdf'
const STORAGE_ROOT_MARKER = 'D:\\sensitive\\storage-root'
const TOKEN_MARKER = 'signed-token-secret'

describe('unified archive physical destruction helper', () => {
  it('returns not_destroyed for non-DIMUSNAHKAN archives and deletes nothing', async () => {
    const storage = createFakeStorage()

    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: WORKFLOW_ARCHIVE_ID,
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow({ status_arsip: 'USUL_MUSNAH' })],
      }),
      storage,
    })

    expect(result).toEqual({
      status: 'not_destroyed',
      archiveId: WORKFLOW_ARCHIVE_ID,
      sourceType: 'WORKFLOW',
      attemptedCount: 0,
      deletedCount: 0,
      alreadyMissingCount: 0,
      failedCount: 0,
      skippedCount: 0,
      warnings: [],
    })
    expect(storage.deleteLogicalFile).not.toHaveBeenCalled()
  })

  it('returns not_found for missing canonical archives and deletes nothing', async () => {
    const storage = createFakeStorage()

    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: WORKFLOW_ARCHIVE_ID,
      database: createFakeDatabase({ canonicalRows: [] }),
      storage,
    })

    expect(result.status).toBe('not_found')
    expect(result.sourceType).toBeNull()
    expect(result.attemptedCount).toBe(0)
    expect(storage.deleteLogicalFile).not.toHaveBeenCalled()
    expectNoLeak(result)
  })

  it('deletes only safe WORKFLOW snapshot file candidates for DIMUSNAHKAN archives', async () => {
    const storage = createFakeStorage({
      [WORKFLOW_LOGICAL_PATH]: 'deleted',
      [WORKFLOW_SECOND_LOGICAL_PATH]: 'deleted',
    })

    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: WORKFLOW_ARCHIVE_ID,
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow({
          lampiran_snapshot: [
            workflowSnapshotEntry(WORKFLOW_LOGICAL_PATH),
            workflowSnapshotEntry('../escape.pdf'),
            workflowSnapshotEntry(WORKFLOW_SECOND_LOGICAL_PATH),
          ],
        })],
      }),
      storage,
    })

    expect(result.status).toBe('partial')
    expect(result.attemptedCount).toBe(2)
    expect(result.deletedCount).toBe(2)
    expect(result.skippedCount).toBe(1)
    expect(result.warnings).toEqual(['UNSAFE_FILE_CANDIDATE_SKIPPED'])
    expect(storage.deleteLogicalFile).toHaveBeenCalledTimes(2)
    expect(storage.deleteLogicalFile).toHaveBeenCalledWith({
      logicalPath: WORKFLOW_LOGICAL_PATH,
      dryRun: false,
    })
    expect(storage.deleteLogicalFile).toHaveBeenCalledWith({
      logicalPath: WORKFLOW_SECOND_LOGICAL_PATH,
      dryRun: false,
    })
    expectNoLeak(result)
  })

  it('preserves WORKFLOW lampiran_snapshot and performs no DB metadata clearing', async () => {
    const snapshot = [workflowSnapshotEntry(WORKFLOW_LOGICAL_PATH)]
    const canonical = workflowCanonicalRow({ lampiran_snapshot: snapshot })
    const database = createFakeDatabase({ canonicalRows: [canonical] })

    await destroyPhysicalFilesForDestroyedArchive({
      archiveId: WORKFLOW_ARCHIVE_ID,
      database,
      storage: createFakeStorage({ [WORKFLOW_LOGICAL_PATH]: 'deleted' }),
    })

    expect(canonical.lampiran_snapshot).toBe(snapshot)
    expect(snapshot).toEqual([workflowSnapshotEntry(WORKFLOW_LOGICAL_PATH)])
    expect(database.update).not.toHaveBeenCalled()
    expect(database.delete).not.toHaveBeenCalled()
    expect(database.insert).not.toHaveBeenCalled()
  })

  it('deletes only linked MANUAL attachment file candidates for DIMUSNAHKAN archives', async () => {
    const storage = createFakeStorage({ [MANUAL_LOGICAL_PATH]: 'deleted' })

    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: MANUAL_ARCHIVE_ID,
      database: createFakeDatabase({
        canonicalRows: [manualCanonicalRow()],
        manualRows: [manualSourceRow()],
        manualAttachmentRows: [
          manualAttachmentRow({ logical_path: MANUAL_LOGICAL_PATH }),
        ],
      }),
      storage,
    })

    expect(result.status).toBe('completed')
    expect(result.sourceType).toBe('MANUAL')
    expect(result.attemptedCount).toBe(1)
    expect(result.deletedCount).toBe(1)
    expect(storage.deleteLogicalFile).toHaveBeenCalledWith({
      logicalPath: MANUAL_LOGICAL_PATH,
      dryRun: false,
    })
    expectNoLeak(result)
  })

  it('preserves MANUAL source and attachment rows without DB mutation', async () => {
    const manualSource = manualSourceRow()
    const attachment = manualAttachmentRow({ logical_path: MANUAL_LOGICAL_PATH })
    const database = createFakeDatabase({
      canonicalRows: [manualCanonicalRow()],
      manualRows: [manualSource],
      manualAttachmentRows: [attachment],
    })

    await destroyPhysicalFilesForDestroyedArchive({
      archiveId: MANUAL_ARCHIVE_ID,
      database,
      storage: createFakeStorage({ [MANUAL_LOGICAL_PATH]: 'deleted' }),
    })

    expect(manualSource).toEqual(manualSourceRow())
    expect(attachment).toEqual(manualAttachmentRow({ logical_path: MANUAL_LOGICAL_PATH }))
    expect(database.update).not.toHaveBeenCalled()
    expect(database.delete).not.toHaveBeenCalled()
    expect(database.insert).not.toHaveBeenCalled()
  })

  it('returns a controlled warning and deletes nothing when MANUAL source is missing', async () => {
    const storage = createFakeStorage()

    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: MANUAL_ARCHIVE_ID,
      database: createFakeDatabase({
        canonicalRows: [manualCanonicalRow()],
        manualRows: [],
      }),
      storage,
    })

    expect(result.status).toBe('skipped')
    expect(result.skippedCount).toBe(1)
    expect(result.warnings).toEqual(['MANUAL_SOURCE_MISSING'])
    expect(storage.deleteLogicalFile).not.toHaveBeenCalled()
    expectNoLeak(result)
  })

  it('counts missing physical files as already_missing without leaking paths', async () => {
    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: WORKFLOW_ARCHIVE_ID,
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow()],
      }),
      storage: createFakeStorage({ [WORKFLOW_LOGICAL_PATH]: 'already_missing' }),
    })

    expect(result.status).toBe('completed')
    expect(result.attemptedCount).toBe(1)
    expect(result.deletedCount).toBe(0)
    expect(result.alreadyMissingCount).toBe(1)
    expect(result.warnings).toEqual(['PHYSICAL_FILE_ALREADY_MISSING'])
    expectNoLeak(result)
  })

  it('rejects unsafe traversal/root-escape candidates without deleting them', async () => {
    const storage = createFakeStorage()

    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: WORKFLOW_ARCHIVE_ID,
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow({
          lampiran_snapshot: [
            workflowSnapshotEntry('../outside.pdf'),
            workflowSnapshotEntry('C:\\outside\\file.pdf'),
          ],
        })],
      }),
      storage,
    })

    expect(result.status).toBe('skipped')
    expect(result.attemptedCount).toBe(0)
    expect(result.skippedCount).toBe(2)
    expect(result.warnings).toEqual(['UNSAFE_FILE_CANDIDATE_SKIPPED'])
    expect(storage.deleteLogicalFile).not.toHaveBeenCalled()
    expectNoLeak(result)
  })

  it('reports partial failures safely without path leakage', async () => {
    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: WORKFLOW_ARCHIVE_ID,
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow({
          lampiran_snapshot: [
            workflowSnapshotEntry(WORKFLOW_LOGICAL_PATH),
            workflowSnapshotEntry(WORKFLOW_SECOND_LOGICAL_PATH),
          ],
        })],
      }),
      storage: createFakeStorage({
        [WORKFLOW_LOGICAL_PATH]: 'deleted',
        [WORKFLOW_SECOND_LOGICAL_PATH]: 'failed',
      }),
    })

    expect(result.status).toBe('partial')
    expect(result.attemptedCount).toBe(2)
    expect(result.deletedCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(result.warnings).toEqual(['PHYSICAL_FILE_DELETE_FAILED'])
    expectNoLeak(result)
  })

  it('returns a safe DTO without physical paths, logical paths, tokens, SQL, env, secrets, raw metadata, or raw rows', async () => {
    const result = await destroyPhysicalFilesForDestroyedArchive({
      archiveId: WORKFLOW_ARCHIVE_ID,
      approvedByUserId: TOKEN_MARKER,
      actorId: STORAGE_ROOT_MARKER,
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow({
          lampiran_snapshot: [{
            url: WORKFLOW_LOGICAL_PATH,
            token: TOKEN_MARKER,
            storageRoot: STORAGE_ROOT_MARKER,
            raw: { sql: 'select * from secret' },
          }],
        })],
      }),
      storage: createFakeStorage({ [WORKFLOW_LOGICAL_PATH]: 'deleted' }),
    })

    expect(result).toEqual({
      status: 'completed',
      archiveId: WORKFLOW_ARCHIVE_ID,
      sourceType: 'WORKFLOW',
      attemptedCount: 1,
      deletedCount: 1,
      alreadyMissingCount: 0,
      failedCount: 0,
      skippedCount: 0,
      warnings: [],
    })
    expectNoLeak(result)
  })

  it('does not import Supabase package, client, helper, fallback, or recovery behavior', () => {
    const source = readFileSync(
      'src/lib/archive/unified-archive-physical-destruction.ts',
      'utf8',
    ).toLowerCase()

    expect(source).not.toContain('@supabase')
    expect(source).not.toContain('supabase')
    expect(source).not.toContain('storage fallback')
    expect(source).not.toContain('old file recovery')
  })

  it('keeps stale preview/download behavior at 410 for DIMUSNAHKAN archives', async () => {
    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: WORKFLOW_ARCHIVE_ID,
      attachmentRef: 'workflow-1',
      purpose: 'preview',
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow()],
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(410)
    expect(body).toEqual({
      error: 'File arsip tidak tersedia karena arsip telah dimusnahkan',
    })
    expectNoLeak(body)
  })
})

type FakeDatabaseOptions = {
  canonicalRows?: unknown[]
  manualRows?: unknown[]
  manualAttachmentRows?: unknown[]
}

type FakeDatabase = UnifiedArchivePhysicalDestructionDatabase & {
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
}

function createFakeDatabase(options: FakeDatabaseOptions): FakeDatabase {
  return {
    select() {
      let selectedTable: unknown
      const query = {
        from(table: unknown) {
          selectedTable = table
          return query
        },
        where() {
          return query
        },
        limit() {
          return Promise.resolve(rowsFor(selectedTable, options))
        },
      }

      return query
    },
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  }
}

function rowsFor(table: unknown, options: FakeDatabaseOptions): unknown[] {
  if (table === arsip) return options.canonicalRows ?? []
  if (table === manualArsip) return options.manualRows ?? []
  if (table === manualArsipAttachment) return options.manualAttachmentRows ?? []
  return []
}

function createFakeStorage(
  outcomes: Record<string, PhysicalFileDeleteOutcome> = {},
): UnifiedArchivePhysicalDestructionStorage {
  return {
    deleteLogicalFile: vi.fn(async ({ logicalPath }) => outcomes[logicalPath] ?? 'deleted'),
  }
}

function workflowCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKFLOW_ARCHIVE_ID,
    source_type: 'WORKFLOW',
    status_arsip: 'DIMUSNAHKAN',
    lampiran_snapshot: [workflowSnapshotEntry(WORKFLOW_LOGICAL_PATH)],
    ...overrides,
  }
}

function manualCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_ARCHIVE_ID,
    source_type: 'MANUAL',
    status_arsip: 'DIMUSNAHKAN',
    lampiran_snapshot: null,
    ...overrides,
  }
}

function manualSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_SOURCE_ID,
    ...overrides,
  }
}

function manualAttachmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ATTACHMENT_ID,
    logical_path: MANUAL_LOGICAL_PATH,
    ...overrides,
  }
}

function workflowSnapshotEntry(url: string) {
  return {
    nama: 'Bukti',
    url,
  }
}

function expectNoLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('physicalPath')
  expect(serialized).not.toContain('lampiran_snapshot')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('owner-user')
  expect(serialized).not.toContain('workflow-doc')
  expect(serialized).not.toContain('manual-arsip')
  expect(serialized).not.toContain(STORAGE_ROOT_MARKER)
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('raw')
}
