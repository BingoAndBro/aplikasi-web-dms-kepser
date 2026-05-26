import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ARCHIVE_SOURCE_TYPE_VALUES,
  ARCHIVE_STATUS_VALUES,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export type UnifiedArchiveClassificationDetailClassification = {
  klasifikasiId: string | null
  klasifikasiKode: string
  klasifikasiNama: string
}

export type UnifiedArchiveClassificationDetailItem = {
  id: string
  namaArsip: string
  nomorSurat: string | null
  statusArsip: StatusArsip
  sourceType: ArchiveSourceType
  tanggalArsip: string | null
  nominalRealisasi: string | null
  jumlahLampiran: number
}

export type UnifiedArchiveClassificationDetailSummary = {
  totalArsip: number
  totalWorkflow: number
  totalManual: number
  totalNominalRealisasi: string
}

export type UnifiedArchiveClassificationDetail = {
  classification: UnifiedArchiveClassificationDetailClassification
  items: UnifiedArchiveClassificationDetailItem[]
  summary: UnifiedArchiveClassificationDetailSummary
}

export type UnifiedArchiveClassificationDetailQuery = {
  klasifikasiId?: string
  missing?: boolean
  statusArsip?: StatusArsip
  sourceType?: ArchiveSourceType
}

export type UnifiedArchiveClassificationDetailDatabase = {
  select(projection: Record<string, unknown>): UnifiedArchiveClassificationDetailSelectFrom
}

type UnifiedArchiveClassificationDetailSelectFrom = {
  from(table: unknown): any
}

type ClassificationDetailCanonicalRow = {
  id: string
  source_type: ArchiveSourceType | string | null
  status_arsip: StatusArsip
  nama_arsip: string | null
  nomor_surat: string | null
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  archived_at: Date | string | null
  nominal_realisasi: string | number | null
  dokumen_id: string | null
  dokumen_is_non_material: boolean | null
  manual_source_id: string | null
  lampiran_snapshot: unknown
}

type ManualAttachmentCountRow = {
  manual_arsip_id: string
  attachment_count: string | number | null
}

const FALLBACK_CLASSIFICATION_LABEL = 'Tidak tersedia'

export async function getUnifiedArchiveClassificationDetail(
  query: UnifiedArchiveClassificationDetailQuery,
): Promise<UnifiedArchiveClassificationDetail> {
  const { db } = await import('#/db/client')

  return getUnifiedArchiveClassificationDetailForDatabase(
    db as unknown as UnifiedArchiveClassificationDetailDatabase,
    query,
  )
}

export async function getUnifiedArchiveClassificationDetailForDatabase(
  database: UnifiedArchiveClassificationDetailDatabase,
  query: UnifiedArchiveClassificationDetailQuery,
): Promise<UnifiedArchiveClassificationDetail> {
  const normalizedQuery = normalizeClassificationDetailQuery(query)
  const canonicalRows = await selectClassificationDetailRows(database, normalizedQuery)
  const manualAttachmentCounts = await selectManualAttachmentCounts(
    database,
    canonicalRows
      .map((row) => trimToNull(row.manual_source_id))
      .filter((id): id is string => Boolean(id)),
  )
  const items = canonicalRows.map((row) => mapClassificationDetailItem(row, manualAttachmentCounts))

  return {
    classification: getClassificationLabel(normalizedQuery, canonicalRows),
    items,
    summary: summarizeClassificationDetailItems(items),
  }
}

type NormalizedClassificationDetailQuery = {
  klasifikasiId: string | null
  missing: boolean
  statusArsip: StatusArsip | null
  sourceType: ArchiveSourceType | null
}

async function selectClassificationDetailRows(
  database: UnifiedArchiveClassificationDetailDatabase,
  query: NormalizedClassificationDetailQuery,
): Promise<ClassificationDetailCanonicalRow[]> {
  const filters: SQL[] = []

  if (query.klasifikasiId) {
    filters.push(eq(arsip.klasifikasiId, query.klasifikasiId))
  } else if (query.missing) {
    filters.push(isNull(arsip.klasifikasiId))
    filters.push(isBlankSql(arsip.klasifikasiKodeSnapshot))
    filters.push(isBlankSql(arsip.klasifikasiNamaSnapshot))
  }

  if (query.statusArsip) filters.push(eq(arsip.statusArsip, query.statusArsip))
  if (query.sourceType) filters.push(eq(arsip.sourceType, query.sourceType))

  let builder = database
    .select({
      id: arsip.id,
      source_type: arsip.sourceType,
      status_arsip: arsip.statusArsip,
      nama_arsip: arsip.namaArsip,
      nomor_surat: arsip.nomorSurat,
      klasifikasi_id: arsip.klasifikasiId,
      klasifikasi_kode_snapshot: arsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: arsip.klasifikasiNamaSnapshot,
      archived_at: arsip.archivedAt,
      nominal_realisasi: arsip.nominalRealisasi,
      dokumen_id: arsip.dokumenId,
      dokumen_is_non_material: dokumenTransaksi.isNonMaterial,
      manual_source_id: manualArsip.id,
      lampiran_snapshot: arsip.lampiranSnapshot,
    })
    .from(arsip)
    .leftJoin(dokumenTransaksi, eq(dokumenTransaksi.id, arsip.dokumenId))
    .leftJoin(manualArsip, eq(manualArsip.canonicalArsipId, arsip.id)) as any

  if (filters.length > 0) {
    builder = builder.where(and(...filters))
  }

  return builder
    .orderBy(desc(arsip.archivedAt), desc(arsip.createdAt), desc(arsip.id)) as Promise<ClassificationDetailCanonicalRow[]>
}

async function selectManualAttachmentCounts(
  database: UnifiedArchiveClassificationDetailDatabase,
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

  return new Map(
    rows.map((row) => [
      row.manual_arsip_id,
      normalizeCount(row.attachment_count),
    ]),
  )
}

function mapClassificationDetailItem(
  row: ClassificationDetailCanonicalRow,
  manualAttachmentCounts: Map<string, number>,
): UnifiedArchiveClassificationDetailItem {
  const sourceType = normalizeSourceType(row.source_type)

  return {
    id: row.id,
    namaArsip: trimToNull(row.nama_arsip) ?? FALLBACK_CLASSIFICATION_LABEL,
    nomorSurat: trimToNull(row.nomor_surat),
    statusArsip: row.status_arsip,
    sourceType,
    tanggalArsip: toIsoLikeString(row.archived_at),
    nominalRealisasi: getWorkflowMaterialNominal(row, sourceType),
    jumlahLampiran: getSafeAttachmentCount(row, sourceType, manualAttachmentCounts),
  }
}

function getClassificationLabel(
  query: NormalizedClassificationDetailQuery,
  rows: ClassificationDetailCanonicalRow[],
): UnifiedArchiveClassificationDetailClassification {
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

function summarizeClassificationDetailItems(
  items: UnifiedArchiveClassificationDetailItem[],
): UnifiedArchiveClassificationDetailSummary {
  let totalWorkflow = 0
  let totalManual = 0
  let totalNominal = 0

  for (const item of items) {
    if (item.sourceType === 'WORKFLOW') totalWorkflow += 1
    if (item.sourceType === 'MANUAL') totalManual += 1
    if (item.nominalRealisasi) {
      const nominal = Number(item.nominalRealisasi)
      if (Number.isFinite(nominal) && nominal > 0) totalNominal += nominal
    }
  }

  return {
    totalArsip: items.length,
    totalWorkflow,
    totalManual,
    totalNominalRealisasi: totalNominal > 0 ? totalNominal.toFixed(2) : '0.00',
  }
}

function normalizeClassificationDetailQuery(
  query: UnifiedArchiveClassificationDetailQuery,
): NormalizedClassificationDetailQuery {
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

function isBlankSql(column: unknown): SQL {
  return sql`nullif(btrim(coalesce(${column}, '')), '') is null`
}

function getWorkflowMaterialNominal(
  row: ClassificationDetailCanonicalRow,
  sourceType: ArchiveSourceType,
): string | null {
  if (sourceType !== 'WORKFLOW') return null
  if (!trimToNull(row.dokumen_id)) return null
  if (row.dokumen_is_non_material === true) return null

  return normalizePositiveNominal(row.nominal_realisasi)
}

function getSafeAttachmentCount(
  row: ClassificationDetailCanonicalRow,
  sourceType: ArchiveSourceType,
  manualAttachmentCounts: Map<string, number>,
): number {
  if (sourceType === 'WORKFLOW') return countLampiranSnapshot(row.lampiran_snapshot)
  const manualSourceId = trimToNull(row.manual_source_id)

  return manualSourceId ? manualAttachmentCounts.get(manualSourceId) ?? 0 : 0
}

function countLampiranSnapshot(value: unknown): number {
  if (Array.isArray(value)) return value.length
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
    : 'WORKFLOW'
}

function normalizeCount(value: string | number | null | undefined): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0
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
