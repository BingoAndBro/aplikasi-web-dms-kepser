import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_SOURCE_TYPE_VALUES,
  ARCHIVE_STATUS_VALUES,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export const UNIFIED_ARCHIVE_QUERY_DEFAULT_LIMIT = 100
export const UNIFIED_ARCHIVE_QUERY_MAX_LIMIT = 500
export const UNIFIED_ARCHIVE_QUERY_MAX_OFFSET = 10_000

export type UnifiedArchiveListSourceType = ArchiveSourceType | 'UNKNOWN'

export type UnifiedArchiveSourceIntegrityWarning =
  | 'MISSING_MANUAL_SOURCE'
  | 'WORKFLOW_WITHOUT_DOKUMEN_ID'
  | 'MANUAL_WITH_DOKUMEN_ID'
  | 'UNKNOWN_SOURCE_TYPE'

export type UnifiedArchiveDeferredQueryOption = 'search'

export type UnifiedArchiveListRow = {
  id: string
  sourceType: UnifiedArchiveListSourceType
  statusArsip: StatusArsip
  namaArsip: string | null
  nomorSurat: string | null
  klasifikasiId: string | null
  klasifikasiKodeSnapshot: string | null
  klasifikasiNamaSnapshot: string | null
  tanggalArsip: string | null
  retensiAktif: string | null
  retensiInaktif: string | null
  masaAktifBerakhir: string | null
  masaInaktifBerakhir: string | null
  nominalRealisasi: string | number | null
  createdBy: string | null
  archivedBy: string | null
  createdAt: string | null
  updatedAt: string | null
  hasWorkflowDocument: boolean
  hasManualSource: boolean
  sourceReferenceId: string | null
  attachmentCount?: number
  warnings: UnifiedArchiveSourceIntegrityWarning[]
}

export type UnifiedArchiveQueryOptions = {
  statusArsip?: StatusArsip
  sourceType?: ArchiveSourceType
  klasifikasiId?: string
  limit?: number
  offset?: number
  search?: string
}

export type UnifiedArchiveQuerySummary = {
  totalRowsReturned: number
  sourceTypeCounts: Record<UnifiedArchiveListSourceType, number>
  statusCounts: Partial<Record<StatusArsip, number>>
  missingSourceCounts: Partial<Record<UnifiedArchiveSourceIntegrityWarning, number>>
  warningCounts: Partial<Record<UnifiedArchiveSourceIntegrityWarning, number>>
  attachmentCountTotal?: number
  deferredQueryOptions: UnifiedArchiveDeferredQueryOption[]
  appliedLimit: number
  appliedOffset: number
}

export type UnifiedArchiveQueryResult = {
  rows: UnifiedArchiveListRow[]
  summary: UnifiedArchiveQuerySummary
}

export type UnifiedArchiveQueryReaderDatabase = {
  select(projection: Record<string, unknown>): UnifiedArchiveQuerySelectFrom
}

type UnifiedArchiveQuerySelectFrom = {
  from(table: unknown): any
}

type CanonicalArchiveReaderRow = {
  id: string
  source_type: string | null
  dokumen_id: string | null
  manual_source_id: string | null
  status_arsip: StatusArsip
  nama_arsip: string | null
  nomor_surat: string | null
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  archived_at: Date | string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: Date | string | null
  masa_inaktif_berakhir: Date | string | null
  nominal_realisasi: string | number | null
  created_by: string | null
  archived_by: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
  lampiran_snapshot: unknown
}

type ManualAttachmentCountRow = {
  manual_arsip_id: string
  attachment_count: string | number | null
}

export function createUnifiedArchiveQueryReader(
  database: UnifiedArchiveQueryReaderDatabase,
): {
  getUnifiedArchiveList: (options?: UnifiedArchiveQueryOptions) => Promise<UnifiedArchiveQueryResult>
} {
  return {
    getUnifiedArchiveList(options = {}) {
      return getUnifiedArchiveListForDatabase(database, options)
    },
  }
}

export async function getUnifiedArchiveList(
  options: UnifiedArchiveQueryOptions = {},
): Promise<UnifiedArchiveQueryResult> {
  const { db } = await import('#/db/client')

  return getUnifiedArchiveListForDatabase(
    db as unknown as UnifiedArchiveQueryReaderDatabase,
    options,
  )
}

export async function getUnifiedArchiveListForDatabase(
  database: UnifiedArchiveQueryReaderDatabase,
  options: UnifiedArchiveQueryOptions = {},
): Promise<UnifiedArchiveQueryResult> {
  const normalizedOptions = normalizeQueryOptions(options)
  const canonicalRows = await selectCanonicalArchiveRows(database, normalizedOptions)
  const manualAttachmentCounts = await selectManualAttachmentCounts(
    database,
    canonicalRows
      .map((row) => row.manual_source_id)
      .filter((id): id is string => Boolean(id)),
  )
  const rows = canonicalRows.map((row) => mapCanonicalArchiveRowToDto(row, manualAttachmentCounts))

  return {
    rows,
    summary: summarizeUnifiedArchiveRows(rows, normalizedOptions),
  }
}

async function selectCanonicalArchiveRows(
  database: UnifiedArchiveQueryReaderDatabase,
  options: NormalizedUnifiedArchiveQueryOptions,
): Promise<CanonicalArchiveReaderRow[]> {
  const filters: SQL[] = []
  if (options.statusArsip) filters.push(eq(arsip.statusArsip, options.statusArsip))
  if (options.sourceType) filters.push(eq(arsip.sourceType, options.sourceType))
  if (options.klasifikasiId) filters.push(eq(arsip.klasifikasiId, options.klasifikasiId))

  let builder = database
    .select({
      id: arsip.id,
      source_type: arsip.sourceType,
      dokumen_id: arsip.dokumenId,
      manual_source_id: manualArsip.id,
      status_arsip: arsip.statusArsip,
      nama_arsip: arsip.namaArsip,
      nomor_surat: arsip.nomorSurat,
      klasifikasi_id: arsip.klasifikasiId,
      klasifikasi_kode_snapshot: arsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: arsip.klasifikasiNamaSnapshot,
      archived_at: arsip.archivedAt,
      retensi_aktif: arsip.retensiAktif,
      retensi_inaktif: arsip.retensiInaktif,
      masa_aktif_berakhir: arsip.masaAktifBerakhir,
      masa_inaktif_berakhir: arsip.masaInaktifBerakhir,
      nominal_realisasi: arsip.nominalRealisasi,
      created_by: arsip.createdBy,
      archived_by: arsip.archivedBy,
      created_at: arsip.createdAt,
      updated_at: arsip.updatedAt,
      lampiran_snapshot: arsip.lampiranSnapshot,
    })
    .from(arsip)
    .leftJoin(manualArsip, eq(manualArsip.canonicalArsipId, arsip.id)) as any

  if (filters.length > 0) {
    builder = builder.where(and(...filters))
  }

  return builder
    .orderBy(desc(arsip.archivedAt), desc(arsip.createdAt), desc(arsip.id))
    .limit(options.limit)
    .offset(options.offset) as Promise<CanonicalArchiveReaderRow[]>
}

async function selectManualAttachmentCounts(
  database: UnifiedArchiveQueryReaderDatabase,
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
      normalizeAttachmentCount(row.attachment_count),
    ]),
  )
}

function mapCanonicalArchiveRowToDto(
  row: CanonicalArchiveReaderRow,
  manualAttachmentCounts: Map<string, number>,
): UnifiedArchiveListRow {
  const sourceType = normalizeSourceType(row.source_type)
  const warnings = collectSourceIntegrityWarnings(row, sourceType)
  const manualSourceId = trimToNull(row.manual_source_id)
  const attachmentCount = getSafeAttachmentCount(row, sourceType, manualAttachmentCounts)

  return {
    id: row.id,
    sourceType,
    statusArsip: row.status_arsip,
    namaArsip: trimToNull(row.nama_arsip),
    nomorSurat: trimToNull(row.nomor_surat),
    klasifikasiId: trimToNull(row.klasifikasi_id),
    klasifikasiKodeSnapshot: trimToNull(row.klasifikasi_kode_snapshot),
    klasifikasiNamaSnapshot: trimToNull(row.klasifikasi_nama_snapshot),
    tanggalArsip: toIsoLikeString(row.archived_at),
    retensiAktif: trimToNull(row.retensi_aktif),
    retensiInaktif: trimToNull(row.retensi_inaktif),
    masaAktifBerakhir: toIsoLikeString(row.masa_aktif_berakhir),
    masaInaktifBerakhir: toIsoLikeString(row.masa_inaktif_berakhir),
    nominalRealisasi: normalizeNominal(row.nominal_realisasi),
    createdBy: trimToNull(row.created_by),
    archivedBy: trimToNull(row.archived_by),
    createdAt: toIsoLikeString(row.created_at),
    updatedAt: toIsoLikeString(row.updated_at),
    hasWorkflowDocument: sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW && Boolean(trimToNull(row.dokumen_id)),
    hasManualSource: sourceType === ARCHIVE_SOURCE_TYPE.MANUAL && Boolean(manualSourceId),
    sourceReferenceId: getSourceReferenceId(row, sourceType),
    ...(attachmentCount === undefined ? {} : { attachmentCount }),
    warnings,
  }
}

function collectSourceIntegrityWarnings(
  row: CanonicalArchiveReaderRow,
  sourceType: UnifiedArchiveListSourceType,
): UnifiedArchiveSourceIntegrityWarning[] {
  const warnings = new Set<UnifiedArchiveSourceIntegrityWarning>()

  if (sourceType === 'UNKNOWN') {
    warnings.add('UNKNOWN_SOURCE_TYPE')
  }
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL && !trimToNull(row.manual_source_id)) {
    warnings.add('MISSING_MANUAL_SOURCE')
  }
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW && !trimToNull(row.dokumen_id)) {
    warnings.add('WORKFLOW_WITHOUT_DOKUMEN_ID')
  }
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL && trimToNull(row.dokumen_id)) {
    warnings.add('MANUAL_WITH_DOKUMEN_ID')
  }

  return [...warnings].sort()
}

function getSourceReferenceId(
  row: CanonicalArchiveReaderRow,
  sourceType: UnifiedArchiveListSourceType,
): string | null {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) return trimToNull(row.dokumen_id)
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) return trimToNull(row.manual_source_id)

  return null
}

function getSafeAttachmentCount(
  row: CanonicalArchiveReaderRow,
  sourceType: UnifiedArchiveListSourceType,
  manualAttachmentCounts: Map<string, number>,
): number | undefined {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    return countLampiranSnapshot(row.lampiran_snapshot)
  }

  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) {
    const manualSourceId = trimToNull(row.manual_source_id)
    return manualSourceId ? manualAttachmentCounts.get(manualSourceId) ?? 0 : undefined
  }

  return undefined
}

function summarizeUnifiedArchiveRows(
  rows: UnifiedArchiveListRow[],
  options: NormalizedUnifiedArchiveQueryOptions,
): UnifiedArchiveQuerySummary {
  const summary: UnifiedArchiveQuerySummary = {
    totalRowsReturned: rows.length,
    sourceTypeCounts: {
      WORKFLOW: 0,
      MANUAL: 0,
      UNKNOWN: 0,
    },
    statusCounts: {},
    missingSourceCounts: {},
    warningCounts: {},
    deferredQueryOptions: options.search ? ['search'] : [],
    appliedLimit: options.limit,
    appliedOffset: options.offset,
  }

  let attachmentCountTotal = 0
  let allAttachmentCountsKnown = true

  for (const row of rows) {
    summary.sourceTypeCounts[row.sourceType] += 1
    summary.statusCounts[row.statusArsip] = (summary.statusCounts[row.statusArsip] ?? 0) + 1

    for (const warning of row.warnings) {
      summary.warningCounts[warning] = (summary.warningCounts[warning] ?? 0) + 1
      if (warning === 'MISSING_MANUAL_SOURCE' || warning === 'WORKFLOW_WITHOUT_DOKUMEN_ID') {
        summary.missingSourceCounts[warning] = (summary.missingSourceCounts[warning] ?? 0) + 1
      }
    }

    if (typeof row.attachmentCount === 'number') {
      attachmentCountTotal += row.attachmentCount
    } else {
      allAttachmentCountsKnown = false
    }
  }

  if (allAttachmentCountsKnown) {
    summary.attachmentCountTotal = attachmentCountTotal
  }

  return summary
}

type NormalizedUnifiedArchiveQueryOptions = {
  statusArsip: StatusArsip | null
  sourceType: ArchiveSourceType | null
  klasifikasiId: string | null
  limit: number
  offset: number
  search: string | null
}

function normalizeQueryOptions(options: UnifiedArchiveQueryOptions): NormalizedUnifiedArchiveQueryOptions {
  return {
    statusArsip: normalizeStatusFilter(options.statusArsip),
    sourceType: normalizeSourceTypeFilter(options.sourceType),
    klasifikasiId: trimToNull(options.klasifikasiId),
    limit: normalizeLimit(options.limit),
    offset: normalizeOffset(options.offset),
    search: normalizeSearch(options.search),
  }
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return UNIFIED_ARCHIVE_QUERY_DEFAULT_LIMIT
  }

  const normalized = Math.trunc(value)
  if (normalized < 1) return UNIFIED_ARCHIVE_QUERY_DEFAULT_LIMIT

  return Math.min(normalized, UNIFIED_ARCHIVE_QUERY_MAX_LIMIT)
}

function normalizeOffset(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0

  return Math.min(Math.max(Math.trunc(value), 0), UNIFIED_ARCHIVE_QUERY_MAX_OFFSET)
}

function normalizeSearch(value: string | null | undefined): string | null {
  const normalized = trimToNull(value)
  if (!normalized) return null

  return normalized.slice(0, 100)
}

function normalizeStatusFilter(value: StatusArsip | null | undefined): StatusArsip | null {
  return ARCHIVE_STATUS_VALUES.includes(value as StatusArsip)
    ? value as StatusArsip
    : null
}

function normalizeSourceTypeFilter(value: ArchiveSourceType | null | undefined): ArchiveSourceType | null {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
    ? value as ArchiveSourceType
    : null
}

function normalizeSourceType(value: string | null | undefined): UnifiedArchiveListSourceType {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
    ? value as ArchiveSourceType
    : 'UNKNOWN'
}

function normalizeAttachmentCount(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
  }

  return 0
}

function countLampiranSnapshot(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length
  if (typeof value !== 'string') return undefined

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.length : undefined
  } catch {
    return undefined
  }
}

function normalizeNominal(value: string | number | null | undefined): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return trimToNull(value)
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
