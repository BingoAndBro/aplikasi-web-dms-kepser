import { describe, expect, it } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  canonicalizeReadyManualArchiveRowForReview,
  ManualArchiveCanonicalizationError,
  type ManualArchiveCanonicalizationDatabase,
} from '#/lib/archive/manual-archive-canonicalization-backfill'
import {
  MANUAL_ARCHIVE_REMEDIATION_BUCKET,
} from '#/lib/archive/manual-archive-remediation-report'

const MANUAL_ARSIP_ID = '11111111-1111-4111-8111-111111111111'
const CANONICAL_ARSIP_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const KLASIFIKASI_ID = '44444444-4444-4444-8444-444444444444'

describe('manual archive canonicalization backfill helper', () => {
  it('canonicalizes a READY row with one transaction, canonical insert, and guarded source link update', async () => {
    const database = createFakeCanonicalizationDatabase({
      manualRows: [
        [manualReaderRow()],
        [manualReaderRow()],
      ],
      attachmentCountRows: [
        [{ attachment_count: 0 }],
        [{ attachment_count: 0 }],
      ],
      canonicalInsertRows: [[{ id: CANONICAL_ARSIP_ID }]],
      linkUpdateRows: [[{
        id: MANUAL_ARSIP_ID,
        canonical_arsip_id: CANONICAL_ARSIP_ID,
      }]],
    })

    const result = await canonicalizeReadyManualArchiveRowForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
      approvalNote: 'Approved from human-reviewed 12L.17 report row',
    })

    expect(result).toEqual({
      status: 'canonicalized',
      manualArsipId: MANUAL_ARSIP_ID,
      canonicalArsipId: CANONICAL_ARSIP_ID,
      buckets: [MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION],
      missingFields: [],
    })
    expect(database.calls).toContainEqual(['transaction'])
    expect(database.calls.filter((call) => Array.isArray(call) && call[0] === 'transaction')).toHaveLength(1)
    expect(database.calls).toContainEqual(['insert', 'arsip'])
    expect(database.calls).toContainEqual([
      'insertValues',
      'MANUAL',
      null,
      'Arsip Manual',
      'B-001/2026',
      'AKTIF',
    ])
    expect(database.calls).toContainEqual(['update', 'manualArsip'])
    expect(database.calls).toContainEqual(['updateSet', { canonicalArsipId: CANONICAL_ARSIP_ID }])
    expectNoSensitiveResultLeak(result)
  })

  it('returns not_ready for missing metadata and does not mutate or start a transaction', async () => {
    const database = createFakeCanonicalizationDatabase({
      manualRows: [[manualReaderRow({ nomor_surat: null })]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await canonicalizeReadyManualArchiveRowForReview({
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
    })
    expectNoMutationCalls(database)
  })

  it('returns not_ready for non-AKTIF source rows and does not insert canonical rows', async () => {
    const database = createFakeCanonicalizationDatabase({
      manualRows: [[manualReaderRow({ status_arsip: 'INAKTIF' })]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await canonicalizeReadyManualArchiveRowForReview({
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
    expect(database.calls).not.toContainEqual(['insert', 'arsip'])
    expect(database.calls).not.toContainEqual(['transaction'])
  })

  it('returns already_linked for an existing linked MANUAL canonical row and does not create another row', async () => {
    const database = createFakeCanonicalizationDatabase({
      manualRows: [[manualReaderRow({
        canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_source_type: 'MANUAL',
      })]],
      attachmentCountRows: [[{ attachment_count: 0 }]],
    })

    const result = await canonicalizeReadyManualArchiveRowForReview({
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
    })
    expectNoMutationCalls(database)
  })

  it('returns not_ready for broken or wrong-source canonical links and does not auto-fix', async () => {
    for (const linkedState of [
      {
        linked_canonical_arsip_id: null,
        linked_canonical_source_type: null,
        expectedBucket: MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_BROKEN,
      },
      {
        linked_canonical_arsip_id: CANONICAL_ARSIP_ID,
        linked_canonical_source_type: 'WORKFLOW',
        expectedBucket: MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_WRONG_SOURCE_TYPE,
      },
    ] as const) {
      const database = createFakeCanonicalizationDatabase({
        manualRows: [[manualReaderRow({
          canonical_arsip_id: CANONICAL_ARSIP_ID,
          linked_canonical_arsip_id: linkedState.linked_canonical_arsip_id,
          linked_canonical_source_type: linkedState.linked_canonical_source_type,
        })]],
        attachmentCountRows: [[{ attachment_count: 0 }]],
      })

      const result = await canonicalizeReadyManualArchiveRowForReview({
        database,
        manualArsipId: MANUAL_ARSIP_ID,
        approvedByUserId: USER_ID,
      })

      expect(result).toMatchObject({
        status: 'not_ready',
        manualArsipId: MANUAL_ARSIP_ID,
        buckets: expect.arrayContaining([linkedState.expectedBucket]),
      })
      expectNoMutationCalls(database)
    }
  })

  it('throws a controlled error inside the transaction if source link update fails after canonical insert', async () => {
    const database = createFakeCanonicalizationDatabase({
      manualRows: [
        [manualReaderRow()],
        [manualReaderRow()],
      ],
      attachmentCountRows: [
        [{ attachment_count: 0 }],
        [{ attachment_count: 0 }],
      ],
      canonicalInsertRows: [[{ id: CANONICAL_ARSIP_ID }]],
      linkUpdateRows: [[]],
    })

    await expect(canonicalizeReadyManualArchiveRowForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })).rejects.toMatchObject({
      name: 'ManualArchiveCanonicalizationError',
      code: 'MANUAL_ARCHIVE_CANONICAL_SOURCE_LINK_FAILED',
    })

    expect(database.calls).toContainEqual(['transaction'])
    expect(database.calls).toContainEqual(['insert', 'arsip'])
    expect(database.calls).toContainEqual(['update', 'manualArsip'])
  })

  it('keeps attachment review as a safe warning and still canonicalizes otherwise READY rows', async () => {
    const database = createFakeCanonicalizationDatabase({
      manualRows: [
        [manualReaderRow()],
        [manualReaderRow()],
      ],
      attachmentCountRows: [
        [{ attachment_count: 2, logical_path: 'manual-arsip/user/source/secret.pdf' }],
        [{ attachment_count: 2, token: 'secret-token' }],
      ],
      canonicalInsertRows: [[{ id: CANONICAL_ARSIP_ID }]],
      linkUpdateRows: [[{
        id: MANUAL_ARSIP_ID,
        canonical_arsip_id: CANONICAL_ARSIP_ID,
      }]],
    })

    const result = await canonicalizeReadyManualArchiveRowForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expect(result).toMatchObject({
      status: 'canonicalized',
      buckets: expect.arrayContaining([
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.ATTACHMENT_REVIEW_REQUIRED,
        MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION,
      ]),
    })
    expectNoSensitiveResultLeak(result)
  })

  it('does not leak path, token, SQL, env, or secret-shaped data in safe results', async () => {
    const database = createFakeCanonicalizationDatabase({
      manualRows: [[manualReaderRow({
        nama: 'Arsip Manual',
        logical_path: 'manual-arsip/user/source/secret.pdf',
        physicalPath: 'D:\\storage\\manual-arsip\\secret.pdf',
        storageRoot: 'D:\\storage',
        fileUrl: 'https://files.example.test/secret.pdf',
        token: 'secret-token',
        sql: 'select * from secret',
        env: 'DATABASE_URL',
        secret: 'super-secret',
      } as Record<string, unknown>)]],
      attachmentCountRows: [[{
        attachment_count: 1,
        logical_path: 'manual-arsip/user/source/secret.pdf',
        token: 'secret-token',
      }]],
      canonicalInsertRows: [[{ id: CANONICAL_ARSIP_ID }]],
      linkUpdateRows: [[{
        id: MANUAL_ARSIP_ID,
        canonical_arsip_id: CANONICAL_ARSIP_ID,
      }]],
    })

    const result = await canonicalizeReadyManualArchiveRowForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: USER_ID,
    })

    expectNoSensitiveResultLeak(result)
  })

  it('requires explicit approvedByUserId before any database work', async () => {
    const database = createFakeCanonicalizationDatabase({
      manualRows: [[manualReaderRow()]],
    })

    await expect(canonicalizeReadyManualArchiveRowForReview({
      database,
      manualArsipId: MANUAL_ARSIP_ID,
      approvedByUserId: ' ',
    })).rejects.toBeInstanceOf(ManualArchiveCanonicalizationError)

    expect(database.calls).toEqual([])
  })
})

type FakeCanonicalizationDatabase = ManualArchiveCanonicalizationDatabase & {
  calls: unknown[]
}

type FakeCanonicalizationDatabaseOptions = {
  manualRows?: unknown[][]
  attachmentCountRows?: unknown[][]
  canonicalInsertRows?: unknown[][]
  linkUpdateRows?: unknown[][]
}

type FakeSelectQuery = {
  from: (table: unknown) => FakeSelectQuery
  leftJoin: (...args: unknown[]) => FakeSelectQuery
  where: (...args: unknown[]) => FakeSelectQuery
  limit: (limit: number) => Promise<unknown[]>
}

function createFakeCanonicalizationDatabase(
  options: FakeCanonicalizationDatabaseOptions,
): FakeCanonicalizationDatabase {
  const calls: unknown[] = []
  const state = {
    manualRows: [...(options.manualRows ?? [])],
    attachmentCountRows: [...(options.attachmentCountRows ?? [])],
    canonicalInsertRows: [...(options.canonicalInsertRows ?? [])],
    linkUpdateRows: [...(options.linkUpdateRows ?? [])],
  }

  const createDatabase = (): ManualArchiveCanonicalizationDatabase => ({
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
    insert(table) {
      calls.push(['insert', tableName(table)])
      return {
        values(values) {
          calls.push([
            'insertValues',
            values.sourceType,
            values.dokumenId,
            values.namaArsip,
            values.nomorSurat,
            values.statusArsip,
          ])
          return {
            returning() {
              calls.push(['insertReturning', tableName(table)])
              return Promise.resolve(state.canonicalInsertRows.shift() ?? [])
            },
          }
        },
      }
    },
    update(table) {
      calls.push(['update', tableName(table)])
      return {
        set(values) {
          calls.push(['updateSet', values])
          return {
            where() {
              calls.push(['updateWhere', tableName(table)])
              return {
                returning() {
                  calls.push(['updateReturning', tableName(table)])
                  return Promise.resolve(state.linkUpdateRows.shift() ?? [])
                },
              }
            },
          }
        },
      }
    },
    transaction(operation) {
      calls.push(['transaction'])
      return operation(createDatabase() as never)
    },
  })

  return {
    ...createDatabase(),
    calls,
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

function expectNoMutationCalls(database: FakeCanonicalizationDatabase): void {
  expect(database.calls).not.toContainEqual(['transaction'])
  expect(database.calls).not.toContainEqual(['insert', 'arsip'])
  expect(database.calls).not.toContainEqual(['update', 'manualArsip'])
}

function expectNoSensitiveResultLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physicalPath')
  expect(serialized).not.toContain('storageRoot')
  expect(serialized).not.toContain('storage_root')
  expect(serialized).not.toContain('manual-arsip')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('https://')
  expect(serialized).not.toContain('fileUrl')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('secret')
}
