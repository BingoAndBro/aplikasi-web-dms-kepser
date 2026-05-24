import { describe, expect, it } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  dryRunManualArchiveCanonicalizationForReview,
  ManualArchiveCanonicalizationDryRunError,
  type ManualArchiveCanonicalizationDryRunDatabase,
} from '#/lib/archive/manual-archive-canonicalization-dry-run'
import {
  MANUAL_ARCHIVE_REMEDIATION_BUCKET,
  MANUAL_ARCHIVE_REMEDIATION_WARNING,
} from '#/lib/archive/manual-archive-remediation-report'

const MANUAL_ARSIP_ID = '11111111-1111-4111-8111-111111111111'
const CANONICAL_ARSIP_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const KLASIFIKASI_ID = '44444444-4444-4444-8444-444444444444'

describe('manual archive canonicalization dry-run helper', () => {
  it('returns would_canonicalize with safe preview for a READY row', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow()]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
      approvalNote: 'Approved for dry-run inspection only',
    })

    expect(result).toEqual({
      status: 'would_canonicalize',
      manualArsipId: MANUAL_ARSIP_ID,
      buckets: [MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION],
      missingFields: [],
      warnings: [],
      preview: {
        sourceType: 'MANUAL',
        dokumenId: null,
        namaArsip: 'Arsip Manual',
        nomorSurat: 'B-001/2026',
        klasifikasiId: KLASIFIKASI_ID,
        klasifikasiKodeSnapshot: 'MA.01',
        klasifikasiNamaSnapshot: 'Manual Classification',
        retensiAktif: '1 Tahun',
        retensiInaktif: '3 Tahun',
        masaAktifBerakhir: '2027-05-24',
        masaInaktifBerakhir: '2030-05-24',
        archivedAt: '2026-05-24T00:00:00.000Z',
        archivedBy: USER_ID,
        createdBy: USER_ID,
        nominalRealisasi: '250000.00',
        statusArsip: 'AKTIF',
        metadata: {},
      },
    })
    expectNoMutationCalls(database)
    expectNoSensitiveResultLeak(result)
  })

  it('requires explicit approvedByUserId before any database work', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow()]],
    })

    await expect(dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: ' ',
    })).rejects.toBeInstanceOf(ManualArchiveCanonicalizationDryRunError)

    expect(database.calls).toEqual([])
  })

  it('returns not_ready without preview for missing metadata', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow({ nomor_surat: null })]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expect(result).toMatchObject({
      status: 'not_ready',
      manualArsipId: MANUAL_ARSIP_ID,
      buckets: expect.arrayContaining([
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.NEEDS_HUMAN_METADATA,
      ]),
      missingFields: ['nomorSurat'],
      warnings: [],
    })
    expect(result).not.toHaveProperty('preview')
    expectNoMutationCalls(database)
  })

  it('returns not_ready without preview for non-AKTIF source rows', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow({ status_arsip: 'INAKTIF' })]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expect(result).toMatchObject({
      status: 'not_ready',
      buckets: expect.arrayContaining([
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.NON_AKTIF_DEFERRED,
      ]),
    })
    expect(result).not.toHaveProperty('preview')
    expectNoMutationCalls(database)
  })

  it('returns already_linked for an existing linked MANUAL canonical row and no preview', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow({
        canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_source_type: 'MANUAL',
      })]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expect(result).toEqual({
      status: 'already_linked',
      manualArsipId: MANUAL_ARSIP_ID,
      canonicalArsipId: CANONICAL_ARSIP_ID,
      buckets: [MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_OK],
      missingFields: [],
      warnings: [],
    })
    expect(result).not.toHaveProperty('preview')
    expectNoMutationCalls(database)
  })

  it('returns not_ready for broken canonical links', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow({
        canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_arsip_id: null,
        linked_canonical_source_type: null,
      })]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expect(result).toMatchObject({
      status: 'not_ready',
      buckets: expect.arrayContaining([
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_BROKEN,
      ]),
    })
    expect(result).not.toHaveProperty('preview')
    expectNoMutationCalls(database)
  })

  it('returns not_ready for wrong-source canonical links', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow({
        canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_source_type: 'WORKFLOW',
      })]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expect(result).toMatchObject({
      status: 'not_ready',
      buckets: expect.arrayContaining([
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_WRONG_SOURCE_TYPE,
      ]),
    })
    expect(result).not.toHaveProperty('preview')
    expectNoMutationCalls(database)
  })

  it('preserves attachment review warning but still returns would_canonicalize if otherwise ready', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow()]],
      attachmentCountRows: [[{
        attachment_count: 2,
        logical_path: 'manual-arsip/user/source/secret.pdf',
        token: 'secret-token',
      }]],
    })

    const result = await dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expect(result).toMatchObject({
      status: 'would_canonicalize',
      buckets: expect.arrayContaining([
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.ATTACHMENT_REVIEW_REQUIRED,
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION,
      ]),
      warnings: [MANUAL_ARCHIVE_REMEDIATION_WARNING.ATTACHMENT_REVIEW_REQUIRED],
    })
    expect(result).toHaveProperty('preview')
    expectNoMutationCalls(database)
    expectNoSensitiveResultLeak(result)
  })

  it('does not call insert, update, delete, or transaction for any dry-run result', async () => {
    for (const manualRows of [
      [[manualReaderRow()]],
      [[manualReaderRow({ nomor_surat: null })]],
      [[manualReaderRow({
        canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_source_type: 'MANUAL',
      })]],
      [[]],
    ]) {
      const database = createFakeDryRunDatabase({
        manualRows,
        attachmentCountRows: [[{ attachment_count: 0 }]],
      })

      await dryRunManualArchiveCanonicalizationForReview({
        database,
        manualArsipId: MANUAL_ARSIP_ID,
        approvedByUserId: USER_ID,
      })

      expectNoMutationCalls(database)
    }
  })

  it('does not leak path, token, SQL, env, secrets, URLs, or raw attachment metadata', async () => {
    const database = createFakeDryRunDatabase({
      manualRows: [[manualReaderRow({
        logical_path: 'manual-arsip/user/source/secret.pdf',
        physicalPath: 'D:\\storage\\manual-arsip\\secret.pdf',
        storageRoot: 'D:\\storage',
        fileUrl: 'https://files.example.test/secret.pdf',
        signedUrl: 'https://files.example.test/secret.pdf?token=secret-token',
        token: 'secret-token',
        sql: 'select * from secret',
        env: 'DATABASE_URL',
        secret: 'super-secret',
        metadata: {
          logical_path: 'manual-arsip/user/source/metadata.pdf',
          token: 'secret-token',
        },
      } as Record<string, unknown>)]],
      attachmentCountRows: [[{
        attachment_count: 1,
        logical_path: 'manual-arsip/user/source/secret.pdf',
        original_filename: 'secret.pdf',
        signed_url_token: 'secret-token',
        metadata: {
          storage_root: 'D:\\storage',
        },
      }]],
    })

    const result = await dryRunManualArchiveCanonicalizationForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expectNoSensitiveResultLeak(result)
  })
})

type FakeDryRunDatabase = ManualArchiveCanonicalizationDryRunDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeDryRunDatabaseOptions = {
  manualRows?: unknown[][]
  attachmentCountRows?: unknown[][]
}

type FakeSelectQuery = {
  from: (table: unknown) => FakeSelectQuery
  leftJoin: (...args: unknown[]) => FakeSelectQuery
  where: (...args: unknown[]) => FakeSelectQuery
  limit: (limit: number) => Promise<unknown[]>
}

function createFakeDryRunDatabase(
  options: FakeDryRunDatabaseOptions,
): FakeDryRunDatabase {
  const calls: unknown[] = []
  const state = {
    manualRows: [...(options.manualRows ?? [])],
    attachmentCountRows: [...(options.attachmentCountRows ?? [])],
  }
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by dry-run helper`)
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
        leftJoin(table) {
          calls.push(['leftJoin', tableName(table)])
          return query
        },
        where() {
          calls.push(['where', tableName(selectedTable)])
          return query
        },
        limit(limit) {
          calls.push(['limit', tableName(selectedTable), limit])
          return Promise.resolve(nextRowsForSelectedTable(selectedTable, state))
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

function nextRowsForSelectedTable(
  selectedTable: unknown,
  state: {
    manualRows: unknown[][]
    attachmentCountRows: unknown[][]
  },
): unknown[] {
  if (selectedTable === manualArsip) return state.manualRows.shift() ?? []
  if (selectedTable === manualArsipAttachment) return state.attachmentCountRows.shift() ?? []

  return []
}

function manualReaderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MANUAL_ARSIP_ID,
    canonical_arsip_id: null,
    linked_canonical_arsip_id: null,
    linked_canonical_source_type: null,
    nama: 'Arsip Manual',
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

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === manualArsip) return 'manualArsip'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  return 'unknown'
}

function expectNoMutationCalls(database: FakeDryRunDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveResultLeak(value: unknown): void {
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
  expect(serialized).not.toContain('https://')
  expect(serialized).not.toContain('fileUrl')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('attachment.pdf')
}
