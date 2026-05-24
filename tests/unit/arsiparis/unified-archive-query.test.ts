import { describe, expect, it } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  createUnifiedArchiveQueryReader,
  UNIFIED_ARCHIVE_QUERY_MAX_LIMIT,
  type UnifiedArchiveQueryReaderDatabase,
} from '#/lib/archive/unified-archive-query'

const WORKFLOW_ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const MANUAL_ARCHIVE_ID = '22222222-2222-4222-8222-222222222222'
const DOKUMEN_ID = '33333333-3333-4333-8333-333333333333'
const MANUAL_SOURCE_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '55555555-5555-4555-8555-555555555555'
const KLASIFIKASI_ID = '66666666-6666-4666-8666-666666666666'

describe('unified archive query reader', () => {
  it('maps WORKFLOW canonical row to safe unified DTO', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow()],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList()

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      id: WORKFLOW_ARCHIVE_ID,
      sourceType: 'WORKFLOW',
      statusArsip: 'AKTIF',
      namaArsip: 'Workflow Archive',
      nomorSurat: 'B-001',
      klasifikasiId: KLASIFIKASI_ID,
      tanggalArsip: '2026-05-24T00:00:00.000Z',
      nominalRealisasi: '100000.00',
      createdBy: USER_ID,
      archivedBy: USER_ID,
      hasWorkflowDocument: true,
      hasManualSource: false,
      sourceReferenceId: DOKUMEN_ID,
      attachmentCount: 2,
      warnings: [],
    })
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('maps MANUAL canonical row with joined manual source to safe unified DTO', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [manualCanonicalRow()],
      attachmentCountRows: [{
        manual_arsip_id: MANUAL_SOURCE_ID,
        attachment_count: '3',
      }],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList()

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      id: MANUAL_ARCHIVE_ID,
      sourceType: 'MANUAL',
      statusArsip: 'AKTIF',
      namaArsip: 'Manual Archive',
      hasWorkflowDocument: false,
      hasManualSource: true,
      sourceReferenceId: MANUAL_SOURCE_ID,
      attachmentCount: 3,
      warnings: [],
    })
    expect(result.summary.attachmentCountTotal).toBe(3)
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('adds controlled warning for MANUAL row missing manual source', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [manualCanonicalRow({ manual_source_id: null })],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList()

    expect(result.rows[0]).toMatchObject({
      hasManualSource: false,
      sourceReferenceId: null,
      warnings: ['MISSING_MANUAL_SOURCE'],
    })
    expect(result.summary.missingSourceCounts).toMatchObject({
      MISSING_MANUAL_SOURCE: 1,
    })
    expectNoMutationCalls(database)
  })

  it('adds controlled warning for WORKFLOW row without dokumen_id', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow({ dokumen_id: null })],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList()

    expect(result.rows[0]).toMatchObject({
      hasWorkflowDocument: false,
      sourceReferenceId: null,
      warnings: ['WORKFLOW_WITHOUT_DOKUMEN_ID'],
    })
    expect(result.summary.warningCounts).toMatchObject({
      WORKFLOW_WITHOUT_DOKUMEN_ID: 1,
    })
    expectNoMutationCalls(database)
  })

  it('adds controlled warning for MANUAL row with dokumen_id', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [manualCanonicalRow({ dokumen_id: DOKUMEN_ID })],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList()

    expect(result.rows[0]).toMatchObject({
      hasWorkflowDocument: false,
      hasManualSource: true,
      sourceReferenceId: MANUAL_SOURCE_ID,
      warnings: ['MANUAL_WITH_DOKUMEN_ID'],
    })
    expectNoMutationCalls(database)
  })

  it('filters by statusArsip', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow({ status_arsip: 'INAKTIF' })],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList({ statusArsip: 'INAKTIF' })

    expect(result.rows[0].statusArsip).toBe('INAKTIF')
    expect(database.calls).toContainEqual(['where', 'arsip'])
    expectNoMutationCalls(database)
  })

  it('filters by sourceType', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [manualCanonicalRow()],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList({ sourceType: 'MANUAL' })

    expect(result.rows[0].sourceType).toBe('MANUAL')
    expect(database.calls).toContainEqual(['where', 'arsip'])
    expectNoMutationCalls(database)
  })

  it('applies limit cap and bounded offset', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList({
      limit: 9999,
      offset: -10,
    })

    expect(database.calls).toContainEqual(['limit', 'arsip', UNIFIED_ARCHIVE_QUERY_MAX_LIMIT])
    expect(database.calls).toContainEqual(['offset', 'arsip', 0])
    expect(result.summary.appliedLimit).toBe(UNIFIED_ARCHIVE_QUERY_MAX_LIMIT)
    expect(result.summary.appliedOffset).toBe(0)
    expectNoMutationCalls(database)
  })

  it('aggregates source type, status, and warning summaries', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [
        workflowCanonicalRow({ dokumen_id: null }),
        manualCanonicalRow({ manual_source_id: null }),
        workflowCanonicalRow({
          id: '77777777-7777-4777-8777-777777777777',
          source_type: 'LEGACY',
          dokumen_id: null,
          lampiran_snapshot: null,
        }),
      ],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList()

    expect(result.summary.totalRowsReturned).toBe(3)
    expect(result.summary.sourceTypeCounts).toEqual({
      WORKFLOW: 1,
      MANUAL: 1,
      UNKNOWN: 1,
    })
    expect(result.summary.statusCounts).toEqual({
      AKTIF: 3,
    })
    expect(result.summary.warningCounts).toMatchObject({
      WORKFLOW_WITHOUT_DOKUMEN_ID: 1,
      MISSING_MANUAL_SOURCE: 1,
      UNKNOWN_SOURCE_TYPE: 1,
    })
    expectNoMutationCalls(database)
  })

  it('uses only safe attachment counts and does not expose filenames, paths, or tokens', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [
        manualCanonicalRow({
          logical_path: `${USER_ID}/manual/secret.pdf`,
          original_filename: 'secret.pdf',
          signed_url_token: 'secret-token',
        } as any),
      ],
      attachmentCountRows: [{
        manual_arsip_id: MANUAL_SOURCE_ID,
        attachment_count: '4',
        logical_path: `${USER_ID}/manual/secret.pdf`,
        original_filename: 'secret.pdf',
        metadata: { token: 'secret-token' },
      } as any],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList()

    expect(result.rows[0].attachmentCount).toBe(4)
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('does not call insert, update, delete, or transaction', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow()],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    await reader.getUnifiedArchiveList()

    expectNoMutationCalls(database)
  })

  it('does not leak logical paths, physical paths, URLs, tokens, SQL, env, secrets, or raw metadata', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [
        workflowCanonicalRow({
          lampiran_snapshot: [
            {
              nama: 'Sensitive Filename.pdf',
              url: `${USER_ID}/workflow/${WORKFLOW_ARCHIVE_ID}/secret.pdf`,
              token: 'signed-token-value',
              metadata: { secret: 'hidden' },
            },
          ],
        }),
      ],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList()

    expect(result.rows[0].attachmentCount).toBe(1)
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('defers search rather than running broad LIKE scans in this phase', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow()],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveQueryReader(database)

    const result = await reader.getUnifiedArchiveList({ search: 'archive' })

    expect(result.summary.deferredQueryOptions).toEqual(['search'])
    expect(result.rows).toHaveLength(1)
    expectNoMutationCalls(database)
  })
})

type FakeReadDatabase = UnifiedArchiveQueryReaderDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeReadDatabaseOptions = {
  canonicalRows: unknown[]
  attachmentCountRows: unknown[]
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  leftJoin: (...args: unknown[]) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  orderBy: (...args: unknown[]) => FakeQuery
  limit: (limit: number) => FakeQuery
  offset: (offset: number) => Promise<unknown[]>
  groupBy: (...args: unknown[]) => Promise<unknown[]>
}

function createFakeReadDatabase(options: FakeReadDatabaseOptions): FakeReadDatabase {
  const calls: unknown[] = []
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by unified archive query reader`)
  }

  return {
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
        leftJoin(_table) {
          calls.push(['leftJoin', tableName(selectedTable)])
          return query
        },
        where() {
          calls.push(['where', tableName(selectedTable)])
          return query
        },
        orderBy() {
          calls.push(['orderBy', tableName(selectedTable)])
          return query
        },
        limit(limit) {
          calls.push(['limit', tableName(selectedTable), limit])
          return query
        },
        offset(offset) {
          calls.push(['offset', tableName(selectedTable), offset])
          return Promise.resolve(rowsFor(selectedTable, options))
        },
        groupBy() {
          calls.push(['groupBy', tableName(selectedTable)])
          return Promise.resolve(rowsFor(selectedTable, options))
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

function rowsFor(table: unknown, options: FakeReadDatabaseOptions): unknown[] {
  if (table === arsip) return options.canonicalRows
  if (table === manualArsipAttachment) return options.attachmentCountRows
  return []
}

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === manualArsip) return 'manualArsip'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  return 'unknown'
}

function workflowCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKFLOW_ARCHIVE_ID,
    source_type: 'WORKFLOW',
    dokumen_id: DOKUMEN_ID,
    manual_source_id: null,
    status_arsip: 'AKTIF',
    nama_arsip: 'Workflow Archive',
    nomor_surat: 'B-001',
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'WF.01',
    klasifikasi_nama_snapshot: 'Workflow Classification',
    archived_at: '2026-05-24T00:00:00.000Z',
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    masa_aktif_berakhir: '2027-05-24',
    masa_inaktif_berakhir: '2030-05-24',
    nominal_realisasi: '100000.00',
    created_by: USER_ID,
    archived_by: USER_ID,
    created_at: '2026-05-24T00:00:00.000Z',
    updated_at: '2026-05-24T00:00:00.000Z',
    lampiran_snapshot: [
      { nama: 'Should Not Leak', url: `${USER_ID}/workflow/${WORKFLOW_ARCHIVE_ID}/a.pdf` },
      { nama: 'Should Not Leak 2', url: 'signed-token-like-value' },
    ],
    ...overrides,
  }
}

function manualCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_ARCHIVE_ID,
    source_type: 'MANUAL',
    dokumen_id: null,
    manual_source_id: MANUAL_SOURCE_ID,
    status_arsip: 'AKTIF',
    nama_arsip: 'Manual Archive',
    nomor_surat: 'M-001',
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'MA.01',
    klasifikasi_nama_snapshot: 'Manual Classification',
    archived_at: '2026-05-24T00:00:00.000Z',
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    masa_aktif_berakhir: '2027-05-24',
    masa_inaktif_berakhir: '2030-05-24',
    nominal_realisasi: '250000.00',
    created_by: USER_ID,
    archived_by: USER_ID,
    created_at: '2026-05-24T00:00:00.000Z',
    updated_at: '2026-05-24T00:00:00.000Z',
    lampiran_snapshot: null,
    ...overrides,
  }
}

function expectNoMutationCalls(database: FakeReadDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret.pdf')
  expect(serialized).not.toContain('Sensitive Filename')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('metadata')
  expect(serialized).not.toContain('secret')
}
