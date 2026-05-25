import { beforeEach, describe, expect, it, vi } from 'vitest'

import { users } from '#/db/schema/auth'
import {
  arsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  buildUnifiedArchiveCsvResponse,
  createUnifiedArchiveCsvExportForDatabase,
  UNIFIED_ARCHIVE_EXPORT_FILENAME,
  UNIFIED_ARCHIVE_EXPORT_MAX_ROWS,
  type UnifiedArchiveAggregateExportDatabase,
} from '#/lib/archive/unified-archive-aggregate-export'

const WORKFLOW_ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const MANUAL_ARCHIVE_ID = '22222222-2222-4222-8222-222222222222'
const DOKUMEN_ID = '33333333-3333-4333-8333-333333333333'
const MANUAL_SOURCE_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '55555555-5555-4555-8555-555555555555'
const KLASIFIKASI_ID = '66666666-6666-4666-8666-666666666666'

const authMocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: authMocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

import { Route as ExportRoute } from '#/routes/api/arsiparis/arsip/export'

type RouteGetHandler = (args: { request: Request }) => Promise<Response>

const exportGetHandler = (ExportRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('unified archive CSV export helper', () => {
  it('exports metadata-only CSV with Indonesian labels, actor names, and safe fallback values', async () => {
    const database = createFakeExportDatabase({
      canonicalRows: [
        workflowCanonicalRow({
          nama_arsip: 'Laporan, "Kinerja"\nTahunan',
          lampiran_snapshot: [{
            logical_path: `${USER_ID}/workflow/${WORKFLOW_ARCHIVE_ID}/secret.pdf`,
            token: 'signed-token-value',
            file_content: 'FILE_CONTENT_SHOULD_NOT_EXPORT',
            metadata: { secret: 'hidden' },
          }],
        }),
        manualCanonicalRow({
          nama_arsip: '=1+1',
          archived_by: '77777777-7777-4777-8777-777777777777',
        }),
      ],
      attachmentCountRows: [{
        manual_arsip_id: MANUAL_SOURCE_ID,
        attachment_count: '3',
        logical_path: `${USER_ID}/manual/secret.pdf`,
        metadata: { token: 'hidden' },
      } as any],
      userRows: [userRow({ display_name: '+Kasubag Arsip' })],
    })

    const result = await createUnifiedArchiveCsvExportForDatabase(database)

    expect(result.rowCount).toBe(2)
    expect(result.maxRows).toBe(UNIFIED_ARCHIVE_EXPORT_MAX_ROWS)
    expect(result.truncated).toBe(false)
    expect(result.csv).toContain('ID Arsip,Nama Arsip,Nomor Surat,Status Arsip,Sumber Arsip,Klasifikasi,Tanggal Arsip,Retensi Aktif,Retensi Inaktif,Dibuat oleh,Diarsipkan oleh,Nominal Realisasi,Jumlah Lampiran,Tanggal dibuat,Terakhir diperbarui')
    expect(result.csv).toContain(`${WORKFLOW_ARCHIVE_ID},"Laporan, ""Kinerja""\nTahunan"`)
    expect(result.csv).toContain("'=1+1")
    expect(result.csv).toContain("'+Kasubag Arsip")
    expect(result.csv).toContain('Pengguna tidak ditemukan')
    expect(result.csv).toContain(',3,')
    expectNoSensitiveOutput(result.csv)
    expectNoMutationCalls(database)
  })

  it('escapes quote, comma, CR/LF, and spreadsheet-dangerous leading values', async () => {
    const database = createFakeExportDatabase({
      canonicalRows: [
        workflowCanonicalRow({
          nama_arsip: '@arsip, bahaya',
          nomor_surat: '-001',
          klasifikasi_nama_snapshot: 'Klasifikasi "A"\r\nBaru',
        }),
      ],
      attachmentCountRows: [],
      userRows: [userRow()],
    })

    const result = await createUnifiedArchiveCsvExportForDatabase(database)

    expect(result.csv).toContain('"\'@arsip, bahaya"')
    expect(result.csv).toContain("'-001")
    expect(result.csv).toContain('"WF.01 - Klasifikasi ""A""\r\nBaru"')
    expectNoSensitiveOutput(result.csv)
  })

  it('supports status and source filters through the bounded unified query path', async () => {
    const database = createFakeExportDatabase({
      canonicalRows: [manualCanonicalRow({ status_arsip: 'INAKTIF' })],
      attachmentCountRows: [{ manual_arsip_id: MANUAL_SOURCE_ID, attachment_count: 1 }],
      userRows: [userRow()],
    })

    const result = await createUnifiedArchiveCsvExportForDatabase(database, {
      statusArsip: 'INAKTIF',
      sourceType: 'MANUAL',
    })

    expect(result.filters).toEqual({
      statusArsip: 'INAKTIF',
      sourceType: 'MANUAL',
    })
    expect(result.csv).toContain('Inaktif')
    expect(result.csv).toContain('Arsip Manual')
    expect(database.calls).toContainEqual(['where', 'arsip'])
    expect(database.calls).toContainEqual(['limit', 'arsip', UNIFIED_ARCHIVE_EXPORT_MAX_ROWS])
    expectNoMutationCalls(database)
  })

  it('builds a static sanitized CSV attachment response', async () => {
    const response = buildUnifiedArchiveCsvResponse({
      csv: 'ID Arsip\r\n',
      rowCount: 0,
      maxRows: UNIFIED_ARCHIVE_EXPORT_MAX_ROWS,
      truncated: false,
      filters: {},
    })

    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="${UNIFIED_ARCHIVE_EXPORT_FILENAME}"`)
    expect(response.headers.get('Content-Disposition')).not.toContain('AKTIF')
    expect(response.headers.get('Content-Disposition')).not.toContain('MANUAL')
  })
})

describe('unified archive export route auth and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated requests', async () => {
    authMocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await exportGetHandler({
      request: new Request('http://localhost/api/arsiparis/arsip/export?status=AKTIF'),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for ADMIN-only and non-Kasubag users', async () => {
    for (const roles of [['ADMIN'], ['PEGAWAI']]) {
      authMocks.getLocalServerSession.mockResolvedValueOnce(createSession(roles))

      const response = await exportGetHandler({
        request: new Request('http://localhost/api/arsiparis/arsip/export?status=AKTIF'),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    }
  })

  it('returns 400 for invalid status or source filters before export work', async () => {
    authMocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))

    for (const url of [
      'http://localhost/api/arsiparis/arsip/export?status=TERHAPUS',
      'http://localhost/api/arsiparis/arsip/export?source=SUPABASE',
    ]) {
      const response = await exportGetHandler({ request: new Request(url) })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Filter export arsip tidak valid' })
    }
  })
})

type FakeExportDatabase = UnifiedArchiveAggregateExportDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeExportDatabaseOptions = {
  canonicalRows: unknown[]
  attachmentCountRows: unknown[]
  userRows: unknown[]
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  leftJoin: (...args: unknown[]) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  orderBy: (...args: unknown[]) => FakeQuery
  limit: (limit: number) => FakeQuery | Promise<unknown[]>
  offset: (offset: number) => Promise<unknown[]>
  groupBy: (...args: unknown[]) => Promise<unknown[]>
}

function createFakeExportDatabase(options: FakeExportDatabaseOptions): FakeExportDatabase {
  const calls: unknown[] = []
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by unified archive export`)
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
        leftJoin() {
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
          if (selectedTable === users) {
            return Promise.resolve(options.userRows)
          }

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
  } as FakeExportDatabase
}

function rowsFor(table: unknown, options: FakeExportDatabaseOptions): unknown[] {
  if (table === arsip) return options.canonicalRows
  if (table === manualArsipAttachment) return options.attachmentCountRows
  if (table === users) return options.userRows
  return []
}

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  if (table === users) return 'users'
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
    lampiran_snapshot: [{ nama: 'Should Not Export', url: `${USER_ID}/workflow/${WORKFLOW_ARCHIVE_ID}/a.pdf` }],
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

function userRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: USER_ID,
    display_name: 'Kasubag Arsip',
    nama_lengkap: 'Nama Lengkap Kasubag',
    email: 'kasubag@example.test',
    ...overrides,
  }
}

function createSession(roles: string[]) {
  return {
    user: {
      id: USER_ID,
      email: 'user@example.test',
    },
    userId: USER_ID,
    email: 'user@example.test',
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function expectNoMutationCalls(database: FakeExportDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = String(value)

  expect(serialized).not.toContain(USER_ID)
  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('signed-token')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret.pdf')
  expect(serialized).not.toContain('FILE_CONTENT_SHOULD_NOT_EXPORT')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('/workflow/')
  expect(serialized).not.toContain('/manual/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('metadata')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('raw')
}
