import { and, asc, eq, sql, type SQL } from 'drizzle-orm'

import { arsip } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ARCHIVE_SOURCE_TYPE_VALUES,
  ARCHIVE_STATUS_VALUES,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export type UnifiedArchiveClassificationReportRow = {
  klasifikasiId: string | null
  klasifikasiKode: string
  klasifikasiNama: string
  totalArsip: number
  totalWorkflow: number
  totalManual: number
  totalAktif: number
  totalInaktif: number
  totalUsulMusnah: number
  totalDimusnahkan: number
  totalNominalRealisasi: string
}

export type UnifiedArchiveClassificationReportTotals = {
  totalArsip: number
  totalWorkflow: number
  totalManual: number
  totalNominalRealisasi: string
}

export type UnifiedArchiveClassificationReport = {
  rows: UnifiedArchiveClassificationReportRow[]
  totals: UnifiedArchiveClassificationReportTotals
}

export type UnifiedArchiveClassificationReportFilters = {
  statusArsip?: StatusArsip
  sourceType?: ArchiveSourceType
}

export type UnifiedArchiveClassificationReportDatabase = {
  select(projection: Record<string, unknown>): UnifiedArchiveClassificationReportSelectFrom
}

type UnifiedArchiveClassificationReportSelectFrom = {
  from(table: unknown): any
}

type ClassificationReportAggregateRow = {
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  total_arsip: string | number | null
  total_workflow: string | number | null
  total_manual: string | number | null
  total_aktif: string | number | null
  total_inaktif: string | number | null
  total_usul_musnah: string | number | null
  total_dimusnahkan: string | number | null
  total_nominal_realisasi: string | number | null
}

const FALLBACK_CLASSIFICATION_LABEL = 'Tidak tersedia'

export async function getUnifiedArchiveClassificationReport(
  filters: UnifiedArchiveClassificationReportFilters = {},
): Promise<UnifiedArchiveClassificationReport> {
  const { db } = await import('#/db/client')

  return getUnifiedArchiveClassificationReportForDatabase(
    db as unknown as UnifiedArchiveClassificationReportDatabase,
    filters,
  )
}

export async function getUnifiedArchiveClassificationReportForDatabase(
  database: UnifiedArchiveClassificationReportDatabase,
  filters: UnifiedArchiveClassificationReportFilters = {},
): Promise<UnifiedArchiveClassificationReport> {
  const rows = await selectClassificationReportRows(database, normalizeReportFilters(filters))
  const mappedRows = rows.map(mapClassificationReportRow)

  return {
    rows: mappedRows,
    totals: summarizeClassificationReportRows(mappedRows),
  }
}

export function parseClassificationReportStatusFilter(value: string | null | undefined): StatusArsip | undefined {
  if (!value || value === 'ALL') return undefined
  return ARCHIVE_STATUS_VALUES.includes(value as StatusArsip) ? value as StatusArsip : undefined
}

export function parseClassificationReportSourceFilter(value: string | null | undefined): ArchiveSourceType | undefined {
  if (!value || value === 'ALL') return undefined
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType) ? value as ArchiveSourceType : undefined
}

type NormalizedClassificationReportFilters = {
  statusArsip: StatusArsip | null
  sourceType: ArchiveSourceType | null
}

async function selectClassificationReportRows(
  database: UnifiedArchiveClassificationReportDatabase,
  filters: NormalizedClassificationReportFilters,
): Promise<ClassificationReportAggregateRow[]> {
  const whereFilters: SQL[] = []
  if (filters.statusArsip) whereFilters.push(eq(arsip.statusArsip, filters.statusArsip))
  if (filters.sourceType) whereFilters.push(eq(arsip.sourceType, filters.sourceType))

  let builder = database
    .select({
      klasifikasi_id: arsip.klasifikasiId,
      klasifikasi_kode_snapshot: arsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: arsip.klasifikasiNamaSnapshot,
      total_arsip: sql<number>`count(${arsip.id})`,
      total_workflow: sql<number>`sum(case when ${arsip.sourceType} = 'WORKFLOW' then 1 else 0 end)`,
      total_manual: sql<number>`sum(case when ${arsip.sourceType} = 'MANUAL' then 1 else 0 end)`,
      total_aktif: sql<number>`sum(case when ${arsip.statusArsip} = 'AKTIF' then 1 else 0 end)`,
      total_inaktif: sql<number>`sum(case when ${arsip.statusArsip} = 'INAKTIF' then 1 else 0 end)`,
      total_usul_musnah: sql<number>`sum(case when ${arsip.statusArsip} = 'USUL_MUSNAH' then 1 else 0 end)`,
      total_dimusnahkan: sql<number>`sum(case when ${arsip.statusArsip} = 'DIMUSNAHKAN' then 1 else 0 end)`,
      total_nominal_realisasi: sql<string>`
        coalesce(sum(case
          when ${arsip.sourceType} = 'WORKFLOW'
            and ${dokumenTransaksi.id} is not null
            and ${dokumenTransaksi.isNonMaterial} = false
          then coalesce(${arsip.nominalRealisasi}, 0)
          else 0
        end), 0)
      `,
    })
    .from(arsip)
    .leftJoin(dokumenTransaksi, eq(dokumenTransaksi.id, arsip.dokumenId)) as any

  if (whereFilters.length > 0) {
    builder = builder.where(and(...whereFilters))
  }

  return builder
    .groupBy(
      arsip.klasifikasiId,
      arsip.klasifikasiKodeSnapshot,
      arsip.klasifikasiNamaSnapshot,
    )
    .orderBy(
      asc(arsip.klasifikasiKodeSnapshot),
      asc(arsip.klasifikasiNamaSnapshot),
      asc(arsip.klasifikasiId),
    ) as Promise<ClassificationReportAggregateRow[]>
}

function mapClassificationReportRow(
  row: ClassificationReportAggregateRow,
): UnifiedArchiveClassificationReportRow {
  return {
    klasifikasiId: trimToNull(row.klasifikasi_id),
    klasifikasiKode: trimToNull(row.klasifikasi_kode_snapshot) ?? FALLBACK_CLASSIFICATION_LABEL,
    klasifikasiNama: trimToNull(row.klasifikasi_nama_snapshot) ?? FALLBACK_CLASSIFICATION_LABEL,
    totalArsip: normalizeCount(row.total_arsip),
    totalWorkflow: normalizeCount(row.total_workflow),
    totalManual: normalizeCount(row.total_manual),
    totalAktif: normalizeCount(row.total_aktif),
    totalInaktif: normalizeCount(row.total_inaktif),
    totalUsulMusnah: normalizeCount(row.total_usul_musnah),
    totalDimusnahkan: normalizeCount(row.total_dimusnahkan),
    totalNominalRealisasi: normalizeNominalSum(row.total_nominal_realisasi),
  }
}

function summarizeClassificationReportRows(
  rows: UnifiedArchiveClassificationReportRow[],
): UnifiedArchiveClassificationReportTotals {
  let totalArsip = 0
  let totalWorkflow = 0
  let totalManual = 0
  let totalNominal = 0

  for (const row of rows) {
    totalArsip += row.totalArsip
    totalWorkflow += row.totalWorkflow
    totalManual += row.totalManual
    totalNominal += Number(row.totalNominalRealisasi)
  }

  return {
    totalArsip,
    totalWorkflow,
    totalManual,
    totalNominalRealisasi: Number.isFinite(totalNominal) ? totalNominal.toFixed(2) : '0.00',
  }
}

function normalizeReportFilters(
  filters: UnifiedArchiveClassificationReportFilters,
): NormalizedClassificationReportFilters {
  return {
    statusArsip: filters.statusArsip && ARCHIVE_STATUS_VALUES.includes(filters.statusArsip)
      ? filters.statusArsip
      : null,
    sourceType: filters.sourceType && ARCHIVE_SOURCE_TYPE_VALUES.includes(filters.sourceType)
      ? filters.sourceType
      : null,
  }
}

function normalizeCount(value: string | number | null | undefined): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0
}

function normalizeNominalSum(value: string | number | null | undefined): string {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(2) : '0.00'
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}
