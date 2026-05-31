import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  berkasArsip,
  berkasArsipItem,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  getBerkasArsipClassificationDetailForDatabase,
  getBerkasArsipClassificationReportForDatabase,
  type BerkasArsipReportDatabase,
} from '#/lib/archive/berkas-arsip-report'

const BERKAS_ID = '22222222-2222-4222-8222-222222222222'
const ITEM_ID = '44444444-4444-4444-8444-444444444444'
const MANUAL_ARSIP_ID = '66666666-6666-4666-8666-666666666666'
const KLASIFIKASI_ID = '33333333-3333-4333-8333-333333333333'

describe('folder-first berkas report helper', () => {
  it('summarizes folder-first classifications including open, closed, and destroyed metadata', async () => {
    const database = createFakeReportDatabase([
      [
        aggregateRow({
          total_berkas: 6,
          total_open_berkas: 1,
          total_closed_berkas: 5,
          total_arsip: 5,
          total_workflow: 3,
          total_manual: 2,
          total_aktif: 1,
          total_inaktif: 1,
          total_usul_musnah: 1,
          total_dimusnahkan: 2,
          total_nominal_realisasi: '1750000.00',
          logical_path: 'owner/workflow/secret.pdf',
          item_file_key: ITEM_ID,
          token: 'signed-token-value',
        } as any),
      ],
    ])

    const report = await getBerkasArsipClassificationReportForDatabase(database)

    expect(report.rows[0]).toMatchObject({
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKode: 'BB',
      klasifikasiNama: 'Belanja Barang',
      totalBerkas: 6,
      totalOpenBerkas: 1,
      totalClosedBerkas: 5,
      totalArsip: 5,
      totalWorkflow: 3,
      totalManual: 2,
      totalAktif: 1,
      totalInaktif: 1,
      totalUsulMusnah: 1,
      totalDimusnahkan: 2,
      totalNominalRealisasi: '1750000.00',
    })
    expect(report.totals).toMatchObject({
      totalBerkas: 6,
      totalOpenBerkas: 1,
      totalClosedBerkas: 5,
      totalArsip: 5,
      totalWorkflow: 3,
      totalManual: 2,
      totalNominalRealisasi: '1750000.00',
    })
    expect(database.calls).toContainEqual(['from', 'berkasArsip'])
    expect(database.calls).toContainEqual(['leftJoin', 'berkasArsip', 'berkasArsipItem'])
    expectNoSensitiveOutput(report)
    expectNoMutationCalls(database)
  })

  it('returns detail items with safe display keys and no raw ids, paths, tokens, or URLs', async () => {
    const database = createFakeReportDatabase([
      [
        detailRow({
          item_id: ITEM_ID,
          status_berkas: 'OPEN',
          status_arsip: null,
          source_type: 'WORKFLOW',
          workflow_title: 'Laporan Pembayaran',
          workflow_nominal_realisasi: '1000000.00',
          workflow_is_non_material: false,
          workflow_lampiran_urls: JSON.stringify([{ url: 'owner/workflow/secret.pdf', nama: 'Rahasia.pdf' }]),
          logical_path: 'owner/workflow/secret.pdf',
          token: 'signed-token-value',
        } as any),
        detailRow({
          item_id: '99999999-9999-4999-8999-999999999999',
          status_berkas: 'CLOSED',
          status_arsip: 'DIMUSNAHKAN',
          source_type: 'MANUAL',
          workflow_title: null,
          manual_arsip_id: MANUAL_ARSIP_ID,
          manual_nama: 'Dokumen Manual',
          manual_nominal_realisasi: '250000.00',
        }),
      ],
      [
        {
          manual_arsip_id: MANUAL_ARSIP_ID,
          attachment_count: 2,
          logical_path: 'owner/manual/secret.pdf',
        },
      ],
    ])

    const detail = await getBerkasArsipClassificationDetailForDatabase(database, {
      klasifikasiId: KLASIFIKASI_ID,
    })

    expect(detail.items).toEqual([
      expect.objectContaining({
        id: 'row-1',
        statusArsip: 'OPEN',
        sourceType: 'WORKFLOW',
        namaArsip: 'Laporan Pembayaran',
        nominalRealisasi: '1000000.00',
        jumlahLampiran: 1,
      }),
      expect.objectContaining({
        id: 'row-2',
        statusArsip: 'DIMUSNAHKAN',
        sourceType: 'MANUAL',
        namaArsip: 'Dokumen Manual',
        nominalRealisasi: '250000.00',
        jumlahLampiran: 2,
      }),
    ])
    expect(detail.summary).toMatchObject({
      totalBerkas: 1,
      totalArsip: 2,
      totalWorkflow: 1,
      totalManual: 1,
      totalNominalRealisasi: '1250000.00',
    })
    expectNoSensitiveOutput(detail)
    expect(JSON.stringify(detail)).not.toContain(ITEM_ID)
    expect(JSON.stringify(detail)).not.toContain(MANUAL_ARSIP_ID)
    expectNoMutationCalls(database)
  })

  it('keeps active report pages folder-first without using global search or canonical report helpers', () => {
    const reportRouteSource = readFileSync('src/routes/api/arsiparis/arsip/classification-report.ts', 'utf8')
    const detailRouteSource = readFileSync('src/routes/api/arsiparis/arsip/classification-report-detail.ts', 'utf8')
    const reportPageSource = readFileSync('src/routes/arsiparis/laporan-klasifikasi.tsx', 'utf8')
    const detailPageSource = readFileSync('src/routes/arsiparis.laporan-klasifikasi_.detail.tsx', 'utf8')

    expect(reportRouteSource).toContain("from '#/lib/archive/berkas-arsip-report'")
    expect(detailRouteSource).toContain("from '#/lib/archive/berkas-arsip-report'")
    expect(reportRouteSource).not.toContain('unified-archive-classification-report')
    expect(detailRouteSource).not.toContain('unified-archive-classification-detail')
    expect(`${reportPageSource}\n${detailPageSource}`).not.toContain('/arsiparis/search')
    expect(`${reportPageSource}\n${detailPageSource}`).not.toContain('/api/arsiparis/search')
    expect(reportPageSource).toContain('folder-first')
    expect(detailPageSource).toContain('folder-first')
  })
})

type FakeReportDatabase = BerkasArsipReportDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  leftJoin: (table: unknown, condition: unknown) => FakeQuery
  innerJoin: (table: unknown, condition: unknown) => FakeQuery
  where: (...args: unknown[]) => FakeQuery
  groupBy: (...args: unknown[]) => FakeQuery | Promise<unknown[]>
  orderBy: (...args: unknown[]) => Promise<unknown[]>
}

function createFakeReportDatabase(results: unknown[][]): FakeReportDatabase {
  const calls: unknown[] = []
  const queuedResults = [...results]
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by folder-first berkas report`)
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
        innerJoin(table) {
          calls.push(['innerJoin', tableName(selectedTable), tableName(table)])
          return query
        },
        where() {
          calls.push(['where', tableName(selectedTable)])
          return query
        },
        groupBy() {
          calls.push(['groupBy', tableName(selectedTable)])
          if (Object.prototype.hasOwnProperty.call(projection, 'attachment_count')) {
            return Promise.resolve(queuedResults.shift() ?? [])
          }

          return query
        },
        orderBy() {
          calls.push(['orderBy', tableName(selectedTable)])
          return Promise.resolve(queuedResults.shift() ?? [])
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
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'BB',
    klasifikasi_nama_snapshot: 'Belanja Barang',
    total_berkas: 0,
    total_open_berkas: 0,
    total_closed_berkas: 0,
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

function detailRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    item_id: ITEM_ID,
    berkas_id: BERKAS_ID,
    source_type: 'WORKFLOW',
    status_berkas: 'CLOSED',
    status_arsip: 'AKTIF',
    nomor_spm: 'SPM-001/2026',
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'BB',
    klasifikasi_nama_snapshot: 'Belanja Barang',
    closed_at: '2026-05-30T00:00:00.000Z',
    workflow_title: 'Laporan Pembayaran',
    workflow_date: '2026-05-20',
    workflow_nominal_realisasi: '1000000.00',
    workflow_is_non_material: false,
    workflow_lampiran_urls: [],
    manual_arsip_id: null,
    manual_nama: null,
    manual_nomor_surat: null,
    manual_date: null,
    manual_nominal_realisasi: null,
    ...overrides,
  }
}

function tableName(table: unknown): string {
  if (table === berkasArsip) return 'berkasArsip'
  if (table === berkasArsipItem) return 'berkasArsipItem'
  if (table === dokumenTransaksi) return 'dokumenTransaksi'
  if (table === manualArsipAttachment) return 'manualArsipAttachment'
  return 'unknown'
}

function expectNoMutationCalls(database: FakeReportDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('item_file_key')
  expect(serialized).not.toContain('canonical_arsip_id')
  expect(serialized).not.toContain('dokumen_id')
  expect(serialized).not.toContain('manual_arsip_id')
  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
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
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('raw')
  expect(serialized).not.toContain('SQL')
}
