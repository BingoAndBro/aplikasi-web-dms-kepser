import { describe, expect, it } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  classifyManualArchiveRemediationRow,
  createManualArchiveRemediationReportReader,
  MANUAL_ARCHIVE_REMEDIATION_BUCKET,
  MANUAL_ARCHIVE_REMEDIATION_REPORT_MAX_LIMIT,
  MANUAL_ARCHIVE_REMEDIATION_WARNING,
  summarizeManualArchiveRemediationRows,
  type ManualArchiveRemediationReportReaderDatabase,
  type ManualArchiveRemediationRowInput,
} from '#/lib/archive/manual-archive-remediation-report'

const MANUAL_ARSIP_ID = '11111111-1111-4111-8111-111111111111'
const CANONICAL_ARSIP_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const KLASIFIKASI_ID = '44444444-4444-4444-8444-444444444444'

describe('manual archive remediation report helper', () => {
  it('classifies an unlinked complete AKTIF row as ready for canonicalization', () => {
    const row = classifyManualArchiveRemediationRow(completeInput({
      nominalRealisasi: '250000.00',
    }))

    expect(row).toMatchObject({
      manualArsipId: MANUAL_ARSIP_ID,
      canonicalArsipId: null,
      statusArsip: 'AKTIF',
      buckets: [MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION],
      missingFields: [],
      warnings: [],
      attachmentCount: 0,
      namaArsip: 'Manual Archive',
      tanggalDiarsipkan: '2026-05-24',
    })
  })

  it('classifies a linked row with MANUAL canonical source type as linked ok', () => {
    const row = classifyManualArchiveRemediationRow(completeInput({
      canonicalArsipId: CANONICAL_ARSIP_ID,
      linkedCanonicalArsipId: CANONICAL_ARSIP_ID,
      linkedCanonicalSourceType: 'MANUAL',
    }))

    expect(row.buckets).toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_OK)
    expect(row.buckets).not.toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION)
  })

  it('classifies a linked row with missing canonical target as linked broken', () => {
    const row = classifyManualArchiveRemediationRow(completeInput({
      canonicalArsipId: CANONICAL_ARSIP_ID,
      linkedCanonicalArsipId: null,
      linkedCanonicalSourceType: null,
    }))

    expect(row.buckets).toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_BROKEN)
    expect(row.buckets).not.toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION)
  })

  it('classifies a linked row with non-MANUAL canonical source type as wrong source type', () => {
    const row = classifyManualArchiveRemediationRow(completeInput({
      canonicalArsipId: CANONICAL_ARSIP_ID,
      linkedCanonicalArsipId: CANONICAL_ARSIP_ID,
      linkedCanonicalSourceType: 'WORKFLOW',
    }))

    expect(row.buckets).toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_WRONG_SOURCE_TYPE)
    expect(row.buckets).not.toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION)
  })

  it('defers non-AKTIF rows and does not classify them as ready', () => {
    for (const statusArsip of ['INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN'] as const) {
      const row = classifyManualArchiveRemediationRow(completeInput({
        statusArsip,
      }))

      expect(row.buckets).toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.NON_AKTIF_DEFERRED)
      expect(row.buckets).not.toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION)
    }
  })

  it('reports missing required metadata with controlled field labels', () => {
    const row = classifyManualArchiveRemediationRow(completeInput({
      nama: ' ',
      nomorSurat: null,
      tanggalDiarsipkan: '2026-02-31',
      klasifikasiId: null,
      klasifikasiKodeSnapshot: '',
      klasifikasiNamaSnapshot: null,
      retensiAktif: '',
      retensiInaktif: null,
      masaAktifBerakhir: 'not-a-date',
      masaInaktifBerakhir: null,
      archivedBy: '',
      createdBy: null,
      nominalRealisasi: null,
      statusArsip: null,
    }))

    expect(row.buckets).toEqual(expect.arrayContaining([
      MANUAL_ARCHIVE_REMEDIATION_BUCKET.NEEDS_HUMAN_METADATA,
      MANUAL_ARCHIVE_REMEDIATION_BUCKET.NOMINAL_INVALID,
    ]))
    expect(row.missingFields).toEqual([
      'archivedBy',
      'createdBy',
      'klasifikasiId',
      'klasifikasiKodeSnapshot',
      'klasifikasiNamaSnapshot',
      'masaAktifBerakhir',
      'masaInaktifBerakhir',
      'nama',
      'nominalRealisasi',
      'nomorSurat',
      'retensiAktif',
      'retensiInaktif',
      'statusArsip',
      'tanggalDiarsipkan',
    ])
    expect(row.buckets).not.toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION)
  })

  it('reports invalid nominal values without auto-correcting them', () => {
    for (const nominalRealisasi of [null, 0, -1, 'not-a-number'] as const) {
      const row = classifyManualArchiveRemediationRow(completeInput({
        nominalRealisasi,
      }))

      expect(row.buckets).toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.NOMINAL_INVALID)
      expect(row.missingFields).toContain('nominalRealisasi')
      expect(row.buckets).not.toContain(MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION)
    }
  })

  it('reports attachments as review-required without exposing file or path fields', () => {
    const row = classifyManualArchiveRemediationRow({
      ...completeInput(),
      attachmentCount: 2,
      logical_path: 'manual-arsip/user/source/secret.pdf',
      physicalPath: 'D:\\storage\\manual-arsip\\secret.pdf',
      storageRoot: 'D:\\storage',
      fileUrl: 'https://files.example.test/secret.pdf',
      signedUrl: 'https://files.example.test/secret.pdf?token=secret-token',
      token: 'secret-token',
      sql: 'select * from secret',
      env: 'DATABASE_URL',
      attachments: [{
        logical_path: 'manual-arsip/user/source/attachment.pdf',
        original_filename: 'attachment.pdf',
        signed_url_token: 'secret-token',
      }],
    } as ManualArchiveRemediationRowInput & Record<string, unknown>)

    expect(row.buckets).toEqual(expect.arrayContaining([
      MANUAL_ARCHIVE_REMEDIATION_BUCKET.ATTACHMENT_REVIEW_REQUIRED,
      MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION,
    ]))
    expect(row.warnings).toEqual([MANUAL_ARCHIVE_REMEDIATION_WARNING.ATTACHMENT_REVIEW_REQUIRED])
    expect(row.attachmentCount).toBe(2)
    expectNoSensitiveReportLeak(row)
  })

  it('aggregates bucket, missing-field, and warning counts', () => {
    const rows = [
      classifyManualArchiveRemediationRow(completeInput()),
      classifyManualArchiveRemediationRow(completeInput({
        nomorSurat: null,
        attachmentCount: 1,
      })),
      classifyManualArchiveRemediationRow(completeInput({
        statusArsip: 'INAKTIF',
      })),
    ]

    expect(summarizeManualArchiveRemediationRows(rows)).toEqual({
      totalRows: 3,
      bucketCounts: {
        ATTACHMENT_REVIEW_REQUIRED: 1,
        NEEDS_HUMAN_METADATA: 1,
        NON_AKTIF_DEFERRED: 1,
        READY_FOR_CANONICALIZATION: 1,
      },
      missingFieldCounts: {
        nomorSurat: 1,
      },
      warningCounts: {
        ATTACHMENT_REVIEW_REQUIRED: 1,
      },
    })
  })

  it('returns safe report DTO fields only', () => {
    const row = classifyManualArchiveRemediationRow(completeInput())
    const allowedKeys = [
      'manualArsipId',
      'canonicalArsipId',
      'statusArsip',
      'buckets',
      'missingFields',
      'warnings',
      'attachmentCount',
      'createdAt',
      'tanggalDiarsipkan',
      'namaArsip',
    ].sort()

    expect(Object.keys(row).sort()).toEqual(allowedKeys)
    expectNoSensitiveReportLeak(row)
  })

  it('reads a bounded report through select-only injected database helpers', async () => {
    const database = createFakeReadDatabase({
      manualRows: [manualReaderRow({
        canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_source_type: 'MANUAL',
      })],
      attachmentCountRows: [{
        manual_arsip_id: MANUAL_ARSIP_ID,
        attachment_count: '3',
        logical_path: 'manual-arsip/user/source/secret.pdf',
      } as any],
    })
    const reader = createManualArchiveRemediationReportReader(database)

    const report = await reader.getManualArchiveRemediationReport({
      statusArsip: 'AKTIF',
      limit: 9999,
    })

    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({
      manualArsipId: MANUAL_ARSIP_ID,
      canonicalArsipId: CANONICAL_ARSIP_ID,
      buckets: expect.arrayContaining([
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_OK,
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.ATTACHMENT_REVIEW_REQUIRED,
      ]),
      attachmentCount: 3,
    })
    expect(report.summary.totalRows).toBe(1)
    expect(database.calls).toContainEqual([
      'limit',
      'manualArsip',
      MANUAL_ARCHIVE_REMEDIATION_REPORT_MAX_LIMIT,
    ])
    expect(database.calls).toContainEqual(['where', 'manualArsip'])
    expectNoSensitiveReportLeak(report)
    expectNoMutationCalls(database)
  })
})

type FakeReadDatabase = ManualArchiveRemediationReportReaderDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeReadDatabaseOptions = {
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

function completeInput(
  overrides: Partial<ManualArchiveRemediationRowInput> = {},
): ManualArchiveRemediationRowInput {
  return {
    manualArsipId: MANUAL_ARSIP_ID,
    canonicalArsipId: null,
    linkedCanonicalArsipId: null,
    linkedCanonicalSourceType: null,
    nama: 'Manual Archive',
    nomorSurat: 'B-001/2026',
    tanggalDiarsipkan: '2026-05-24',
    klasifikasiId: KLASIFIKASI_ID,
    klasifikasiKodeSnapshot: 'MA.01',
    klasifikasiNamaSnapshot: 'Manual Classification',
    retensiAktif: '1 Tahun',
    retensiInaktif: '3 Tahun',
    masaAktifBerakhir: '2027-05-24',
    masaInaktifBerakhir: '2030-05-24',
    archivedBy: USER_ID,
    createdBy: USER_ID,
    nominalRealisasi: '250000',
    statusArsip: 'AKTIF',
    attachmentCount: 0,
    createdAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function manualReaderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_ARSIP_ID,
    canonical_arsip_id: null,
    linked_canonical_arsip_id: null,
    linked_canonical_source_type: null,
    nama: 'Manual Archive',
    nomor_surat: 'B-001/2026',
    tanggal_diarsipkan: '2026-05-24',
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'MA.01',
    klasifikasi_nama_snapshot: 'Manual Classification',
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    masa_aktif_berakhir: '2027-05-24',
    masa_inaktif_berakhir: '2030-05-24',
    archived_by: USER_ID,
    created_by: USER_ID,
    nominal_realisasi: '250000.00',
    status_arsip: 'AKTIF',
    created_at: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function createFakeReadDatabase(options: FakeReadDatabaseOptions): FakeReadDatabase {
  const calls: unknown[] = []
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by remediation reader`)
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

function expectNoMutationCalls(database: FakeReadDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveReportLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

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
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('https://')
  expect(serialized).not.toContain('attachment.pdf')
}
