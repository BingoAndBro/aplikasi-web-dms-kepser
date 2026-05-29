import { describe, expect, it } from 'vitest'

import {
  arsip,
  arsipUsulMusnah,
  manualArsip,
  manualArsipAttachment,
  manualArsipCategory,
  masterKlasifikasiArsip,
} from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import {
  ketuaTimAssignments,
  masterDetailPermintaan,
  masterFungsi,
  masterJenisDokumen,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKelengkapanDokumen,
} from '#/db/schema/master'
import {
  analyzePhase13LegacyArchiveDevResetForDatabase,
  type Phase13LegacyArchiveDevResetAnalysisDatabase,
} from '#/lib/archive/phase13-legacy-archive-dev-reset-analysis'

describe('Phase 13 legacy archive dev reset analyze-only helper', () => {
  it('returns safe aggregate counts only and never calls mutation helpers', async () => {
    const database = createFakeAnalyzeOnlyDatabase([
      7,
      3,
      4,
      2,
      5,
      6,
      1,
      9,
      10,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      1,
      2,
      0,
    ])

    const analysis = await analyzePhase13LegacyArchiveDevResetForDatabase(database)

    expect(analysis).toEqual({
      archiveRowsCandidateCount: 7,
      archiveAttachmentSnapshotCandidateCount: 3,
      archivedWorkflowDocumentCandidateCount: 4,
      archivedWorkflowAttachmentMetadataCandidateCount: 2,
      manualArchiveRowsCandidateCount: 5,
      manualArchiveAttachmentCandidateCount: 6,
      lifecycleOrProposalRowsCandidateCount: 1,
      logRowsPotentiallyAffectedCount: 9,
      workflowDocumentRowsPreservedCount: 10,
      masterDataPreservedCount: 55,
      physicalFileDeletionPlanned: false,
      cleanupExecutionAllowedInThisPhase: false,
      warnings: [
        'ATTACHMENT_METADATA_COUNTS_ARE_METADATA_ROW_COUNTS_NOT_FILE_COUNTS',
        'CLEANUP_EXECUTION_DISABLED_IN_THIS_PHASE',
        'LOG_ROWS_ARE_PROTECTED_BY_DEFAULT_AND_COUNTED_ONLY_AS_POTENTIALLY_AFFECTED',
        'PHYSICAL_FILE_DELETION_OUT_OF_SCOPE',
        'WORKFLOW_ARCHIVE_LINKED_TO_NON_ARCHIVED_DOCUMENT_NOT_COUNTED',
        'WORKFLOW_ARCHIVE_WITHOUT_LINKED_DOCUMENT_NOT_COUNTED',
      ],
    })
    expect(database.calls).toEqual(expect.arrayContaining([
      ['from', 'arsip'],
      ['from', 'manualArsip'],
      ['from', 'manualArsipAttachment'],
      ['from', 'arsipUsulMusnah'],
      ['from', 'dokumenTransaksi'],
      ['from', 'logAktivitas'],
      ['from', 'masterFungsi'],
      ['from', 'masterKegiatan'],
      ['from', 'masterKelengkapanDokumen'],
      ['from', 'masterJenisPermintaan'],
      ['from', 'masterKategoriPermintaan'],
      ['from', 'masterDetailPermintaan'],
      ['from', 'masterJenisDokumen'],
      ['from', 'ketuaTimAssignments'],
      ['from', 'masterKlasifikasiArsip'],
      ['from', 'manualArsipCategory'],
    ]))
    expectNoMutationCalls(database)
    expectNoSensitiveAnalysisLeak(analysis)
  })
})

type FakeAnalyzeOnlyDatabase = Phase13LegacyArchiveDevResetAnalysisDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeSelectQuery = {
  from: (table: unknown) => FakeSelectQuery
  innerJoin: (...args: unknown[]) => FakeSelectQuery
  where: (...args: unknown[]) => FakeSelectQuery
  limit: (limit: number) => Promise<unknown[]>
}

function createFakeAnalyzeOnlyDatabase(counts: number[]): FakeAnalyzeOnlyDatabase {
  const calls: unknown[] = []
  const countQueue = [...counts]
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by Phase 13 analyze-only helper`)
  }

  return {
    calls,
    select(projection) {
      calls.push(['select', Object.keys(projection).sort()])

      let selectedTable: unknown
      const query: FakeSelectQuery = {
        from(table) {
          selectedTable = table
          calls.push(['from', tableName(table)])
          return query
        },
        innerJoin(table) {
          calls.push(['innerJoin', tableName(table)])
          return query
        },
        where() {
          calls.push(['where', tableName(selectedTable)])
          return query
        },
        limit(limit) {
          calls.push(['limit', tableName(selectedTable), limit])
          return Promise.resolve([{ count: countQueue.shift() ?? 0 }])
        },
      }

      return query
    },
    insert: () => mutation('insert'),
    update: () => mutation('update'),
    delete: () => mutation('delete'),
    transaction: () => mutation('transaction'),
  }
}

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === arsipUsulMusnah) return 'arsipUsulMusnah'
  if (table === manualArsip) return 'manualArsip'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  if (table === manualArsipCategory) return 'manualArsipCategory'
  if (table === masterKlasifikasiArsip) return 'masterKlasifikasiArsip'
  if (table === dokumenTransaksi) return 'dokumenTransaksi'
  if (table === logAktivitas) return 'logAktivitas'
  if (table === masterFungsi) return 'masterFungsi'
  if (table === masterKegiatan) return 'masterKegiatan'
  if (table === masterKelengkapanDokumen) return 'masterKelengkapanDokumen'
  if (table === masterJenisPermintaan) return 'masterJenisPermintaan'
  if (table === masterKategoriPermintaan) return 'masterKategoriPermintaan'
  if (table === masterDetailPermintaan) return 'masterDetailPermintaan'
  if (table === masterJenisDokumen) return 'masterJenisDokumen'
  if (table === ketuaTimAssignments) return 'ketuaTimAssignments'
  return 'unknown'
}

function expectNoMutationCalls(database: FakeAnalyzeOnlyDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveAnalysisLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
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
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('https://')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('secret')
}
