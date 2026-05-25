import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  cleanupInvalidManualArchiveDevData,
  DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
  type DevManualArchiveCleanupDatabase,
  type DevManualArchiveCleanupFileDeleteOutcome,
  type DevManualArchiveCleanupStorage,
} from '#/lib/archive/dev-manual-archive-cleanup'

const INVALID_MANUAL_ID = '11111111-1111-4111-8111-111111111111'
const VALID_MANUAL_ID = '22222222-2222-4222-8222-222222222222'
const VALID_CANONICAL_ID = '33333333-3333-4333-8333-333333333333'
const WORKFLOW_CANONICAL_ID = '44444444-4444-4444-8444-444444444444'
const BROKEN_CANONICAL_ID = '55555555-5555-4555-8555-555555555555'
const INVALID_ATTACHMENT_ID = '66666666-6666-4666-8666-666666666666'
const VALID_ATTACHMENT_ID = '77777777-7777-4777-8777-777777777777'
const INVALID_LOGICAL_PATH = 'manual-dev/invalid/source.pdf'
const SECOND_INVALID_LOGICAL_PATH = 'manual-dev/invalid/second.pdf'
const VALID_LOGICAL_PATH = 'manual-dev/valid/source.pdf'
const WORKFLOW_LOGICAL_PATH = 'workflow/archive/snapshot.pdf'
const STORAGE_ROOT_MARKER = 'D:\\sensitive\\storage-root'
const TOKEN_MARKER = 'signed-token-secret'

describe('dev manual archive cleanup helper', () => {
  it('dry-run finds invalid manual rows but deletes no metadata and no physical files', async () => {
    const database = createFakeDatabase({
      manualRows: [invalidManualRow()],
      invalidAttachmentRows: [attachmentRow()],
    })
    const storage = createFakeStorage({ [INVALID_LOGICAL_PATH]: 'skipped' })

    const result = await cleanupInvalidManualArchiveDevData({
      database,
      storage,
    })

    expect(result).toMatchObject({
      mode: 'dry_run',
      status: 'completed',
      scannedManualRows: 1,
      invalidManualRows: 1,
      deletedManualRows: 0,
      scannedAttachmentRows: 1,
      deletedAttachmentRows: 0,
      attemptedFileDeleteCount: 1,
      deletedFileCount: 0,
      skippedFileCount: 1,
    })
    expect(storage.deleteLogicalFile).toHaveBeenCalledWith({
      logicalPath: INVALID_LOGICAL_PATH,
      dryRun: true,
    })
    expect(database.calls).not.toContainEqual(['delete', 'manualArsipAttachment'])
    expect(database.calls).not.toContainEqual(['delete', 'manualArsip'])
    expectNoLeak(result)
  })

  it('wrong confirmation rejects execute and deletes nothing', async () => {
    const database = createFakeDatabase({
      manualRows: [invalidManualRow()],
      invalidAttachmentRows: [attachmentRow()],
    })
    const storage = createFakeStorage({ [INVALID_LOGICAL_PATH]: 'deleted' })

    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: 'WRONG',
      database,
      storage,
    })

    expect(result).toEqual({
      mode: 'execute',
      status: 'rejected',
      scannedManualRows: 0,
      invalidManualRows: 0,
      deletedManualRows: 0,
      scannedAttachmentRows: 0,
      deletedAttachmentRows: 0,
      attemptedFileDeleteCount: 0,
      deletedFileCount: 0,
      alreadyMissingFileCount: 0,
      skippedFileCount: 0,
      failedFileDeleteCount: 0,
      protectedReferenceCount: 0,
      warnings: ['INVALID_CONFIRMATION'],
    })
    expect(database.calls).toEqual([])
    expect(storage.deleteLogicalFile).not.toHaveBeenCalled()
    expectNoLeak(result)
  })

  it('execute deletes invalid manual attachment metadata and manual rows after safe file deletion', async () => {
    const database = createFakeDatabase({
      manualRows: [invalidManualRow()],
      invalidAttachmentRows: [attachmentRow()],
    })
    const storage = createFakeStorage({ [INVALID_LOGICAL_PATH]: 'deleted' })

    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
      database,
      storage,
    })

    expect(result).toMatchObject({
      mode: 'execute',
      status: 'completed',
      invalidManualRows: 1,
      deletedManualRows: 1,
      deletedAttachmentRows: 1,
      attemptedFileDeleteCount: 1,
      deletedFileCount: 1,
    })
    expect(database.calls).toContainEqual(['transaction'])
    expect(database.calls).toContainEqual(['delete', 'manualArsipAttachment'])
    expect(database.calls).toContainEqual(['delete', 'manualArsip'])
    expect(storage.deleteLogicalFile).toHaveBeenCalledWith({
      logicalPath: INVALID_LOGICAL_PATH,
      dryRun: false,
    })
    expectNoLeak(result)
  })

  it('protects valid canonical MANUAL rows and does not delete their attachments', async () => {
    const database = createFakeDatabase({
      manualRows: [validManualRow()],
      protectedAttachmentRows: [attachmentRow({
        id: VALID_ATTACHMENT_ID,
        manual_arsip_id: VALID_MANUAL_ID,
        logical_path: VALID_LOGICAL_PATH,
      })],
    })
    const storage = createFakeStorage()

    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
      database,
      storage,
    })

    expect(result.invalidManualRows).toBe(0)
    expect(result.deletedManualRows).toBe(0)
    expect(result.deletedAttachmentRows).toBe(0)
    expect(result.warnings).toEqual(['MANUAL_ROW_HAS_VALID_CANONICAL_ARCHIVE'])
    expect(storage.deleteLogicalFile).not.toHaveBeenCalled()
    expect(database.calls).not.toContainEqual(['delete', 'manualArsip'])
    expectNoLeak(result)
  })

  it('does not touch WORKFLOW archive files referenced by canonical snapshots', async () => {
    const database = createFakeDatabase({
      manualRows: [invalidManualRow()],
      canonicalRows: [workflowCanonicalRow()],
      invalidAttachmentRows: [attachmentRow({ logical_path: WORKFLOW_LOGICAL_PATH })],
    })
    const storage = createFakeStorage({ [WORKFLOW_LOGICAL_PATH]: 'deleted' })

    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
      database,
      storage,
    })

    expect(result.protectedReferenceCount).toBe(1)
    expect(result.skippedFileCount).toBe(1)
    expect(result.deletedFileCount).toBe(0)
    expect(result.warnings).toEqual(['FILE_STILL_REFERENCED_BY_CANONICAL_ARCHIVE'])
    expect(storage.deleteLogicalFile).not.toHaveBeenCalled()
    expectNoLeak(result)
  })

  it('skips a file referenced by canonical arsip.lampiran_snapshot and does not leak it', async () => {
    const database = createFakeDatabase({
      manualRows: [invalidManualRow()],
      canonicalRows: [workflowCanonicalRow()],
      invalidAttachmentRows: [attachmentRow({ logical_path: WORKFLOW_LOGICAL_PATH })],
    })

    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
      database,
      storage: createFakeStorage(),
    })

    expect(result.protectedReferenceCount).toBe(1)
    expect(result.skippedFileCount).toBe(1)
    expect(result.warnings).toContain('FILE_STILL_REFERENCED_BY_CANONICAL_ARCHIVE')
    expectNoLeak(result)
  })

  it('skips unsafe traversal/root escape candidates and does not delete metadata for that row', async () => {
    const database = createFakeDatabase({
      manualRows: [invalidManualRow()],
      invalidAttachmentRows: [attachmentRow({ logical_path: '../outside.pdf' })],
    })
    const storage = createFakeStorage()

    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
      database,
      storage,
    })

    expect(result.status).toBe('partial')
    expect(result.deletedManualRows).toBe(0)
    expect(result.deletedAttachmentRows).toBe(0)
    expect(result.attemptedFileDeleteCount).toBe(0)
    expect(result.skippedFileCount).toBe(1)
    expect(result.warnings).toEqual(['UNSAFE_STORAGE_PATH'])
    expect(storage.deleteLogicalFile).not.toHaveBeenCalled()
    expectNoLeak(result)
  })

  it('counts missing files as alreadyMissing and does not leak paths', async () => {
    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
      database: createFakeDatabase({
        manualRows: [invalidManualRow()],
        invalidAttachmentRows: [attachmentRow()],
      }),
      storage: createFakeStorage({ [INVALID_LOGICAL_PATH]: 'already_missing' }),
    })

    expect(result.status).toBe('completed')
    expect(result.alreadyMissingFileCount).toBe(1)
    expect(result.deletedManualRows).toBe(1)
    expect(result.deletedAttachmentRows).toBe(1)
    expect(result.warnings).toEqual(['FILE_ALREADY_MISSING'])
    expectNoLeak(result)
  })

  it('returns partial on file deletion failure and does not over-delete metadata', async () => {
    const database = createFakeDatabase({
      manualRows: [invalidManualRow(), invalidManualRow({
        id: BROKEN_CANONICAL_ID,
        canonical_arsip_id: null,
      })],
      invalidAttachmentRows: [
        attachmentRow(),
        attachmentRow({
          id: VALID_ATTACHMENT_ID,
          manual_arsip_id: BROKEN_CANONICAL_ID,
          logical_path: SECOND_INVALID_LOGICAL_PATH,
        }),
      ],
    })

    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
      database,
      storage: createFakeStorage({
        [INVALID_LOGICAL_PATH]: 'deleted',
        [SECOND_INVALID_LOGICAL_PATH]: 'failed',
      }),
    })

    expect(result.status).toBe('partial')
    expect(result.invalidManualRows).toBe(2)
    expect(result.deletedManualRows).toBe(1)
    expect(result.deletedAttachmentRows).toBe(1)
    expect(result.deletedFileCount).toBe(1)
    expect(result.failedFileDeleteCount).toBe(1)
    expect(result.warnings).toEqual(['FILE_DELETE_FAILED'])
    expectNoLeak(result)
  })

  it('returns a safe DTO with no path, token, raw row, SQL, env, secret, session, or cookie details', async () => {
    const result = await cleanupInvalidManualArchiveDevData({
      dryRun: false,
      confirm: DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION,
      database: createFakeDatabase({
        manualRows: [invalidManualRow({
          token: TOKEN_MARKER,
          storageRoot: STORAGE_ROOT_MARKER,
          raw: { sql: 'select * from secret' },
        } as any)],
        invalidAttachmentRows: [attachmentRow()],
      }),
      storage: createFakeStorage({ [INVALID_LOGICAL_PATH]: 'deleted' }),
    })

    expect(result.status).toBe('completed')
    expectNoLeak(result)
  })

  it('does not import package/client fallback or old file recovery behavior', () => {
    const source = readFileSync(
      'src/lib/archive/dev-manual-archive-cleanup.ts',
      'utf8',
    ).toLowerCase()

    expect(source).not.toContain('@supabase')
    expect(source).not.toContain('supabase')
    expect(source).not.toContain('storage fallback')
    expect(source).not.toContain('old file recovery')
  })

  it('does not scan the broad storage root', () => {
    const source = readFileSync(
      'src/lib/archive/dev-manual-archive-cleanup.ts',
      'utf8',
    )

    expect(source).not.toContain('readdir')
    expect(source).not.toContain('scanLocalStorage')
    expect(source).not.toContain('analyzeLocalStorageReferences')
  })
})

type FakeDatabaseOptions = {
  manualRows?: unknown[]
  canonicalRows?: unknown[]
  protectedAttachmentRows?: unknown[]
  invalidAttachmentRows?: unknown[]
}

type FakeDatabase = DevManualArchiveCleanupDatabase & {
  calls: unknown[]
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  leftJoin: (...args: unknown[]) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  limit: (limit: number) => Promise<unknown[]>
  then: Promise<unknown[]>['then']
}

function createFakeDatabase(options: FakeDatabaseOptions): FakeDatabase {
  const calls: unknown[] = []
  let manualAttachmentSelectCount = 0
  const database: FakeDatabase = {
    calls,
    select(projection) {
      calls.push(['select', Object.keys(projection).sort()])

      let selectedTable: unknown
      const query: FakeQuery = {
        from(table) {
          selectedTable = table
          calls.push(['from', tableName(table)])
          return query
        },
        leftJoin() {
          calls.push(['leftJoin', tableName(selectedTable)])
          return query
        },
        where() {
          calls.push(['where', tableName(selectedTable)])
          return query
        },
        limit(limit) {
          calls.push(['limit', tableName(selectedTable), limit])
          if (selectedTable === manualArsipAttachment) {
            manualAttachmentSelectCount += 1
          }

          return Promise.resolve(rowsFor({
            table: selectedTable,
            options,
            manualAttachmentSelectCount,
          }))
        },
        then(onfulfilled, onrejected) {
          return Promise.resolve(rowsFor({
            table: selectedTable,
            options,
            manualAttachmentSelectCount,
          })).then(onfulfilled, onrejected)
        },
      }

      return query
    },
    delete(table) {
      calls.push(['delete', tableName(table)])
      return {
        where() {
          calls.push(['deleteWhere', tableName(table)])
          return Promise.resolve([])
        },
      }
    },
    transaction: async (callback) => {
      calls.push(['transaction'])
      return callback(database)
    },
  }

  return database
}

function rowsFor({
  table,
  options,
  manualAttachmentSelectCount,
}: {
  table: unknown
  options: FakeDatabaseOptions
  manualAttachmentSelectCount: number
}): unknown[] {
  if (table === manualArsip) return options.manualRows ?? []
  if (table === arsip) return options.canonicalRows ?? []
  if (table === manualArsipAttachment) {
    return manualAttachmentSelectCount === 1 && options.protectedAttachmentRows !== undefined
      ? options.protectedAttachmentRows ?? []
      : options.invalidAttachmentRows ?? []
  }

  return []
}

function createFakeStorage(
  outcomes: Record<string, DevManualArchiveCleanupFileDeleteOutcome> = {},
): DevManualArchiveCleanupStorage {
  return {
    deleteLogicalFile: vi.fn(async ({ logicalPath, dryRun }) => {
      if (dryRun) return 'skipped'
      return outcomes[logicalPath] ?? 'deleted'
    }),
  }
}

function invalidManualRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVALID_MANUAL_ID,
    canonical_arsip_id: null,
    canonical_id: null,
    canonical_source_type: null,
    ...overrides,
  }
}

function validManualRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_MANUAL_ID,
    canonical_arsip_id: VALID_CANONICAL_ID,
    canonical_id: VALID_CANONICAL_ID,
    canonical_source_type: 'MANUAL',
    ...overrides,
  }
}

function workflowCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKFLOW_CANONICAL_ID,
    source_type: 'WORKFLOW',
    lampiran_snapshot: [{ nama: 'Workflow file', url: WORKFLOW_LOGICAL_PATH }],
    ...overrides,
  }
}

function attachmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVALID_ATTACHMENT_ID,
    manual_arsip_id: INVALID_MANUAL_ID,
    logical_path: INVALID_LOGICAL_PATH,
    ...overrides,
  }
}

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === manualArsip) return 'manualArsip'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  return 'unknown'
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
  expect(serialized).not.toContain('manual-dev')
  expect(serialized).not.toContain('workflow/archive')
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
