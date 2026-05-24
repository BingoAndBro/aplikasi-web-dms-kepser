import { describe, expect, it } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  createUnifiedArchiveCompatibilityReader,
  UNIFIED_ARCHIVE_COMPATIBILITY_READER_MAX_LIMIT,
  type UnifiedArchiveCompatibilityReaderDatabase,
} from '#/lib/archive/unified-compatibility-reader'

const WORKFLOW_ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const KLASIFIKASI_ID = '44444444-4444-4444-8444-444444444444'
const MANUAL_ARCHIVE_ID = '55555555-5555-4555-8555-555555555555'

describe('unified archive compatibility reader', () => {
  it('maps workflow and manual archive rows into one compatibility report', async () => {
    const database = createFakeReadDatabase({
      workflowRows: [workflowRow()],
      manualRows: [manualRow()],
      attachmentCountRows: [{
        manual_arsip_id: MANUAL_ARCHIVE_ID,
        attachment_count: '2',
      }],
    })
    const reader = createUnifiedArchiveCompatibilityReader(database)

    const report = await reader.getUnifiedArchiveCompatibilityReport()

    expect(report.rows).toHaveLength(2)
    expect(report.rows[0]).toMatchObject({
      source_type: 'WORKFLOW',
      source_id: WORKFLOW_ARCHIVE_ID,
      canonical_archive_id: WORKFLOW_ARCHIVE_ID,
      dokumen_transaksi_id: DOKUMEN_ID,
      nama_arsip: 'Workflow Archive',
      attachment_count: 2,
    })
    expect(report.rows[1]).toMatchObject({
      source_type: 'MANUAL',
      source_id: MANUAL_ARCHIVE_ID,
      canonical_archive_id: null,
      dokumen_transaksi_id: null,
      nama_arsip: 'Manual Archive',
      klasifikasi_kode_snapshot: 'MA.01',
      attachment_count: 2,
    })
    expect(report.summary.total_rows).toBe(2)
    expect(report.summary.by_source_type).toEqual({
      WORKFLOW: 1,
      MANUAL: 1,
    })
    expectNoSensitiveReportLeak(report)
    expectNoMutationCalls(database)
  })

  it('applies status_arsip filters to workflow and manual reads', async () => {
    const database = createFakeReadDatabase({
      workflowRows: [workflowRow({ status_arsip: 'INAKTIF' })],
      manualRows: [manualRow({ status_arsip: 'INAKTIF' })],
      attachmentCountRows: [{
        manual_arsip_id: MANUAL_ARCHIVE_ID,
        attachment_count: 1,
      }],
    })
    const reader = createUnifiedArchiveCompatibilityReader(database)

    const report = await reader.getUnifiedArchiveCompatibilityReport({
      status_arsip: 'INAKTIF',
    })

    expect(report.rows.map((row) => row.status_arsip)).toEqual(['INAKTIF', 'INAKTIF'])
    expect(database.calls).toContainEqual(['where', 'arsip'])
    expect(database.calls).toContainEqual(['where', 'manualArsip'])
    expectNoMutationCalls(database)
  })

  it('caps workflow and manual read limits', async () => {
    const database = createFakeReadDatabase({
      workflowRows: [workflowRow()],
      manualRows: [manualRow()],
      attachmentCountRows: [],
    })
    const reader = createUnifiedArchiveCompatibilityReader(database)

    await reader.getUnifiedArchiveCompatibilityReport({
      limit: 9999,
    })

    expect(database.calls).toContainEqual([
      'limit',
      'arsip',
      UNIFIED_ARCHIVE_COMPATIBILITY_READER_MAX_LIMIT,
    ])
    expect(database.calls).toContainEqual([
      'limit',
      'manualArsip',
      UNIFIED_ARCHIVE_COMPATIBILITY_READER_MAX_LIMIT,
    ])
    expectNoMutationCalls(database)
  })

  it('returns only numeric manual attachment counts and omits attachment file fields', async () => {
    const database = createFakeReadDatabase({
      workflowRows: [],
      manualRows: [
        {
          ...manualRow(),
          logical_path: `${USER_ID}/manual/${MANUAL_ARCHIVE_ID}/secret.pdf`,
          original_filename: 'secret.pdf',
          signed_url_token: 'secret-token',
        } as any,
      ],
      attachmentCountRows: [{
        manual_arsip_id: MANUAL_ARCHIVE_ID,
        attachment_count: '7',
        logical_path: `${USER_ID}/manual/${MANUAL_ARCHIVE_ID}/secret.pdf`,
      } as any],
    })
    const reader = createUnifiedArchiveCompatibilityReader(database)

    const report = await reader.getUnifiedArchiveCompatibilityReport()

    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].attachment_count).toBe(7)
    expectNoSensitiveReportLeak(report)
    expectNoMutationCalls(database)
  })
})

type FakeReadDatabase = UnifiedArchiveCompatibilityReaderDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeReadDatabaseOptions = {
  workflowRows: unknown[]
  manualRows: unknown[]
  attachmentCountRows: unknown[]
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  leftJoin: (...args: unknown[]) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  orderBy: (...args: unknown[]) => FakeQuery
  limit: (limit: number) => Promise<unknown[]>
  groupBy: (...args: unknown[]) => Promise<unknown[]>
}

function createFakeReadDatabase(options: FakeReadDatabaseOptions): FakeReadDatabase {
  const calls: unknown[] = []
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by compatibility reader`)
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
  if (table === arsip) return options.workflowRows
  if (table === manualArsip) return options.manualRows
  if (table === manualArsipAttachment) return options.attachmentCountRows
  return []
}

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === manualArsip) return 'manualArsip'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  return 'unknown'
}

function workflowRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKFLOW_ARCHIVE_ID,
    source_type: 'WORKFLOW',
    dokumen_id: DOKUMEN_ID,
    nama_arsip: 'Workflow Archive',
    document_title: 'Workflow Document',
    nomor_surat: 'B-123',
    klasifikasi: null,
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'WF.01',
    klasifikasi_nama_snapshot: 'Workflow Classification',
    archived_at: '2026-05-01T00:00:00.000Z',
    archived_by: USER_ID,
    created_by: USER_ID,
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    masa_aktif_berakhir: '2027-05-01',
    masa_inaktif_berakhir: '2030-05-01',
    nominal_realisasi: '100000',
    status_arsip: 'AKTIF',
    lampiran_snapshot: [
      {
        nama: 'Hidden Attachment',
        url: `${USER_ID}/workflow/${WORKFLOW_ARCHIVE_ID}/secret.pdf`,
      },
      {
        nama: 'Hidden Attachment 2',
        url: 'signedUrl-token-value',
      },
    ],
    ...overrides,
  }
}

function manualRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_ARCHIVE_ID,
    nama: 'Manual Archive',
    tanggal: '2026-05-10',
    created_at: '2026-05-10T10:00:00.000Z',
    created_by: USER_ID,
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'MA.01',
    klasifikasi_nama_snapshot: 'Manual Classification',
    nominal_realisasi: '250000',
    status_arsip: 'AKTIF',
    ...overrides,
  }
}

function expectNoMutationCalls(database: FakeReadDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveReportLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
}
