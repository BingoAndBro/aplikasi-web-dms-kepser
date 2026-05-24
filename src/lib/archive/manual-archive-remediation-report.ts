import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_STATUS,
  ARCHIVE_STATUS_VALUES,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export const MANUAL_ARCHIVE_REMEDIATION_BUCKET = {
  READY_FOR_CANONICALIZATION: 'READY_FOR_CANONICALIZATION',
  NEEDS_HUMAN_METADATA: 'NEEDS_HUMAN_METADATA',
  LINKED_OK: 'LINKED_OK',
  LINKED_BROKEN: 'LINKED_BROKEN',
  LINKED_WRONG_SOURCE_TYPE: 'LINKED_WRONG_SOURCE_TYPE',
  NON_AKTIF_DEFERRED: 'NON_AKTIF_DEFERRED',
  NOMINAL_INVALID: 'NOMINAL_INVALID',
  ATTACHMENT_REVIEW_REQUIRED: 'ATTACHMENT_REVIEW_REQUIRED',
} as const

export type ManualArchiveRemediationBucket =
  typeof MANUAL_ARCHIVE_REMEDIATION_BUCKET[keyof typeof MANUAL_ARCHIVE_REMEDIATION_BUCKET]

export const MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD = {
  nama: 'nama',
  nomorSurat: 'nomorSurat',
  tanggalDiarsipkan: 'tanggalDiarsipkan',
  klasifikasiId: 'klasifikasiId',
  klasifikasiKodeSnapshot: 'klasifikasiKodeSnapshot',
  klasifikasiNamaSnapshot: 'klasifikasiNamaSnapshot',
  retensiAktif: 'retensiAktif',
  retensiInaktif: 'retensiInaktif',
  masaAktifBerakhir: 'masaAktifBerakhir',
  masaInaktifBerakhir: 'masaInaktifBerakhir',
  archivedBy: 'archivedBy',
  createdBy: 'createdBy',
  nominalRealisasi: 'nominalRealisasi',
  statusArsip: 'statusArsip',
} as const

export type ManualArchiveRemediationMissingField =
  typeof MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD[keyof typeof MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD]

export const MANUAL_ARCHIVE_REMEDIATION_WARNING = {
  ATTACHMENT_REVIEW_REQUIRED: 'ATTACHMENT_REVIEW_REQUIRED',
} as const

export type ManualArchiveRemediationWarning =
  typeof MANUAL_ARCHIVE_REMEDIATION_WARNING[keyof typeof MANUAL_ARCHIVE_REMEDIATION_WARNING]

export type ManualArchiveRemediationRowInput = {
  manualArsipId: string
  canonicalArsipId?: string | null
  linkedCanonicalArsipId?: string | null
  linkedCanonicalSourceType?: ArchiveSourceType | string | null
  nama: string | null | undefined
  nomorSurat: string | null | undefined
  tanggalDiarsipkan: Date | string | null | undefined
  klasifikasiId: string | null | undefined
  klasifikasiKodeSnapshot: string | null | undefined
  klasifikasiNamaSnapshot: string | null | undefined
  retensiAktif: string | null | undefined
  retensiInaktif: string | null | undefined
  masaAktifBerakhir: Date | string | null | undefined
  masaInaktifBerakhir: Date | string | null | undefined
  archivedBy: string | null | undefined
  createdBy: string | null | undefined
  nominalRealisasi: string | number | null | undefined
  statusArsip: StatusArsip | string | null | undefined
  attachmentCount?: number | string | null
  createdAt?: Date | string | null
}

export type ManualArchiveRemediationReportRow = {
  manualArsipId: string
  canonicalArsipId: string | null
  statusArsip: StatusArsip | string | null
  buckets: ManualArchiveRemediationBucket[]
  missingFields: ManualArchiveRemediationMissingField[]
  warnings: ManualArchiveRemediationWarning[]
  attachmentCount?: number
  createdAt?: string | null
  tanggalDiarsipkan?: string | null
  namaArsip?: string | null
}

export type ManualArchiveRemediationSummary = {
  totalRows: number
  bucketCounts: Partial<Record<ManualArchiveRemediationBucket, number>>
  missingFieldCounts: Partial<Record<ManualArchiveRemediationMissingField, number>>
  warningCounts: Partial<Record<ManualArchiveRemediationWarning, number>>
}

export type ManualArchiveRemediationReportOptions = {
  statusArsip?: StatusArsip
  limit?: number
}

export type ManualArchiveRemediationReport = {
  rows: ManualArchiveRemediationReportRow[]
  summary: ManualArchiveRemediationSummary
}

export type ManualArchiveRemediationReportReaderDatabase = {
  select(projection: Record<string, unknown>): ManualArchiveRemediationSelectFrom
}

type ManualArchiveRemediationSelectFrom = {
  from(table: unknown): any
}

type ManualArchiveRemediationReaderRow = {
  id: string
  canonical_arsip_id: string | null
  linked_canonical_arsip_id: string | null
  linked_canonical_source_type: ArchiveSourceType | string | null
  nama: string | null
  nomor_surat: string | null
  tanggal_diarsipkan: Date | string | null
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: Date | string | null
  masa_inaktif_berakhir: Date | string | null
  archived_by: string | null
  created_by: string | null
  nominal_realisasi: string | number | null
  status_arsip: StatusArsip | string | null
  created_at: Date | string | null
}

type ManualArchiveAttachmentCountRow = {
  manual_arsip_id: string
  attachment_count: string | number | null
}

const NON_AKTIF_DEFERRED_STATUSES = new Set<StatusArsip>([
  ARCHIVE_STATUS.INAKTIF,
  ARCHIVE_STATUS.USUL_MUSNAH,
  ARCHIVE_STATUS.DIMUSNAHKAN,
])

export const MANUAL_ARCHIVE_REMEDIATION_REPORT_DEFAULT_LIMIT = 100
export const MANUAL_ARCHIVE_REMEDIATION_REPORT_MAX_LIMIT = 500

export function classifyManualArchiveRemediationRow(
  input: ManualArchiveRemediationRowInput,
): ManualArchiveRemediationReportRow {
  const buckets = new Set<ManualArchiveRemediationBucket>()
  const missingFields = new Set<ManualArchiveRemediationMissingField>()
  const warnings = new Set<ManualArchiveRemediationWarning>()
  const canonicalArsipId = trimToNull(input.canonicalArsipId)
  const attachmentCount = normalizeAttachmentCount(input.attachmentCount)
  const statusArsip = normalizeStatus(input.statusArsip)

  if (canonicalArsipId) {
    const linkedCanonicalArsipId = trimToNull(input.linkedCanonicalArsipId)
    if (!linkedCanonicalArsipId) {
      buckets.add(MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_BROKEN)
    } else if (input.linkedCanonicalSourceType !== ARCHIVE_SOURCE_TYPE.MANUAL) {
      buckets.add(MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_WRONG_SOURCE_TYPE)
    } else {
      buckets.add(MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_OK)
    }
  }

  if (statusArsip && NON_AKTIF_DEFERRED_STATUSES.has(statusArsip)) {
    buckets.add(MANUAL_ARCHIVE_REMEDIATION_BUCKET.NON_AKTIF_DEFERRED)
  }

  collectMissingMetadata(input, missingFields)
  if (!statusArsip) {
    missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.statusArsip)
  }

  if (!isValidPositiveDbNumeric(input.nominalRealisasi)) {
    buckets.add(MANUAL_ARCHIVE_REMEDIATION_BUCKET.NOMINAL_INVALID)
    missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.nominalRealisasi)
  }

  if (missingFields.size > 0) {
    buckets.add(MANUAL_ARCHIVE_REMEDIATION_BUCKET.NEEDS_HUMAN_METADATA)
  }

  if (attachmentCount > 0) {
    buckets.add(MANUAL_ARCHIVE_REMEDIATION_BUCKET.ATTACHMENT_REVIEW_REQUIRED)
    warnings.add(MANUAL_ARCHIVE_REMEDIATION_WARNING.ATTACHMENT_REVIEW_REQUIRED)
  }

  const hasBlockingBucket = [...buckets].some((bucket) => (
    bucket !== MANUAL_ARCHIVE_REMEDIATION_BUCKET.ATTACHMENT_REVIEW_REQUIRED
  ))
  if (
    !canonicalArsipId
    && statusArsip === ARCHIVE_STATUS.AKTIF
    && missingFields.size === 0
    && !buckets.has(MANUAL_ARCHIVE_REMEDIATION_BUCKET.NOMINAL_INVALID)
    && !hasBlockingBucket
  ) {
    buckets.add(MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION)
  }

  return {
    manualArsipId: input.manualArsipId,
    canonicalArsipId,
    statusArsip: input.statusArsip ?? null,
    buckets: sortBuckets(buckets),
    missingFields: sortMissingFields(missingFields),
    warnings: sortWarnings(warnings),
    attachmentCount,
    createdAt: toIsoLikeString(input.createdAt),
    tanggalDiarsipkan: toIsoLikeString(input.tanggalDiarsipkan),
    namaArsip: trimToNull(input.nama),
  }
}

export function summarizeManualArchiveRemediationRows(
  rows: ManualArchiveRemediationReportRow[],
): ManualArchiveRemediationSummary {
  const summary: ManualArchiveRemediationSummary = {
    totalRows: rows.length,
    bucketCounts: {},
    missingFieldCounts: {},
    warningCounts: {},
  }

  for (const row of rows) {
    for (const bucket of row.buckets) {
      summary.bucketCounts[bucket] = (summary.bucketCounts[bucket] ?? 0) + 1
    }
    for (const field of row.missingFields) {
      summary.missingFieldCounts[field] = (summary.missingFieldCounts[field] ?? 0) + 1
    }
    for (const warning of row.warnings) {
      summary.warningCounts[warning] = (summary.warningCounts[warning] ?? 0) + 1
    }
  }

  return summary
}

export function createManualArchiveRemediationReportReader(
  database: ManualArchiveRemediationReportReaderDatabase,
): {
  getManualArchiveRemediationReport: (
    options?: ManualArchiveRemediationReportOptions
  ) => Promise<ManualArchiveRemediationReport>
} {
  return {
    getManualArchiveRemediationReport(options = {}) {
      return getManualArchiveRemediationReportForDatabase(database, options)
    },
  }
}

export async function getManualArchiveRemediationReport(
  options: ManualArchiveRemediationReportOptions = {},
): Promise<ManualArchiveRemediationReport> {
  const { db } = await import('#/db/client')

  return getManualArchiveRemediationReportForDatabase(
    db as unknown as ManualArchiveRemediationReportReaderDatabase,
    options,
  )
}

export async function getManualArchiveRemediationReportForDatabase(
  database: ManualArchiveRemediationReportReaderDatabase,
  options: ManualArchiveRemediationReportOptions = {},
): Promise<ManualArchiveRemediationReport> {
  const limit = normalizeReaderLimit(options.limit)
  const statusFilter = normalizeStatusFilter(options.statusArsip)
  const manualRows = await selectManualArchiveRemediationRows(database, {
    limit,
    statusFilter,
  })
  const attachmentCounts = await selectManualAttachmentCounts(
    database,
    manualRows.map((row) => row.id),
  )
  const rows = manualRows.map((row) => classifyManualArchiveRemediationRow({
    manualArsipId: row.id,
    canonicalArsipId: row.canonical_arsip_id,
    linkedCanonicalArsipId: row.linked_canonical_arsip_id,
    linkedCanonicalSourceType: row.linked_canonical_source_type,
    nama: row.nama,
    nomorSurat: row.nomor_surat,
    tanggalDiarsipkan: row.tanggal_diarsipkan,
    klasifikasiId: row.klasifikasi_id,
    klasifikasiKodeSnapshot: row.klasifikasi_kode_snapshot,
    klasifikasiNamaSnapshot: row.klasifikasi_nama_snapshot,
    retensiAktif: row.retensi_aktif,
    retensiInaktif: row.retensi_inaktif,
    masaAktifBerakhir: row.masa_aktif_berakhir,
    masaInaktifBerakhir: row.masa_inaktif_berakhir,
    archivedBy: row.archived_by,
    createdBy: row.created_by,
    nominalRealisasi: row.nominal_realisasi,
    statusArsip: row.status_arsip,
    attachmentCount: attachmentCounts.get(row.id) ?? 0,
    createdAt: row.created_at,
  }))

  return {
    rows,
    summary: summarizeManualArchiveRemediationRows(rows),
  }
}

async function selectManualArchiveRemediationRows(
  database: ManualArchiveRemediationReportReaderDatabase,
  input: {
    limit: number
    statusFilter: StatusArsip | null
  },
): Promise<ManualArchiveRemediationReaderRow[]> {
  const filters: SQL[] = []
  if (input.statusFilter) filters.push(eq(manualArsip.statusArsip, input.statusFilter))

  let builder = database
    .select({
      id: manualArsip.id,
      canonical_arsip_id: manualArsip.canonicalArsipId,
      linked_canonical_arsip_id: arsip.id,
      linked_canonical_source_type: arsip.sourceType,
      nama: manualArsip.nama,
      nomor_surat: manualArsip.nomorSurat,
      tanggal_diarsipkan: manualArsip.tanggalDiarsipkan,
      klasifikasi_id: manualArsip.klasifikasiId,
      klasifikasi_kode_snapshot: manualArsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: manualArsip.klasifikasiNamaSnapshot,
      retensi_aktif: manualArsip.retensiAktif,
      retensi_inaktif: manualArsip.retensiInaktif,
      masa_aktif_berakhir: manualArsip.masaAktifBerakhir,
      masa_inaktif_berakhir: manualArsip.masaInaktifBerakhir,
      archived_by: manualArsip.archivedBy,
      created_by: manualArsip.createdBy,
      nominal_realisasi: manualArsip.nominalRealisasi,
      status_arsip: manualArsip.statusArsip,
      created_at: manualArsip.createdAt,
    })
    .from(manualArsip)
    .leftJoin(arsip, eq(manualArsip.canonicalArsipId, arsip.id)) as any

  if (filters.length > 0) {
    builder = builder.where(and(...filters))
  }

  return builder
    .orderBy(desc(manualArsip.createdAt))
    .limit(input.limit) as Promise<ManualArchiveRemediationReaderRow[]>
}

async function selectManualAttachmentCounts(
  database: ManualArchiveRemediationReportReaderDatabase,
  manualArsipIds: string[],
): Promise<Map<string, number>> {
  if (manualArsipIds.length === 0) return new Map()

  const rows = await database
    .select({
      manual_arsip_id: manualArsipAttachment.manualArsipId,
      attachment_count: sql<number>`count(${manualArsipAttachment.id})`,
    })
    .from(manualArsipAttachment)
    .where(inArray(manualArsipAttachment.manualArsipId, manualArsipIds))
    .groupBy(manualArsipAttachment.manualArsipId) as ManualArchiveAttachmentCountRow[]

  return new Map(
    rows.map((row) => [
      row.manual_arsip_id,
      normalizeAttachmentCount(row.attachment_count),
    ]),
  )
}

function collectMissingMetadata(
  input: ManualArchiveRemediationRowInput,
  missingFields: Set<ManualArchiveRemediationMissingField>,
): void {
  if (!trimToNull(input.nama)) missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.nama)
  if (!trimToNull(input.nomorSurat)) missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.nomorSurat)
  if (!isValidDateOnlyLike(input.tanggalDiarsipkan)) {
    missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.tanggalDiarsipkan)
  }
  if (!trimToNull(input.klasifikasiId)) missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.klasifikasiId)
  if (!trimToNull(input.klasifikasiKodeSnapshot)) {
    missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.klasifikasiKodeSnapshot)
  }
  if (!trimToNull(input.klasifikasiNamaSnapshot)) {
    missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.klasifikasiNamaSnapshot)
  }
  if (!trimToNull(input.retensiAktif)) missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.retensiAktif)
  if (!trimToNull(input.retensiInaktif)) missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.retensiInaktif)
  if (!isValidDateOnlyLike(input.masaAktifBerakhir)) {
    missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.masaAktifBerakhir)
  }
  if (!isValidDateOnlyLike(input.masaInaktifBerakhir)) {
    missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.masaInaktifBerakhir)
  }
  if (!trimToNull(input.archivedBy)) missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.archivedBy)
  if (!trimToNull(input.createdBy)) missingFields.add(MANUAL_ARCHIVE_REMEDIATION_MISSING_FIELD.createdBy)
}

function isValidPositiveDbNumeric(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  const normalized = typeof value === 'number'
    ? value.toString()
    : trimToNull(value)
  if (!normalized) return false

  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0
}

function normalizeReaderLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MANUAL_ARCHIVE_REMEDIATION_REPORT_DEFAULT_LIMIT
  }

  const normalized = Math.trunc(value)
  if (normalized < 1) return MANUAL_ARCHIVE_REMEDIATION_REPORT_DEFAULT_LIMIT

  return Math.min(normalized, MANUAL_ARCHIVE_REMEDIATION_REPORT_MAX_LIMIT)
}

function normalizeStatusFilter(value: StatusArsip | null | undefined): StatusArsip | null {
  return ARCHIVE_STATUS_VALUES.includes(value as StatusArsip)
    ? value as StatusArsip
    : null
}

function normalizeStatus(value: StatusArsip | string | null | undefined): StatusArsip | null {
  return ARCHIVE_STATUS_VALUES.includes(value as StatusArsip)
    ? value as StatusArsip
    : null
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

function isValidDateOnlyLike(value: Date | string | null | undefined): boolean {
  const normalized = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : trimToNull(value)
  if (!normalized) return false

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
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

function sortBuckets(
  values: Set<ManualArchiveRemediationBucket>,
): ManualArchiveRemediationBucket[] {
  return [...values].sort()
}

function sortMissingFields(
  values: Set<ManualArchiveRemediationMissingField>,
): ManualArchiveRemediationMissingField[] {
  return [...values].sort()
}

function sortWarnings(
  values: Set<ManualArchiveRemediationWarning>,
): ManualArchiveRemediationWarning[] {
  return [...values].sort()
}
