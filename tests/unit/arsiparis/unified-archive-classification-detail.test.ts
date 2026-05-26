import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  getUnifiedArchiveClassificationDetailForDatabase,
  type UnifiedArchiveClassificationDetailDatabase,
} from '#/lib/archive/unified-archive-classification-detail'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const KLASIFIKASI_ID = '22222222-2222-4222-8222-222222222222'
const WORKFLOW_ARCHIVE_ID = '33333333-3333-4333-8333-333333333333'
const MANUAL_ARCHIVE_ID = '44444444-4444-4444-8444-444444444444'
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const MANUAL_SOURCE_ID = '66666666-6666-4666-8666-666666666666'

const authMocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: authMocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

import { Route as ClassificationReportDetailRoute } from '#/routes/api/arsiparis/arsip/classification-report-detail'

type RouteGetHandler = (args: { request: Request }) => Promise<Response>

const classificationReportDetailGetHandler = (ClassificationReportDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('unified archive classification detail helper', () => {
  it('filters by klasifikasiId and returns safe classification contents', async () => {
    const database = createFakeClassificationDetailDatabase({
      canonicalRows: [
        workflowCanonicalRow(),
        manualCanonicalRow({ status_arsip: 'INAKTIF' }),
      ],
      attachmentCountRows: [{
        manual_arsip_id: MANUAL_SOURCE_ID,
        attachment_count: '2',
      }],
    })

    const detail = await getUnifiedArchiveClassificationDetailForDatabase(database, {
      klasifikasiId: KLASIFIKASI_ID,
    })

    expect(detail.classification).toEqual({
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKode: 'KU.01',
      klasifikasiNama: 'Keuangan',
    })
    expect(detail.items).toEqual([
      {
        id: WORKFLOW_ARCHIVE_ID,
        namaArsip: 'Workflow Archive',
        nomorSurat: 'B-001',
        statusArsip: 'AKTIF',
        sourceType: 'WORKFLOW',
        tanggalArsip: '2026-05-24T00:00:00.000Z',
        nominalRealisasi: '100000.00',
        jumlahLampiran: 2,
      },
      {
        id: MANUAL_ARCHIVE_ID,
        namaArsip: 'Manual Archive',
        nomorSurat: 'M-001',
        statusArsip: 'INAKTIF',
        sourceType: 'MANUAL',
        tanggalArsip: '2026-05-24T00:00:00.000Z',
        nominalRealisasi: null,
        jumlahLampiran: 2,
      },
    ])
    expect(database.calls).toContainEqual(['from', 'arsip'])
    expect(database.calls).toContainEqual(['leftJoin', 'arsip', 'dokumenTransaksi'])
    expect(database.calls).toContainEqual(['leftJoin', 'arsip', 'manualArsip'])
    expect(database.calls).toContainEqual(['where', 'arsip'])
    expectNoMutationCalls(database)
    expectNoSensitiveOutput(detail)
  })

  it('supports missing classification rows with fallback labels', async () => {
    const database = createFakeClassificationDetailDatabase({
      canonicalRows: [
        workflowCanonicalRow({
          klasifikasi_id: null,
          klasifikasi_kode_snapshot: ' ',
          klasifikasi_nama_snapshot: null,
        }),
      ],
      attachmentCountRows: [],
    })

    const detail = await getUnifiedArchiveClassificationDetailForDatabase(database, {
      missing: true,
    })

    expect(detail.classification).toEqual({
      klasifikasiId: null,
      klasifikasiKode: 'Tidak tersedia',
      klasifikasiNama: 'Tidak tersedia',
    })
    expect(detail.items).toHaveLength(1)
    expect(database.calls).toContainEqual(['where', 'arsip'])
    expectNoSensitiveOutput(detail)
  })

  it('includes WORKFLOW and MANUAL canonical rows across statuses', async () => {
    const database = createFakeClassificationDetailDatabase({
      canonicalRows: [
        workflowCanonicalRow({ status_arsip: 'AKTIF' }),
        manualCanonicalRow({ status_arsip: 'DIMUSNAHKAN' }),
      ],
      attachmentCountRows: [],
    })

    const detail = await getUnifiedArchiveClassificationDetailForDatabase(database, {
      klasifikasiId: KLASIFIKASI_ID,
    })

    expect(detail.items.map((item) => item.sourceType)).toEqual(['WORKFLOW', 'MANUAL'])
    expect(detail.items.map((item) => item.statusArsip)).toEqual(['AKTIF', 'DIMUSNAHKAN'])
    expect(detail.summary).toMatchObject({
      totalArsip: 2,
      totalWorkflow: 1,
      totalManual: 1,
    })
    expectNoMutationCalls(database)
  })

  it('excludes unlinked legacy manual_arsip rows by reading canonical arsip as the base table', async () => {
    const database = createFakeClassificationDetailDatabase({
      canonicalRows: [manualCanonicalRow()],
      attachmentCountRows: [
        {
          manual_arsip_id: MANUAL_SOURCE_ID,
          attachment_count: '1',
        },
        {
          manual_arsip_id: '77777777-7777-4777-8777-777777777777',
          attachment_count: '99',
        },
      ],
    })

    const detail = await getUnifiedArchiveClassificationDetailForDatabase(database, {
      klasifikasiId: KLASIFIKASI_ID,
    })

    expect(detail.items).toHaveLength(1)
    expect(detail.items[0].id).toBe(MANUAL_ARCHIVE_ID)
    expect(database.calls[1]).toEqual(['from', 'arsip'])
    expectNoMutationCalls(database)
    expectNoSensitiveOutput(detail)
  })

  it('summarizes source counts while all statuses remain eligible', async () => {
    const database = createFakeClassificationDetailDatabase({
      canonicalRows: [
        workflowCanonicalRow({ status_arsip: 'AKTIF' }),
        workflowCanonicalRow({
          id: '88888888-8888-4888-8888-888888888888',
          status_arsip: 'USUL_MUSNAH',
        }),
        manualCanonicalRow({ status_arsip: 'DIMUSNAHKAN' }),
      ],
      attachmentCountRows: [],
    })

    const detail = await getUnifiedArchiveClassificationDetailForDatabase(database, {
      klasifikasiId: KLASIFIKASI_ID,
    })

    expect(detail.summary).toEqual({
      totalArsip: 3,
      totalWorkflow: 2,
      totalManual: 1,
      totalNominalRealisasi: '200000.00',
    })
    expect(detail.items.map((item) => item.statusArsip)).toEqual(['AKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN'])
    expectNoMutationCalls(database)
  })

  it('only contributes WORKFLOW material nominal to item and summary nominal values', async () => {
    const database = createFakeClassificationDetailDatabase({
      canonicalRows: [
        workflowCanonicalRow({ nominal_realisasi: '100000.00', dokumen_is_non_material: false }),
        workflowCanonicalRow({
          id: '99999999-9999-4999-8999-999999999999',
          nominal_realisasi: '500000.00',
          dokumen_is_non_material: true,
        }),
        manualCanonicalRow({ nominal_realisasi: '250000.00' }),
      ],
      attachmentCountRows: [],
    })

    const detail = await getUnifiedArchiveClassificationDetailForDatabase(database, {
      klasifikasiId: KLASIFIKASI_ID,
    })

    expect(detail.items.map((item) => item.nominalRealisasi)).toEqual(['100000.00', null, null])
    expect(detail.summary.totalNominalRealisasi).toBe('100000.00')
    expectNoSensitiveOutput(detail)
  })

  it('applies optional source and status filters through the canonical query', async () => {
    const database = createFakeClassificationDetailDatabase({
      canonicalRows: [manualCanonicalRow({ status_arsip: 'USUL_MUSNAH' })],
      attachmentCountRows: [],
    })

    await getUnifiedArchiveClassificationDetailForDatabase(database, {
      klasifikasiId: KLASIFIKASI_ID,
      statusArsip: 'USUL_MUSNAH',
      sourceType: 'MANUAL',
    })

    expect(database.calls).toContainEqual(['where', 'arsip'])
    expectNoMutationCalls(database)
  })

  it('does not import Supabase or expose sensitive fields', async () => {
    const helperSource = readFileSync('src/lib/archive/unified-archive-classification-detail.ts', 'utf8')
    const routeSource = readFileSync('src/routes/api/arsiparis/arsip/classification-report-detail.ts', 'utf8')

    expect(`${helperSource}\n${routeSource}`).not.toContain('@supabase')
    expect(`${helperSource}\n${routeSource}`).not.toContain('createClient')
    expect(`${helperSource}\n${routeSource}`).not.toContain('logical_path')
    expect(`${helperSource}\n${routeSource}`).not.toContain('signed_url')
    expect(`${helperSource}\n${routeSource}`).not.toContain('storageRoot')
  })
})

describe('unified archive classification detail route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated requests', async () => {
    authMocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await classificationReportDetailGetHandler({
      request: new Request(`http://localhost/api/arsiparis/arsip/classification-report-detail?klasifikasiId=${KLASIFIKASI_ID}`),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for ADMIN-only and non-Kasubag users', async () => {
    for (const roles of [['ADMIN'], ['PEGAWAI']]) {
      authMocks.getLocalServerSession.mockResolvedValueOnce(createSession(roles))

      const response = await classificationReportDetailGetHandler({
        request: new Request(`http://localhost/api/arsiparis/arsip/classification-report-detail?klasifikasiId=${KLASIFIKASI_ID}`),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    }
  })

  it('returns 400 for invalid detail query filters before helper work', async () => {
    authMocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))

    for (const url of [
      'http://localhost/api/arsiparis/arsip/classification-report-detail',
      `http://localhost/api/arsiparis/arsip/classification-report-detail?klasifikasiId=${KLASIFIKASI_ID}&missing=true`,
      'http://localhost/api/arsiparis/arsip/classification-report-detail?missing=false',
      `http://localhost/api/arsiparis/arsip/classification-report-detail?klasifikasiId=${KLASIFIKASI_ID}&status=TERHAPUS`,
      `http://localhost/api/arsiparis/arsip/classification-report-detail?klasifikasiId=${KLASIFIKASI_ID}&source=SUPABASE`,
    ]) {
      const response = await classificationReportDetailGetHandler({ request: new Request(url) })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Filter detail laporan klasifikasi arsip tidak valid' })
    }
  })
})

type FakeClassificationDetailDatabase = UnifiedArchiveClassificationDetailDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeClassificationDetailDatabaseOptions = {
  canonicalRows: unknown[]
  attachmentCountRows: unknown[]
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  leftJoin: (table: unknown, condition: unknown) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  orderBy: (...args: unknown[]) => Promise<unknown[]>
  groupBy: (...args: unknown[]) => Promise<unknown[]>
}

function createFakeClassificationDetailDatabase(
  options: FakeClassificationDetailDatabaseOptions,
): FakeClassificationDetailDatabase {
  const calls: unknown[] = []
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by unified archive classification detail`)
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
        leftJoin(table) {
          calls.push(['leftJoin', tableName(selectedTable), tableName(table)])
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

function rowsFor(table: unknown, options: FakeClassificationDetailDatabaseOptions): unknown[] {
  if (table === arsip) return options.canonicalRows
  if (table === manualArsipAttachment) return options.attachmentCountRows
  return []
}

function workflowCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKFLOW_ARCHIVE_ID,
    source_type: 'WORKFLOW',
    status_arsip: 'AKTIF',
    nama_arsip: 'Workflow Archive',
    nomor_surat: 'B-001',
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'KU.01',
    klasifikasi_nama_snapshot: 'Keuangan',
    archived_at: '2026-05-24T00:00:00.000Z',
    nominal_realisasi: '100000.00',
    dokumen_id: DOKUMEN_ID,
    dokumen_is_non_material: false,
    manual_source_id: null,
    lampiran_snapshot: [
      { nama: 'Should Not Leak', url: `${USER_ID}/workflow/${WORKFLOW_ARCHIVE_ID}/a.pdf` },
      { nama: 'Should Not Leak 2', token: 'signed-token-like-value' },
    ],
    ...overrides,
  }
}

function manualCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_ARCHIVE_ID,
    source_type: 'MANUAL',
    status_arsip: 'AKTIF',
    nama_arsip: 'Manual Archive',
    nomor_surat: 'M-001',
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'KU.01',
    klasifikasi_nama_snapshot: 'Keuangan',
    archived_at: '2026-05-24T00:00:00.000Z',
    nominal_realisasi: '250000.00',
    dokumen_id: null,
    dokumen_is_non_material: null,
    manual_source_id: MANUAL_SOURCE_ID,
    lampiran_snapshot: null,
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

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  if (table === dokumenTransaksi) return 'dokumenTransaksi'
  if (table === manualArsip) return 'manualArsip'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  return 'unknown'
}

function expectNoMutationCalls(database: FakeClassificationDetailDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

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
  expect(serialized).not.toContain('SQL')
}
