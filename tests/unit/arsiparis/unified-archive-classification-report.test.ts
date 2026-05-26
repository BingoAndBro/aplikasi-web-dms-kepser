import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { arsip } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  getUnifiedArchiveClassificationReportForDatabase,
  type UnifiedArchiveClassificationReportDatabase,
} from '#/lib/archive/unified-archive-classification-report'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const authMocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: authMocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

import { Route as ClassificationReportRoute } from '#/routes/api/arsiparis/arsip/classification-report'

type RouteGetHandler = (args: { request: Request }) => Promise<Response>

const classificationReportGetHandler = (ClassificationReportRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('unified archive classification report helper', () => {
  it('groups by classification and counts workflow, manual, and statuses', async () => {
    const database = createFakeClassificationReportDatabase([
      aggregateRow({
        klasifikasi_id: '22222222-2222-4222-8222-222222222222',
        klasifikasi_kode_snapshot: 'WF.01',
        klasifikasi_nama_snapshot: 'Keuangan',
        total_arsip: '4',
        total_workflow: '2',
        total_manual: '2',
        total_aktif: '1',
        total_inaktif: '1',
        total_usul_musnah: '1',
        total_dimusnahkan: '1',
        total_nominal_realisasi: '150000.00',
      }),
      aggregateRow({
        klasifikasi_id: '33333333-3333-4333-8333-333333333333',
        klasifikasi_kode_snapshot: 'UM.01',
        klasifikasi_nama_snapshot: 'Umum',
        total_arsip: 2,
        total_workflow: 1,
        total_manual: 1,
        total_aktif: 2,
        total_nominal_realisasi: 250000,
      }),
    ])

    const report = await getUnifiedArchiveClassificationReportForDatabase(database)

    expect(report.rows).toEqual([
      {
        klasifikasiId: '22222222-2222-4222-8222-222222222222',
        klasifikasiKode: 'WF.01',
        klasifikasiNama: 'Keuangan',
        totalArsip: 4,
        totalWorkflow: 2,
        totalManual: 2,
        totalAktif: 1,
        totalInaktif: 1,
        totalUsulMusnah: 1,
        totalDimusnahkan: 1,
        totalNominalRealisasi: '150000.00',
      },
      {
        klasifikasiId: '33333333-3333-4333-8333-333333333333',
        klasifikasiKode: 'UM.01',
        klasifikasiNama: 'Umum',
        totalArsip: 2,
        totalWorkflow: 1,
        totalManual: 1,
        totalAktif: 2,
        totalInaktif: 0,
        totalUsulMusnah: 0,
        totalDimusnahkan: 0,
        totalNominalRealisasi: '250000.00',
      },
    ])
    expect(report.totals).toEqual({
      totalArsip: 6,
      totalWorkflow: 3,
      totalManual: 3,
      totalNominalRealisasi: '400000.00',
    })
    expect(database.calls).toContainEqual(['from', 'arsip'])
    expect(database.calls).toContainEqual(['leftJoin', 'arsip', 'dokumenTransaksi'])
    expect(database.calls).toContainEqual(['groupBy', 'arsip'])
    expectNoMutationCalls(database)
    expectNoSensitiveOutput(report)
  })

  it('does not add manual or non-material nominal to the report totals', async () => {
    const database = createFakeClassificationReportDatabase([
      aggregateRow({
        total_arsip: 3,
        total_workflow: 1,
        total_manual: 2,
        total_aktif: 3,
        total_nominal_realisasi: '100000.00',
        logical_path: `${USER_ID}/manual/secret.pdf`,
        token: 'signed-token-value',
        metadata: { secret: 'hidden' },
      } as any),
    ])

    const report = await getUnifiedArchiveClassificationReportForDatabase(database)

    expect(report.rows[0]).toMatchObject({
      totalArsip: 3,
      totalWorkflow: 1,
      totalManual: 2,
      totalNominalRealisasi: '100000.00',
    })
    expect(report.totals.totalNominalRealisasi).toBe('100000.00')
    expectNoSensitiveOutput(report)
    expectNoMutationCalls(database)
  })

  it('uses safe fallback labels when classification metadata is missing', async () => {
    const database = createFakeClassificationReportDatabase([
      aggregateRow({
        klasifikasi_id: null,
        klasifikasi_kode_snapshot: ' ',
        klasifikasi_nama_snapshot: null,
        total_arsip: 1,
      }),
    ])

    const report = await getUnifiedArchiveClassificationReportForDatabase(database)

    expect(report.rows[0]).toMatchObject({
      klasifikasiId: null,
      klasifikasiKode: 'Tidak tersedia',
      klasifikasiNama: 'Tidak tersedia',
      totalArsip: 1,
    })
    expectNoSensitiveOutput(report)
  })

  it('applies optional status and source filters through the canonical archive query', async () => {
    const database = createFakeClassificationReportDatabase([
      aggregateRow({ total_arsip: 1, total_manual: 1 }),
    ])

    await getUnifiedArchiveClassificationReportForDatabase(database, {
      statusArsip: 'DIMUSNAHKAN',
      sourceType: 'MANUAL',
    })

    expect(database.calls).toContainEqual(['where', 'arsip'])
    expectNoMutationCalls(database)
  })

  it('does not import Supabase or expose sensitive fields', async () => {
    const helperSource = readFileSync('src/lib/archive/unified-archive-classification-report.ts', 'utf8')
    const routeSource = readFileSync('src/routes/api/arsiparis/arsip/classification-report.ts', 'utf8')

    expect(`${helperSource}\n${routeSource}`).not.toContain('@supabase')
    expect(`${helperSource}\n${routeSource}`).not.toContain('createClient')
    expect(`${helperSource}\n${routeSource}`).not.toContain('logical_path')
    expect(`${helperSource}\n${routeSource}`).not.toContain('signed_url')
    expect(`${helperSource}\n${routeSource}`).not.toContain('storageRoot')
  })
})

describe('unified archive classification report route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated requests', async () => {
    authMocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await classificationReportGetHandler({
      request: new Request('http://localhost/api/arsiparis/arsip/classification-report'),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for ADMIN-only and non-Kasubag users', async () => {
    for (const roles of [['ADMIN'], ['PEGAWAI']]) {
      authMocks.getLocalServerSession.mockResolvedValueOnce(createSession(roles))

      const response = await classificationReportGetHandler({
        request: new Request('http://localhost/api/arsiparis/arsip/classification-report'),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    }
  })

  it('returns 400 for invalid filters before report work', async () => {
    authMocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))

    for (const url of [
      'http://localhost/api/arsiparis/arsip/classification-report?status=TERHAPUS',
      'http://localhost/api/arsiparis/arsip/classification-report?source=SUPABASE',
    ]) {
      const response = await classificationReportGetHandler({ request: new Request(url) })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Filter laporan klasifikasi arsip tidak valid' })
    }
  })
})

type FakeClassificationReportDatabase = UnifiedArchiveClassificationReportDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  leftJoin: (table: unknown, condition: unknown) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  groupBy: (...args: unknown[]) => FakeQuery
  orderBy: (...args: unknown[]) => Promise<unknown[]>
}

function createFakeClassificationReportDatabase(
  aggregateRows: unknown[],
): FakeClassificationReportDatabase {
  const calls: unknown[] = []
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by unified archive classification report`)
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
        groupBy() {
          calls.push(['groupBy', tableName(selectedTable)])
          return query
        },
        orderBy() {
          calls.push(['orderBy', tableName(selectedTable)])
          return Promise.resolve(aggregateRows)
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

function aggregateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    klasifikasi_id: '22222222-2222-4222-8222-222222222222',
    klasifikasi_kode_snapshot: 'WF.01',
    klasifikasi_nama_snapshot: 'Keuangan',
    total_arsip: 0,
    total_workflow: 0,
    total_manual: 0,
    total_aktif: 0,
    total_inaktif: 0,
    total_usul_musnah: 0,
    total_dimusnahkan: 0,
    total_nominal_realisasi: '0.00',
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
  return 'unknown'
}

function expectNoMutationCalls(database: FakeClassificationReportDatabase): void {
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
