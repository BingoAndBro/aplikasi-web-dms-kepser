import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  arsip,
  arsipUsulMusnah,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import {
  PHASE13_LEGACY_ARCHIVE_DEV_RESET_CONFIRMATION,
  resetPhase13LegacyArchiveDevDataForDatabase,
  type Phase13LegacyArchiveDevResetExecutionDatabase,
} from '#/lib/archive/phase13-legacy-archive-dev-reset-execution'

const STORAGE_ROOT_MARKER = 'D:\\sensitive\\storage-root'
const TOKEN_MARKER = 'signed-token-secret'
const RAW_ROW_ID_MARKER = '11111111-1111-4111-8111-111111111111'

describe('Phase 13 legacy archive dev reset execution helper', () => {
  it('requires exact confirmation before transaction or mutation', async () => {
    for (const confirmation of [
      undefined,
      '',
      'reset legacy archive dev data for phase 13',
      ` ${PHASE13_LEGACY_ARCHIVE_DEV_RESET_CONFIRMATION}`,
      `${PHASE13_LEGACY_ARCHIVE_DEV_RESET_CONFIRMATION} `,
    ]) {
      const database = createFakeExecutionDatabase()

      await expect(resetPhase13LegacyArchiveDevDataForDatabase(database, {
        mode: 'execute',
        confirmation,
      })).rejects.toThrow('confirmation mismatch')

      expect(database.calls).toEqual([])
    }
  })

  it('keeps analyze mode mutation-free', async () => {
    const database = createFakeExecutionDatabase({
      analysisCounts: defaultAnalysisCounts(),
    })

    const result = await resetPhase13LegacyArchiveDevDataForDatabase(database, {
      mode: 'analyze',
    })

    expect(result).toMatchObject({
      archiveRowsCandidateCount: 8,
      archivedWorkflowDocumentCandidateCount: 4,
      manualArchiveRowsCandidateCount: 4,
      physicalFileDeletionPlanned: false,
      cleanupExecutionAllowedInThisPhase: false,
    })
    expect(database.calls).not.toContainEqual(['transaction'])
    expect(database.calls).not.toContainEqual(['delete', 'arsip'])
    expect(database.calls).not.toContainEqual(['delete', 'dokumenTransaksi'])
    expectNoLeak(result)
  })

  it('executes only inside a transaction and returns aggregate-only counts', async () => {
    const database = createFakeExecutionDatabase({
      analysisCounts: defaultAnalysisCounts(),
      candidateArchiveRows: rows(8),
      candidateManualRows: rows(4),
      candidateArchivedWorkflowDocumentRows: rows(4),
      deletedRowsByTable: {
        arsipUsulMusnah: 1,
        manualArsipAttachment: 3,
        manualArsip: 4,
        arsip: 8,
        logAktivitas: 25,
        dokumenTransaksi: 4,
      },
    })

    const result = await resetPhase13LegacyArchiveDevDataForDatabase(database, {
      mode: 'execute',
      confirmation: PHASE13_LEGACY_ARCHIVE_DEV_RESET_CONFIRMATION,
    })

    expect(result).toEqual({
      deletedArchiveRowsCount: 8,
      deletedArchiveSnapshotMetadataCount: 3,
      deletedArchivedWorkflowDocumentsCount: 4,
      deletedArchivedWorkflowAttachmentMetadataCount: 4,
      deletedManualArchiveRowsCount: 4,
      deletedManualArchiveAttachmentRowsCount: 3,
      deletedLifecycleOrProposalRowsCount: 1,
      deletedLogRowsCount: 25,
      physicalFileDeletionPerformed: false,
      warnings: [
        'ATTACHMENT_METADATA_COUNTS_ARE_METADATA_ROW_COUNTS_NOT_FILE_COUNTS',
        'LOG_ROWS_DELETED_BY_NARROW_DEV_RESET_EXCEPTION',
        'PHYSICAL_FILE_DELETION_OUT_OF_SCOPE',
      ],
    })
    expect(database.calls).toContainEqual(['transaction'])
    expectDeleteOrder(database.calls, [
      'arsipUsulMusnah',
      'manualArsipAttachment',
      'manualArsip',
      'arsip',
      'logAktivitas',
      'dokumenTransaksi',
    ])
    expectNoLeak(result)
  })

  it('does not touch protected tables, storage, routes, packages, or Supabase fallback', async () => {
    const database = createFakeExecutionDatabase({
      analysisCounts: defaultAnalysisCounts(),
      candidateArchiveRows: rows(1),
      candidateManualRows: rows(1),
      candidateArchivedWorkflowDocumentRows: rows(1),
      deletedRowsByTable: {
        arsipUsulMusnah: 0,
        manualArsipAttachment: 1,
        manualArsip: 1,
        arsip: 1,
        logAktivitas: 1,
        dokumenTransaksi: 1,
      },
    })

    const result = await resetPhase13LegacyArchiveDevDataForDatabase(database, {
      mode: 'execute',
      confirmation: PHASE13_LEGACY_ARCHIVE_DEV_RESET_CONFIRMATION,
    })
    const deletedTables = database.calls
      .filter((call): call is ['delete', string] => Array.isArray(call) && call[0] === 'delete')
      .map(([, table]) => table)

    expect(deletedTables).toEqual([
      'arsipUsulMusnah',
      'manualArsipAttachment',
      'manualArsip',
      'arsip',
      'logAktivitas',
      'dokumenTransaksi',
    ])
    expect(deletedTables).not.toContain('users')
    expect(deletedTables).not.toContain('roles')
    expect(deletedTables).not.toContain('sessions')
    expect(deletedTables).not.toContain('manualArsipCategory')
    expect(result.physicalFileDeletionPerformed).toBe(false)
    expectNoLeak(result)

    const source = readFileSync(
      'src/lib/archive/phase13-legacy-archive-dev-reset-execution.ts',
      'utf8',
    )

    expect(source).not.toContain('@supabase')
    expect(source.toLowerCase()).not.toContain('storage fallback')
    expect(source.toLowerCase()).not.toContain('old file recovery')
    expect(source).not.toContain('getLocalStorageRoot')
    expect(source).not.toContain('resolvePhysicalStoragePath')
    expect(source).not.toContain('src/routeTree.gen')
    expect(source).not.toContain('package.json')
  })
})

type FakeExecutionDatabaseOptions = {
  analysisCounts?: number[]
  candidateArchiveRows?: Array<{ id: string | null }>
  candidateManualRows?: Array<{ id: string | null }>
  candidateArchivedWorkflowDocumentRows?: Array<{ id: string | null }>
  deletedRowsByTable?: Partial<Record<string, number>>
}

type FakeExecutionDatabase = Phase13LegacyArchiveDevResetExecutionDatabase & {
  calls: unknown[]
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  innerJoin: (...args: unknown[]) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  limit: (limit: number) => Promise<unknown[]>
  then: Promise<unknown[]>['then']
}

function createFakeExecutionDatabase(
  options: FakeExecutionDatabaseOptions = {},
): FakeExecutionDatabase {
  const calls: unknown[] = []
  const analysisCounts = [...(options.analysisCounts ?? defaultAnalysisCounts())]
  const selectedTableCounts = new Map<string, number>()

  const database: FakeExecutionDatabase = {
    calls,
    select(projection) {
      calls.push(['select', Object.keys(projection).sort()])
      let selectedTable: unknown
      let joinedDokumen = false

      const resolveRows = () => {
        const name = tableName(selectedTable)
        const count = (selectedTableCounts.get(name) ?? 0) + 1
        selectedTableCounts.set(name, count)

        if (Object.keys(projection).includes('count')) {
          return [{ count: analysisCounts.shift() ?? 0 }]
        }

        if (selectedTable === arsip && joinedDokumen) {
          return options.candidateArchivedWorkflowDocumentRows ?? []
        }
        if (selectedTable === arsip) return options.candidateArchiveRows ?? []
        if (selectedTable === manualArsip) return options.candidateManualRows ?? []

        return []
      }

      const query: FakeQuery = {
        from(table) {
          selectedTable = table
          calls.push(['from', tableName(table)])
          return query
        },
        innerJoin(table) {
          if (table === dokumenTransaksi) joinedDokumen = true
          calls.push(['innerJoin', tableName(table)])
          return query
        },
        where() {
          calls.push(['where', tableName(selectedTable)])
          return query
        },
        limit(limit) {
          calls.push(['limit', tableName(selectedTable), limit])
          return Promise.resolve(resolveRows())
        },
        then(onfulfilled, onrejected) {
          return Promise.resolve(resolveRows()).then(onfulfilled, onrejected)
        },
      }

      return query
    },
    delete(table) {
      const name = tableName(table)
      calls.push(['delete', name])

      return {
        where() {
          calls.push(['deleteWhere', name])

          return {
            returning() {
              calls.push(['returning', name])
              return Promise.resolve(rows(options.deletedRowsByTable?.[name] ?? 0))
            },
          }
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

function defaultAnalysisCounts(): number[] {
  return [
    8,
    3,
    4,
    4,
    4,
    3,
    1,
    25,
    6,
    10,
    8,
    7,
    6,
    5,
    4,
    3,
    2,
    20,
    10,
    0,
    0,
    0,
  ]
}

function rows(count: number): Array<{ id: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? RAW_ROW_ID_MARKER : `${index}`,
  }))
}

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === arsipUsulMusnah) return 'arsipUsulMusnah'
  if (table === manualArsip) return 'manualArsip'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  if (table === dokumenTransaksi) return 'dokumenTransaksi'
  if (table === logAktivitas) return 'logAktivitas'
  return 'unknown'
}

function expectDeleteOrder(calls: unknown[], expectedTables: string[]): void {
  const actual = calls
    .filter((call): call is ['delete', string] => Array.isArray(call) && call[0] === 'delete')
    .map(([, table]) => table)

  expect(actual).toEqual(expectedTables)
}

function expectNoLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  expect(serialized).not.toContain(RAW_ROW_ID_MARKER)
  expect(serialized).not.toContain('"id"')
  expect(serialized).not.toContain('Id"')
  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physicalPath')
  expect(serialized).not.toContain('storageRoot')
  expect(serialized).not.toContain('storage_root')
  expect(serialized).not.toContain('manual-arsip')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain(TOKEN_MARKER)
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain(STORAGE_ROOT_MARKER)
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('https://')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('secret')
}
