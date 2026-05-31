import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'

import {
  berkasArsip,
  berkasArsipItem,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_SOURCE_TYPE_VALUES,
  ARCHIVE_STATUS_VALUES,
  BERKAS_STATUS,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export type BerkasArsipClassificationReportRow = {
  klasifikasiId: string | null
  klasifikasiKode: string
  klasifikasiNama: string
  totalBerkas: number
  totalOpenBerkas: number
  totalClosedBerkas: number
  totalArsip: number
  totalWorkflow: number
  totalManual: number
  totalAktif: number
  totalInaktif: number
  totalUsulMusnah: number
  totalDimusnahkan: number
  totalNominalRealisasi: string
}

export type BerkasArsipClassificationReportTotals = {
  totalBerkas: number
  totalOpenBerkas: number
  totalClosedBerkas: number
  totalArsip: number
  totalWorkflow: number
  totalManual: number
  totalNominalRealisasi: string
}

export type BerkasArsipClassificationReport = {
  rows: BerkasArsipClassificationReportRow[]
  totals: BerkasArsipClassificationReportTotals
}

export type BerkasArsipClassificationReportFilters = {
  statusArsip?: StatusArsip
  sourceType?: ArchiveSourceType
}

export type BerkasArsipClassificationDetailClassification = {
  klasifikasiId: string | null
  klasifikasiKode: string
  klasifikasiNama: string
}

export type BerkasArsipClassificationDetailItemStatus = StatusArsip | 'OPEN' | 'BELUM_FINAL'

export type BerkasArsipClassificationDetailItem = {
  id: string
  namaArsip: string
  nomorSurat: string | null
  statusArsip: BerkasArsipClassificationDetailItemStatus
  sourceType: ArchiveSourceType
  tanggalArsip: string | null
  nominalRealisasi: string | null
  jumlahLampiran: number
}

export type BerkasArsipClassificationDetailSummary = {
  totalBerkas: number
  totalArsip: number
  totalWorkflow: number
  totalManual: number
  totalNominalRealisasi: string
}

export type BerkasArsipClassificationDetail = {
  classification: BerkasArsipClassificationDetailClassification
  items: BerkasArsipClassificationDetailItem[]
  summary: BerkasArsipClassificationDetailSummary
}

export type BerkasArsipClassificationDetailQuery = {
  klasifikasiId?: string
  missing?: boolean
  statusArsip?: StatusArsip
  sourceType?: ArchiveSourceType
}

export type BerkasArsipReportDatabase = {
  select(projection: Record<string, unknown>): {
    from(table: unknown): any
  }
}

type ClassificationReportAggregateRow = {
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  total_berkas: string | number | null
  total_open_berkas: string | number | null
  total_closed_berkas: string | number | null
  total_arsip: string | number | null
  total_workflow: string | number | null
  total_manual: string | number | null
  total_aktif: string | number | null
  total_inaktif: string | number | null
  total_usul_musnah: string | number | null
  total_dimusnahkan: string | number | null
  total_nominal_realisasi: string | number | null
}

type ClassificationDetailItemRow = {
  item_id: string
  berkas_id: string
  source_type: ArchiveSourceType | string
  status_berkas: string
  status_arsip: StatusArsip | string | null
  nomor_spm: string | null
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  closed_at: Date | string | null
  workflow_title: string | null
  workflow_date: Date | string | null
  workflow_nominal_realisasi: string | number | null
  workflow_is_non_material: boolean | null
  workflow_lampiran_urls: unknown
  manual_arsip_id: string | null
  manual_nama: string | null
  manual_nomor_surat: string | null
  manual_date: Date | string | null
  manual_nominal_realisasi: string | number | null
}

type ManualAttachmentCountRow = {
  manual_arsip_id: string
  attachment_count: string | number | null
}

type NormalizedReportFilters = {
  statusArsip: StatusArsip | null
  sourceType: ArchiveSourceType | null
}

type NormalizedDetailQuery = {
  klasifikasiId: string | null
  missing: boolean
  statusArsip: StatusArsip | null
  sourceType: ArchiveSourceType | null
}

const FALLBACK_CLASSIFICATION_LABEL = 'Tidak tersedia'

export async function getBerkasArsipClassificationReport(
  filters: BerkasArsipClassificationReportFilters = {},
): Promise<BerkasArsipClassificationReport> {
  const { db } = await import('#/db/client')

  return getBerkasArsipClassificationReportForDatabase(db as unknown as BerkasArsipReportDatabase, filters)
}

export async function getBerkasArsipClassificationReportForDatabase(
  database: BerkasArsipReportDatabase,
  filters: BerkasArsipClassificationReportFilters = {},
): Promise<BerkasArsipClassificationReport> {
  const rows = await selectClassificationReportRows(database, normalizeReportFilters(filters))
  const mappedRows = rows.map(mapClassificationReportRow)

  return {
    rows: mappedRows,
    totals: summarizeClassificationReportRows(mappedRows),
  }
}

export async function getBerkasArsipClassificationDetail(
  query: BerkasArsipClassificationDetailQuery,
): Promise<BerkasArsipClassificationDetail> {
  const { db } = await import('#/db/client')

  return getBerkasArsipClassificationDetailForDatabase(db as unknown as BerkasArsipReportDatabase, query)
}

export async function getBerkasArsipClassificationDetailForDatabase(
  database: BerkasArsipReportDatabase,
  query: BerkasArsipClassificationDetailQuery,
): Promise<BerkasArsipClassificationDetail> {
  const normalizedQuery = normalizeDetailQuery(query)
  const rows = await selectClassificationDetailRows(database, normalizedQuery)
  const manualAttachmentCounts = await selectManualAttachmentCounts(
    database,
    rows
      .map((row) => trimToNull(row.manual_arsip_id))
      .filter((id): id is string => Boolean(id)),
  )
  const items = rows.map((row, index) => mapClassificationDetailItem(row, manualAttachmentCounts, index))

  return {
    classification: getClassificationLabel(normalizedQuery, rows),
    items,
    summary: summarizeClassificationDetailItems(items, rows),
  }
}

export function parseBerkasArsipReportStatusFilter(value: string | null | undefined): StatusArsip | undefined {
  if (!value || value === 'ALL') return undefined
  return ARCHIVE_STATUS_VALUES.includes(value as StatusArsip) ? value as StatusArsip : undefined
}

export function parseBerkasArsipReportSourceFilter(value: string | null | undefined): ArchiveSourceType | undefined {
  if (!value || value === 'ALL') return undefined
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType) ? value as ArchiveSourceType : undefined
}

async function selectClassificationReportRows(
  database: BerkasArsipReportDatabase,
  filters: NormalizedReportFilters,
): Promise<ClassificationReportAggregateRow[]> {
  const whereFilters = buildReportWhereFilters(filters)

  let builder = database
    .select({
      klasifikasi_id: berkasArsip.klasifikasiId,
      klasifikasi_kode_snapshot: berkasArsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: berkasArsip.klasifikasiNamaSnapshot,
      total_berkas: sql<number>`count(distinct ${berkasArsip.id})`,
      total_open_berkas: sql<number>`count(distinct case when ${berkasArsip.statusBerkas} = 'OPEN' then ${berkasArsip.id} end)`,
      total_closed_berkas: sql<number>`count(distinct case when ${berkasArsip.statusBerkas} = 'CLOSED' then ${berkasArsip.id} end)`,
      total_arsip: sql<number>`count(${berkasArsipItem.id})`,
      total_workflow: sql<number>`sum(case when ${berkasArsipItem.sourceType} = 'WORKFLOW' then 1 else 0 end)`,
      total_manual: sql<number>`sum(case when ${berkasArsipItem.sourceType} = 'MANUAL' then 1 else 0 end)`,
      total_aktif: sql<number>`sum(case when ${berkasArsip.statusArsip} = 'AKTIF' and ${berkasArsipItem.id} is not null then 1 else 0 end)`,
      total_inaktif: sql<number>`sum(case when ${berkasArsip.statusArsip} = 'INAKTIF' and ${berkasArsipItem.id} is not null then 1 else 0 end)`,
      total_usul_musnah: sql<number>`sum(case when ${berkasArsip.statusArsip} = 'USUL_MUSNAH' and ${berkasArsipItem.id} is not null then 1 else 0 end)`,
      total_dimusnahkan: sql<number>`sum(case when ${berkasArsip.statusArsip} = 'DIMUSNAHKAN' and ${berkasArsipItem.id} is not null then 1 else 0 end)`,
      total_nominal_realisasi: sql<string>`
        coalesce(sum(case
          when ${berkasArsipItem.sourceType} = 'WORKFLOW'
            and ${dokumenTransaksi.isNonMaterial} = false
          then coalesce(${dokumenTransaksi.nominalRealisasi}, 0)
          when ${berkasArsipItem.sourceType} = 'MANUAL'
          then coalesce(${manualArsip.nominalRealisasi}, 0)
          else 0
        end), 0)
      `,
    })
    .from(berkasArsip)
    .leftJoin(berkasArsipItem, eq(berkasArsipItem.berkasId, berkasArsip.id))
    .leftJoin(dokumenTransaksi, eq(dokumenTransaksi.id, berkasArsipItem.dokumenId))
    .leftJoin(manualArsip, eq(manualArsip.id, berkasArsipItem.manualArsipId)) as any

  if (whereFilters.length > 0) builder = builder.where(and(...whereFilters))

  return builder
    .groupBy(
      berkasArsip.klasifikasiId,
      berkasArsip.klasifikasiKodeSnapshot,
      berkasArsip.klasifikasiNamaSnapshot,
    )
    .orderBy(
      berkasArsip.klasifikasiKodeSnapshot,
      berkasArsip.klasifikasiNamaSnapshot,
      berkasArsip.klasifikasiId,
    ) as Promise<ClassificationReportAggregateRow[]>
}

async function selectClassificationDetailRows(
  database: BerkasArsipReportDatabase,
  query: NormalizedDetailQuery,
): Promise<ClassificationDetailItemRow[]> {
  const filters: SQL[] = []

  if (query.klasifikasiId) filters.push(eq(berkasArsip.klasifikasiId, query.klasifikasiId))
  else if (query.missing) filters.push(isNull(berkasArsip.klasifikasiId))
  if (query.statusArsip) filters.push(eq(berkasArsip.statusArsip, query.statusArsip))
  if (query.sourceType) filters.push(eq(berkasArsipItem.sourceType, query.sourceType))

  let builder = database
    .select({
      item_id: berkasArsipItem.id,
      berkas_id: berkasArsip.id,
      source_type: berkasArsipItem.sourceType,
      status_berkas: berkasArsip.statusBerkas,
      status_arsip: berkasArsip.statusArsip,
      nomor_spm: berkasArsip.nomorSpm,
      klasifikasi_id: berkasArsip.klasifikasiId,
      klasifikasi_kode_snapshot: berkasArsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: berkasArsip.klasifikasiNamaSnapshot,
      closed_at: berkasArsip.closedAt,
      workflow_title: dokumenTransaksi.judul,
      workflow_date: dokumenTransaksi.tanggal,
      workflow_nominal_realisasi: dokumenTransaksi.nominalRealisasi,
      workflow_is_non_material: dokumenTransaksi.isNonMaterial,
      workflow_lampiran_urls: dokumenTransaksi.lampiranUrls,
      manual_arsip_id: manualArsip.id,
      manual_nama: manualArsip.nama,
      manual_nomor_surat: manualArsip.nomorSurat,
      manual_date: manualArsip.tanggal,
      manual_nominal_realisasi: manualArsip.nominalRealisasi,
    })
    .from(berkasArsip)
    .innerJoin(berkasArsipItem, eq(berkasArsipItem.berkasId, berkasArsip.id))
    .leftJoin(dokumenTransaksi, eq(dokumenTransaksi.id, berkasArsipItem.dokumenId))
    .leftJoin(manualArsip, eq(manualArsip.id, berkasArsipItem.manualArsipId)) as any

  if (filters.length > 0) builder = builder.where(and(...filters))

  return builder.orderBy(
    desc(berkasArsip.closedAt),
    desc(berkasArsip.updatedAt),
    desc(berkasArsipItem.addedAt),
    desc(berkasArsipItem.id),
  ) as Promise<ClassificationDetailItemRow[]>
}

async function selectManualAttachmentCounts(
  database: BerkasArsipReportDatabase,
  manualArsipIds: string[],
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(manualArsipIds)]
  if (uniqueIds.length === 0) return new Map()

  const rows = await database
    .select({
      manual_arsip_id: manualArsipAttachment.manualArsipId,
      attachment_count: sql<number>`count(${manualArsipAttachment.id})`,
    })
    .from(manualArsipAttachment)
    .where(inArray(manualArsipAttachment.manualArsipId, uniqueIds))
    .groupBy(manualArsipAttachment.manualArsipId) as ManualAttachmentCountRow[]

  return new Map(rows.map((row) => [row.manual_arsip_id, normalizeCount(row.attachment_count)]))
}

function mapClassificationReportRow(
  row: ClassificationReportAggregateRow,
): BerkasArsipClassificationReportRow {
  return {
    klasifikasiId: trimToNull(row.klasifikasi_id),
    klasifikasiKode: trimToNull(row.klasifikasi_kode_snapshot) ?? FALLBACK_CLASSIFICATION_LABEL,
    klasifikasiNama: trimToNull(row.klasifikasi_nama_snapshot) ?? FALLBACK_CLASSIFICATION_LABEL,
    totalBerkas: normalizeCount(row.total_berkas),
    totalOpenBerkas: normalizeCount(row.total_open_berkas),
    totalClosedBerkas: normalizeCount(row.total_closed_berkas),
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

function mapClassificationDetailItem(
  row: ClassificationDetailItemRow,
  manualAttachmentCounts: Map<string, number>,
  index: number,
): BerkasArsipClassificationDetailItem {
  const sourceType = normalizeSourceType(row.source_type)

  return {
    id: `row-${index + 1}`,
    namaArsip: getSourceTitle(row, sourceType),
    nomorSurat: sourceType === ARCHIVE_SOURCE_TYPE.MANUAL
      ? trimToNull(row.manual_nomor_surat)
      : trimToNull(row.nomor_spm),
    statusArsip: getFolderStatusForItem(row),
    sourceType,
    tanggalArsip: getSourceDate(row, sourceType),
    nominalRealisasi: getSourceNominal(row, sourceType),
    jumlahLampiran: getAttachmentCount(row, sourceType, manualAttachmentCounts),
  }
}

function summarizeClassificationReportRows(
  rows: BerkasArsipClassificationReportRow[],
): BerkasArsipClassificationReportTotals {
  let totalBerkas = 0
  let totalOpenBerkas = 0
  let totalClosedBerkas = 0
  let totalArsip = 0
  let totalWorkflow = 0
  let totalManual = 0
  let totalNominal = 0

  for (const row of rows) {
    totalBerkas += row.totalBerkas
    totalOpenBerkas += row.totalOpenBerkas
    totalClosedBerkas += row.totalClosedBerkas
    totalArsip += row.totalArsip
    totalWorkflow += row.totalWorkflow
    totalManual += row.totalManual
    totalNominal += Number(row.totalNominalRealisasi)
  }

  return {
    totalBerkas,
    totalOpenBerkas,
    totalClosedBerkas,
    totalArsip,
    totalWorkflow,
    totalManual,
    totalNominalRealisasi: Number.isFinite(totalNominal) ? totalNominal.toFixed(2) : '0.00',
  }
}

function summarizeClassificationDetailItems(
  items: BerkasArsipClassificationDetailItem[],
  rows: ClassificationDetailItemRow[],
): BerkasArsipClassificationDetailSummary {
  let totalWorkflow = 0
  let totalManual = 0
  let totalNominal = 0

  for (const item of items) {
    if (item.sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) totalWorkflow += 1
    if (item.sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) totalManual += 1
    if (item.nominalRealisasi) {
      const nominal = Number(item.nominalRealisasi)
      if (Number.isFinite(nominal) && nominal > 0) totalNominal += nominal
    }
  }

  return {
    totalBerkas: new Set(rows.map((row) => row.berkas_id)).size,
    totalArsip: items.length,
    totalWorkflow,
    totalManual,
    totalNominalRealisasi: totalNominal > 0 ? totalNominal.toFixed(2) : '0.00',
  }
}

function getClassificationLabel(
  query: NormalizedDetailQuery,
  rows: ClassificationDetailItemRow[],
): BerkasArsipClassificationDetailClassification {
  const firstRow = rows[0]
  if (!firstRow) {
    return {
      klasifikasiId: query.klasifikasiId,
      klasifikasiKode: FALLBACK_CLASSIFICATION_LABEL,
      klasifikasiNama: FALLBACK_CLASSIFICATION_LABEL,
    }
  }

  return {
    klasifikasiId: trimToNull(firstRow.klasifikasi_id),
    klasifikasiKode: trimToNull(firstRow.klasifikasi_kode_snapshot) ?? FALLBACK_CLASSIFICATION_LABEL,
    klasifikasiNama: trimToNull(firstRow.klasifikasi_nama_snapshot) ?? FALLBACK_CLASSIFICATION_LABEL,
  }
}

function buildReportWhereFilters(filters: NormalizedReportFilters): SQL[] {
  const whereFilters: SQL[] = []
  if (filters.statusArsip) whereFilters.push(eq(berkasArsip.statusArsip, filters.statusArsip))
  if (filters.sourceType) whereFilters.push(eq(berkasArsipItem.sourceType, filters.sourceType))

  return whereFilters
}

function normalizeReportFilters(filters: BerkasArsipClassificationReportFilters): NormalizedReportFilters {
  return {
    statusArsip: filters.statusArsip && ARCHIVE_STATUS_VALUES.includes(filters.statusArsip)
      ? filters.statusArsip
      : null,
    sourceType: filters.sourceType && ARCHIVE_SOURCE_TYPE_VALUES.includes(filters.sourceType)
      ? filters.sourceType
      : null,
  }
}

function normalizeDetailQuery(query: BerkasArsipClassificationDetailQuery): NormalizedDetailQuery {
  return {
    klasifikasiId: trimToNull(query.klasifikasiId),
    missing: query.missing === true,
    statusArsip: ARCHIVE_STATUS_VALUES.includes(query.statusArsip as StatusArsip)
      ? query.statusArsip as StatusArsip
      : null,
    sourceType: ARCHIVE_SOURCE_TYPE_VALUES.includes(query.sourceType as ArchiveSourceType)
      ? query.sourceType as ArchiveSourceType
      : null,
  }
}

function getSourceTitle(row: ClassificationDetailItemRow, sourceType: ArchiveSourceType): string {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    return trimToNull(row.workflow_title) ?? 'Dokumen workflow'
  }

  return trimToNull(row.manual_nama) ?? 'Dokumen manual'
}

function getSourceDate(row: ClassificationDetailItemRow, sourceType: ArchiveSourceType): string | null {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) return toIsoLikeString(row.workflow_date)
  return toIsoLikeString(row.manual_date)
}

function getSourceNominal(row: ClassificationDetailItemRow, sourceType: ArchiveSourceType): string | null {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    if (row.workflow_is_non_material === true) return null
    return normalizePositiveNominal(row.workflow_nominal_realisasi)
  }

  return normalizePositiveNominal(row.manual_nominal_realisasi)
}

function getFolderStatusForItem(row: ClassificationDetailItemRow): BerkasArsipClassificationDetailItemStatus {
  if (ARCHIVE_STATUS_VALUES.includes(row.status_arsip as StatusArsip)) return row.status_arsip as StatusArsip
  return row.status_berkas === BERKAS_STATUS.OPEN ? 'OPEN' : 'BELUM_FINAL'
}

function getAttachmentCount(
  row: ClassificationDetailItemRow,
  sourceType: ArchiveSourceType,
  manualAttachmentCounts: Map<string, number>,
): number {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) return countJsonArray(row.workflow_lampiran_urls)

  const manualArsipId = trimToNull(row.manual_arsip_id)
  return manualArsipId ? manualAttachmentCounts.get(manualArsipId) ?? 0 : 0
}

function countJsonArray(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value === null || value === undefined) return 0
  if (typeof value !== 'string') return 0

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function normalizeSourceType(value: string | null | undefined): ArchiveSourceType {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
    ? value as ArchiveSourceType
    : ARCHIVE_SOURCE_TYPE.WORKFLOW
}

function normalizeCount(value: string | number | null | undefined): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0
}

function normalizeNominalSum(value: string | number | null | undefined): string {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(2) : '0.00'
}

function normalizePositiveNominal(value: string | number | null | undefined): string | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(2) : null
}

function toIsoLikeString(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString()
  return trimToNull(value)
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}
