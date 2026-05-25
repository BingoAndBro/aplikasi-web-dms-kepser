import { inArray, sql } from 'drizzle-orm'

import { users } from '#/db/schema/auth'
import { arsip } from '#/db/schema/arsip'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_SOURCE_TYPE_VALUES,
  ARCHIVE_STATUS,
  ARCHIVE_STATUS_VALUES,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'
import {
  getUnifiedArchiveListForDatabase,
  UNIFIED_ARCHIVE_QUERY_MAX_LIMIT,
  type UnifiedArchiveListRow,
  type UnifiedArchiveQueryReaderDatabase,
} from '#/lib/archive/unified-archive-query'

export const UNIFIED_ARCHIVE_EXPORT_MAX_ROWS = UNIFIED_ARCHIVE_QUERY_MAX_LIMIT
export const UNIFIED_ARCHIVE_EXPORT_FILENAME = 'arsip-unified-export.csv'

export type UnifiedArchiveAggregateStatusSourceCounts = Record<StatusArsip, Record<ArchiveSourceType, number>>

export type UnifiedArchiveAggregateSummary = {
  totalArchives: number
  countByStatus: Record<StatusArsip, number>
  countBySourceType: Record<ArchiveSourceType, number>
  countByStatusAndSourceType: UnifiedArchiveAggregateStatusSourceCounts
  unknownSourceTypeCount: number
}

export type UnifiedArchiveExportFilters = {
  statusArsip?: StatusArsip
  sourceType?: ArchiveSourceType
}

export type UnifiedArchiveCsvExportResult = {
  csv: string
  rowCount: number
  maxRows: number
  truncated: boolean
  filters: UnifiedArchiveExportFilters
}

export type UnifiedArchiveAggregateExportDatabase =
  UnifiedArchiveQueryReaderDatabase & {
    select(projection: Record<string, unknown>): any
  }

type AggregateCountRow = {
  status_arsip: string | null
  source_type: string | null
  count: string | number | null
}

type ActorDisplayRow = {
  id: string
  display_name: string | null
  nama_lengkap: string | null
  email: string | null
}

const CSV_HEADERS = [
  'ID Arsip',
  'Nama Arsip',
  'Nomor Surat',
  'Status Arsip',
  'Sumber Arsip',
  'Klasifikasi',
  'Tanggal Arsip',
  'Retensi Aktif',
  'Retensi Inaktif',
  'Dibuat oleh',
  'Diarsipkan oleh',
  'Nominal Realisasi',
  'Jumlah Lampiran',
  'Tanggal dibuat',
  'Terakhir diperbarui',
] as const

export async function getUnifiedArchiveAggregate(): Promise<UnifiedArchiveAggregateSummary> {
  const { db } = await import('#/db/client')

  return getUnifiedArchiveAggregateForDatabase(
    db as unknown as UnifiedArchiveAggregateExportDatabase,
  )
}

export async function getUnifiedArchiveAggregateForDatabase(
  database: UnifiedArchiveAggregateExportDatabase,
): Promise<UnifiedArchiveAggregateSummary> {
  const rows = await database
    .select({
      status_arsip: arsip.statusArsip,
      source_type: arsip.sourceType,
      count: sql<number>`count(${arsip.id})`,
    })
    .from(arsip)
    .groupBy(arsip.statusArsip, arsip.sourceType) as AggregateCountRow[]

  return mapAggregateRows(rows)
}

export async function createUnifiedArchiveCsvExport(
  filters: UnifiedArchiveExportFilters = {},
): Promise<UnifiedArchiveCsvExportResult> {
  const { db } = await import('#/db/client')

  return createUnifiedArchiveCsvExportForDatabase(
    db as unknown as UnifiedArchiveAggregateExportDatabase,
    filters,
  )
}

export async function createUnifiedArchiveCsvExportForDatabase(
  database: UnifiedArchiveAggregateExportDatabase,
  filters: UnifiedArchiveExportFilters = {},
): Promise<UnifiedArchiveCsvExportResult> {
  const normalizedFilters = normalizeExportFilters(filters)
  const queryResult = await getUnifiedArchiveListForDatabase(database, {
    statusArsip: normalizedFilters.statusArsip,
    sourceType: normalizedFilters.sourceType,
    limit: UNIFIED_ARCHIVE_EXPORT_MAX_ROWS,
    offset: 0,
  })
  const actorNames = await selectActorDisplayNames(database, queryResult.rows)
  const rows = queryResult.rows.map((row) => mapExportRow(row, actorNames))
  const csv = buildCsv([CSV_HEADERS, ...rows])

  return {
    csv,
    rowCount: rows.length,
    maxRows: UNIFIED_ARCHIVE_EXPORT_MAX_ROWS,
    truncated: rows.length >= UNIFIED_ARCHIVE_EXPORT_MAX_ROWS,
    filters: normalizedFilters,
  }
}

export function buildUnifiedArchiveCsvResponse(result: UnifiedArchiveCsvExportResult): Response {
  return new Response(result.csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${UNIFIED_ARCHIVE_EXPORT_FILENAME}"`,
      'Cache-Control': 'no-store',
      'X-Archive-Export-Row-Count': String(result.rowCount),
      'X-Archive-Export-Max-Rows': String(result.maxRows),
      'X-Archive-Export-Truncated': result.truncated ? 'true' : 'false',
    },
  })
}

export function parseUnifiedArchiveStatusFilter(value: string | null | undefined): StatusArsip | undefined {
  if (!value || value === 'ALL') return undefined
  return ARCHIVE_STATUS_VALUES.includes(value as StatusArsip) ? value as StatusArsip : undefined
}

export function parseUnifiedArchiveSourceFilter(value: string | null | undefined): ArchiveSourceType | undefined {
  if (!value || value === 'ALL') return undefined
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType) ? value as ArchiveSourceType : undefined
}

export function isValidUnifiedArchiveStatusFilter(value: string | null | undefined): boolean {
  return !value || value === 'ALL' || ARCHIVE_STATUS_VALUES.includes(value as StatusArsip)
}

export function isValidUnifiedArchiveSourceFilter(value: string | null | undefined): boolean {
  return !value || value === 'ALL' || ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
}

function mapAggregateRows(rows: AggregateCountRow[]): UnifiedArchiveAggregateSummary {
  const summary: UnifiedArchiveAggregateSummary = {
    totalArchives: 0,
    countByStatus: zeroStatusCounts(),
    countBySourceType: zeroSourceCounts(),
    countByStatusAndSourceType: zeroStatusSourceCounts(),
    unknownSourceTypeCount: 0,
  }

  for (const row of rows) {
    const count = normalizeCount(row.count)
    const status = ARCHIVE_STATUS_VALUES.includes(row.status_arsip as StatusArsip)
      ? row.status_arsip as StatusArsip
      : null
    const sourceType = ARCHIVE_SOURCE_TYPE_VALUES.includes(row.source_type as ArchiveSourceType)
      ? row.source_type as ArchiveSourceType
      : null

    summary.totalArchives += count
    if (status) summary.countByStatus[status] += count
    if (sourceType) summary.countBySourceType[sourceType] += count
    else summary.unknownSourceTypeCount += count
    if (status && sourceType) summary.countByStatusAndSourceType[status][sourceType] += count
  }

  return summary
}

async function selectActorDisplayNames(
  database: UnifiedArchiveAggregateExportDatabase,
  rows: UnifiedArchiveListRow[],
): Promise<Map<string, string>> {
  const actorIds = [
    ...new Set(rows.flatMap((row) => [row.createdBy, row.archivedBy]).filter((id): id is string => Boolean(id))),
  ]

  if (actorIds.length === 0) return new Map()

  const actorRows = await database
    .select({
      id: users.id,
      display_name: users.displayName,
      nama_lengkap: users.namaLengkap,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, actorIds))
    .limit(actorIds.length) as ActorDisplayRow[]

  return new Map(
    actorRows
      .map((row) => [row.id, resolveActorDisplayName(row)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  )
}

function mapExportRow(row: UnifiedArchiveListRow, actorNames: Map<string, string>): string[] {
  return [
    row.id,
    safeExportText(row.namaArsip),
    safeExportText(row.nomorSurat),
    formatStatus(row.statusArsip),
    formatSourceType(row.sourceType),
    safeExportText(formatKlasifikasi(row)),
    safeExportText(row.tanggalArsip),
    safeExportText(row.retensiAktif),
    safeExportText(row.retensiInaktif),
    formatActor(row.createdBy, actorNames),
    formatActor(row.archivedBy, actorNames),
    formatNominal(row.nominalRealisasi),
    typeof row.attachmentCount === 'number' ? String(row.attachmentCount) : 'Tidak tersedia',
    safeExportText(row.createdAt),
    safeExportText(row.updatedAt),
  ]
}

function buildCsv(rows: readonly (readonly string[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n')}\r\n`
}

function escapeCsvValue(value: string): string {
  const neutralized = neutralizeSpreadsheetFormula(value)
  return /[",\r\n]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized
}

function neutralizeSpreadsheetFormula(value: string): string {
  const withoutBom = value.replace(/^\uFEFF/, '')
  return /^[=+\-@]/.test(withoutBom.trimStart()) ? `'${value}` : value
}

function normalizeExportFilters(filters: UnifiedArchiveExportFilters): UnifiedArchiveExportFilters {
  return {
    ...(filters.statusArsip && ARCHIVE_STATUS_VALUES.includes(filters.statusArsip)
      ? { statusArsip: filters.statusArsip }
      : {}),
    ...(filters.sourceType && ARCHIVE_SOURCE_TYPE_VALUES.includes(filters.sourceType)
      ? { sourceType: filters.sourceType }
      : {}),
  }
}

function zeroStatusCounts(): Record<StatusArsip, number> {
  return {
    [ARCHIVE_STATUS.AKTIF]: 0,
    [ARCHIVE_STATUS.INAKTIF]: 0,
    [ARCHIVE_STATUS.USUL_MUSNAH]: 0,
    [ARCHIVE_STATUS.DIMUSNAHKAN]: 0,
  }
}

function zeroSourceCounts(): Record<ArchiveSourceType, number> {
  return {
    [ARCHIVE_SOURCE_TYPE.WORKFLOW]: 0,
    [ARCHIVE_SOURCE_TYPE.MANUAL]: 0,
  }
}

function zeroStatusSourceCounts(): UnifiedArchiveAggregateStatusSourceCounts {
  return {
    [ARCHIVE_STATUS.AKTIF]: zeroSourceCounts(),
    [ARCHIVE_STATUS.INAKTIF]: zeroSourceCounts(),
    [ARCHIVE_STATUS.USUL_MUSNAH]: zeroSourceCounts(),
    [ARCHIVE_STATUS.DIMUSNAHKAN]: zeroSourceCounts(),
  }
}

function normalizeCount(value: string | number | null | undefined): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0
}

function resolveActorDisplayName(row: ActorDisplayRow): string | null {
  return trimToNull(row.display_name)
    ?? trimToNull(row.nama_lengkap)
    ?? trimToNull(row.email)
}

function formatActor(actorId: string | null, actorNames: Map<string, string>): string {
  if (!actorId) return 'Tidak tersedia'
  return safeExportText(actorNames.get(actorId), 'Pengguna tidak ditemukan')
}

function formatStatus(status: StatusArsip): string {
  if (status === ARCHIVE_STATUS.AKTIF) return 'Aktif'
  if (status === ARCHIVE_STATUS.INAKTIF) return 'Inaktif'
  if (status === ARCHIVE_STATUS.USUL_MUSNAH) return 'Usul Musnah'
  return 'Dimusnahkan'
}

function formatSourceType(sourceType: UnifiedArchiveListRow['sourceType']): string {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) return 'Dokumen Persetujuan'
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) return 'Arsip Manual'
  return 'Sumber Tidak Dikenal'
}

function formatKlasifikasi(row: UnifiedArchiveListRow): string {
  const kode = row.klasifikasiKodeSnapshot
  const nama = row.klasifikasiNamaSnapshot
  if (kode && nama) return `${kode} - ${nama}`
  return kode ?? nama ?? 'Tidak tersedia'
}

function formatNominal(value: string | number | null): string {
  if (value === null || value === '') return 'Tidak tersedia'
  return safeExportText(String(value))
}

function safeExportText(value: string | null | undefined, fallback = 'Tidak tersedia'): string {
  const trimmed = trimToNull(value)
  if (!trimmed) return fallback

  return hasDisallowedExportText(trimmed) ? fallback : trimmed
}

function hasDisallowedExportText(value: string): boolean {
  const lower = value.toLowerCase()

  return /^[a-z][a-z0-9+.-]*:/i.test(value)
    || /^[a-z]:/i.test(value)
    || lower.includes('://')
    || value.includes('\\')
    || lower.includes('/storage/')
    || lower.includes('logical_path')
    || lower.includes('signed_url')
    || lower.includes('signedurl')
    || lower.includes('token')
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}
