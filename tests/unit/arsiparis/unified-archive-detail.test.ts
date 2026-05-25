import { describe, expect, it } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
  manualArsipCategory,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  createUnifiedArchiveDetailReader,
  type UnifiedArchiveDetailReaderDatabase,
} from '#/lib/archive/unified-archive-detail'

const WORKFLOW_ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const MANUAL_ARCHIVE_ID = '22222222-2222-4222-8222-222222222222'
const DOKUMEN_ID = '33333333-3333-4333-8333-333333333333'
const MANUAL_SOURCE_ID = '44444444-4444-4444-8444-444444444444'
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444445'
const USER_ID = '55555555-5555-4555-8555-555555555555'
const KLASIFIKASI_ID = '66666666-6666-4666-8666-666666666666'
const CATEGORY_ID = '77777777-7777-4777-8777-777777777777'

describe('unified archive detail reader', () => {
  it('returns not_found when canonical row is missing', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [],
      workflowRows: [],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expect(result).toEqual({ status: 'not_found' })
    expect(database.calls).toContainEqual(['from', 'arsip'])
    expect(database.calls).not.toContainEqual(['from', 'dokumenTransaksi'])
    expect(database.calls).not.toContainEqual(['from', 'manualArsip'])
    expectNoMutationCalls(database)
  })

  it('maps WORKFLOW canonical detail with safe workflow source metadata', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow()],
      workflowRows: [workflowSourceRow()],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail).toMatchObject({
      id: WORKFLOW_ARCHIVE_ID,
      sourceType: 'WORKFLOW',
      statusArsip: 'AKTIF',
      namaArsip: 'Workflow Archive',
      nomorSurat: 'B-001',
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: 'WF.01',
      klasifikasiNamaSnapshot: 'Workflow Classification',
      tanggalArsip: '2026-05-24T00:00:00.000Z',
      retensiAktif: '1 Tahun',
      retensiInaktif: '3 Tahun',
      masaAktifBerakhir: '2027-05-24',
      masaInaktifBerakhir: '2030-05-24',
      nominalRealisasi: '100000.00',
      createdBy: USER_ID,
      archivedBy: USER_ID,
      createdAt: '2026-05-24T00:00:00.000Z',
      updatedAt: '2026-05-24T00:00:00.000Z',
      warnings: [],
      source: {
        sourceType: 'WORKFLOW',
        dokumenId: DOKUMEN_ID,
        judulDokumen: 'Dokumen Workflow',
        isNonMaterial: false,
        workflowStatus: 'ARCHIVED',
        fungsiNama: 'Fungsi Neraca',
        kegiatanNama: 'Kegiatan Statistik',
        tahun: 2026,
        createdBy: USER_ID,
      },
      attachments: [{
        sourceType: 'WORKFLOW',
        attachmentId: null,
        index: 1,
        displayName: 'Bukti Persetujuan',
        fileName: null,
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        uploadedAt: '2026-05-24T01:00:00.000Z',
        availability: 'AVAILABLE',
      }],
    })
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('WORKFLOW missing dokumen_id adds WORKFLOW_WITHOUT_DOKUMEN_ID warning', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow({ dokumen_id: null })],
      workflowRows: [],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail.source).toBeNull()
    expect(result.detail.warnings).toEqual([
      'ATTACHMENT_SOURCE_INCOMPLETE',
      'WORKFLOW_WITHOUT_DOKUMEN_ID',
    ])
    expect(result.detail.attachments[0].availability).toBe('UNAVAILABLE_SOURCE_INCOMPLETE')
    expect(database.calls).not.toContainEqual(['from', 'dokumenTransaksi'])
    expectNoMutationCalls(database)
  })

  it('WORKFLOW source id present but source row missing adds WORKFLOW_SOURCE_NOT_FOUND warning', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow()],
      workflowRows: [],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail.source).toBeNull()
    expect(result.detail.warnings).toEqual([
      'ATTACHMENT_SOURCE_INCOMPLETE',
      'WORKFLOW_SOURCE_NOT_FOUND',
    ])
    expectNoMutationCalls(database)
  })

  it('maps MANUAL canonical detail with safe manual source metadata', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [manualCanonicalRow()],
      workflowRows: [],
      manualRows: [manualSourceRow()],
      attachmentRows: [manualAttachmentRow()],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(MANUAL_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail).toMatchObject({
      id: MANUAL_ARCHIVE_ID,
      sourceType: 'MANUAL',
      statusArsip: 'AKTIF',
      namaArsip: 'Manual Archive',
      warnings: [],
      source: {
        sourceType: 'MANUAL',
        manualArsipId: MANUAL_SOURCE_ID,
        nama: 'Arsip Manual',
        keterangan: 'Keterangan aman',
        categoryId: CATEGORY_ID,
        categoryName: 'Pemeliharaan',
        tanggalDokumenSumber: '2026-05-01',
        tanggalDiarsipkan: '2026-05-24',
        createdBy: USER_ID,
        archivedBy: USER_ID,
      },
      attachments: [{
        sourceType: 'MANUAL',
        attachmentId: ATTACHMENT_ID,
        index: 1,
        displayName: 'Bukti Kegiatan',
        fileName: null,
        mimeType: 'image/png',
        sizeBytes: 4096,
        uploadedAt: '2026-05-24T02:00:00.000Z',
        availability: 'AVAILABLE',
      }],
    })
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('MANUAL missing source adds missing source warnings', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [manualCanonicalRow()],
      workflowRows: [],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(MANUAL_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail.source).toBeNull()
    expect(result.detail.attachments).toEqual([])
    expect(result.detail.warnings).toEqual([
      'MANUAL_SOURCE_NOT_FOUND',
      'MISSING_MANUAL_SOURCE',
    ])
    expectNoMutationCalls(database)
  })

  it('MANUAL row with unexpected dokumen_id adds MANUAL_WITH_DOKUMEN_ID warning', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [manualCanonicalRow({ dokumen_id: DOKUMEN_ID })],
      workflowRows: [],
      manualRows: [manualSourceRow()],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(MANUAL_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail.source?.sourceType).toBe('MANUAL')
    expect(result.detail.warnings).toEqual(['MANUAL_WITH_DOKUMEN_ID'])
    expectNoMutationCalls(database)
  })

  it('UNKNOWN source type returns source null with UNKNOWN_SOURCE_TYPE warning', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow({ source_type: 'LEGACY', dokumen_id: DOKUMEN_ID })],
      workflowRows: [workflowSourceRow()],
      manualRows: [manualSourceRow()],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail.sourceType).toBe('UNKNOWN')
    expect(result.detail.source).toBeNull()
    expect(result.detail.warnings).toEqual(['UNKNOWN_SOURCE_TYPE'])
    expect(database.calls).not.toContainEqual(['from', 'dokumenTransaksi'])
    expect(database.calls).not.toContainEqual(['from', 'manualArsip'])
    expectNoMutationCalls(database)
  })

  it('output does not include paths, URLs, tokens, SQL, env, secrets, raw attachment metadata, or raw DB rows', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [
        manualCanonicalRow({
          logical_path: `${USER_ID}/manual/secret.pdf`,
          physical_path: 'D:\\storage\\secret.pdf',
          signed_url: 'https://example.test/token',
          metadata: { token: 'secret-token' },
          lampiran_snapshot: [{ nama: 'Sensitive Filename.pdf', url: 'token-value' }],
        } as any),
      ],
      workflowRows: [],
      manualRows: [
        manualSourceRow({
          logical_path: `${USER_ID}/manual/secret.pdf`,
          original_filename: 'secret.pdf',
          metadata: { secret: 'hidden' },
        } as any),
      ],
      attachmentRows: [
        manualAttachmentRow({
          logical_path: `${USER_ID}/manual/secret.pdf`,
          original_filename: 'secret.pdf',
          metadata: { secret: 'hidden' },
          token: 'secret-token',
        } as any),
      ],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(MANUAL_ARCHIVE_ID)

    expect(result.status).toBe('found')
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('WORKFLOW attachment mapping strips paths, tokens, and raw metadata', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [
        workflowCanonicalRow({
          lampiran_snapshot: [{
            displayName: 'Lampiran Aman',
            original_filename: 'secret.pdf',
            url: `${USER_ID}/workflow/${WORKFLOW_ARCHIVE_ID}/secret.pdf`,
            signed_url: 'https://example.test/token',
            token: 'secret-token',
            metadata: { secret: 'hidden' },
          }],
        }),
      ],
      workflowRows: [workflowSourceRow()],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail.attachments).toEqual([{
      sourceType: 'WORKFLOW',
      attachmentId: null,
      index: 1,
      displayName: 'Lampiran Aman',
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      uploadedAt: null,
      availability: 'AVAILABLE',
    }])
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('DIMUSNAHKAN detail marks attachments unavailable destroyed without file actions', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow({ status_arsip: 'DIMUSNAHKAN' })],
      workflowRows: [workflowSourceRow()],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail.attachments[0].availability).toBe('UNAVAILABLE_DESTROYED')
    expectNoFileActions(result)
    expectNoMutationCalls(database)
  })

  it('invalid WORKFLOW attachment snapshot returns empty attachments with controlled warning', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow({ lampiran_snapshot: '{"not":"an array"}' })],
      workflowRows: [workflowSourceRow()],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.detail.attachments).toEqual([])
    expect(result.detail.warnings).toEqual(['ATTACHMENT_METADATA_UNAVAILABLE'])
    expectNoSensitiveOutput(result)
    expectNoMutationCalls(database)
  })

  it('detail DTO does not include preview or download URLs', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [manualCanonicalRow()],
      workflowRows: [],
      manualRows: [manualSourceRow()],
      attachmentRows: [manualAttachmentRow()],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    const result = await reader.getUnifiedArchiveDetail(MANUAL_ARCHIVE_ID)

    expect(result.status).toBe('found')
    expectNoFileActions(result)
    expectNoMutationCalls(database)
  })

  it('reader does not call insert, update, delete, or transaction', async () => {
    const database = createFakeReadDatabase({
      canonicalRows: [workflowCanonicalRow()],
      workflowRows: [workflowSourceRow()],
      manualRows: [],
    })
    const reader = createUnifiedArchiveDetailReader(database)

    await reader.getUnifiedArchiveDetail(WORKFLOW_ARCHIVE_ID)

    expectNoMutationCalls(database)
  })
})

type FakeReadDatabase = UnifiedArchiveDetailReaderDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeReadDatabaseOptions = {
  canonicalRows: unknown[]
  workflowRows: unknown[]
  manualRows: unknown[]
  attachmentRows?: unknown[]
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  leftJoin: (...args: unknown[]) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  orderBy: (...args: unknown[]) => Promise<unknown[]>
  limit: (limit: number) => Promise<unknown[]>
}

function createFakeReadDatabase(options: FakeReadDatabaseOptions): FakeReadDatabase {
  const calls: unknown[] = []
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by unified archive detail reader`)
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
          return Promise.resolve(rowsFor(selectedTable, options))
        },
        limit(limit) {
          calls.push(['limit', tableName(selectedTable), limit])
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
  if (table === dokumenTransaksi) return options.workflowRows
  if (table === manualArsip) return options.manualRows
  if (table === manualArsipAttachment) return options.attachmentRows ?? []
  return []
}

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === dokumenTransaksi) return 'dokumenTransaksi'
  if (table === manualArsip) return 'manualArsip'
  if (table === manualArsipCategory) return 'manualArsipCategory'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  return 'unknown'
}

function workflowCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKFLOW_ARCHIVE_ID,
    source_type: 'WORKFLOW',
    dokumen_id: DOKUMEN_ID,
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
    lampiran_snapshot: [{
      nama: 'Bukti Persetujuan',
      content_type: 'application/pdf',
      size_bytes: 2048,
      uploaded_at: '2026-05-24T01:00:00.000Z',
      url: `${USER_ID}/workflow/${WORKFLOW_ARCHIVE_ID}/safe-hidden.pdf`,
    }],
    ...overrides,
  }
}

function manualCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_ARCHIVE_ID,
    source_type: 'MANUAL',
    dokumen_id: null,
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

function workflowSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DOKUMEN_ID,
    judul: 'Dokumen Workflow',
    is_non_material: false,
    status: 'ARCHIVED',
    fungsi_nama: 'Fungsi Neraca',
    kegiatan_nama: 'Kegiatan Statistik',
    tahun: 2026,
    created_by: USER_ID,
    ...overrides,
  }
}

function manualSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_SOURCE_ID,
    nama: 'Arsip Manual',
    keterangan: 'Keterangan aman',
    category_id: CATEGORY_ID,
    category_name: 'Pemeliharaan',
    tanggal: '2026-05-01',
    tanggal_diarsipkan: '2026-05-24',
    created_by: USER_ID,
    archived_by: USER_ID,
    ...overrides,
  }
}

function manualAttachmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ATTACHMENT_ID,
    judul_lampiran: 'Bukti Kegiatan',
    original_filename: 'bukti-kegiatan.png',
    content_type: 'image/png',
    size_bytes: 4096,
    created_at: '2026-05-24T02:00:00.000Z',
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
  expect(serialized).not.toContain('physical_path')
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
  expect(serialized).not.toContain('lampiran_snapshot')
}

function expectNoFileActions(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase()

  expect(serialized).not.toContain('previewurl')
  expect(serialized).not.toContain('downloadurl')
  expect(serialized).not.toContain('preview_url')
  expect(serialized).not.toContain('download_url')
  expect(serialized).not.toContain('/preview')
  expect(serialized).not.toContain('/download')
  expect(serialized).not.toContain('signedurl')
  expect(serialized).not.toContain('signed_url')
}
