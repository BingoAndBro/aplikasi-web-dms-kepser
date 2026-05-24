import { eq, sql } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  ARCHIVE_STATUS,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'
import {
  createManualArchiveCanonicalWritePlan,
  type ManualArchiveCanonicalSource,
} from '#/lib/archive/manual-archive-canonical'
import {
  classifyManualArchiveRemediationRow,
  MANUAL_ARCHIVE_REMEDIATION_BUCKET,
  type ManualArchiveRemediationBucket,
  type ManualArchiveRemediationMissingField,
  type ManualArchiveRemediationReportRow,
  type ManualArchiveRemediationWarning,
} from '#/lib/archive/manual-archive-remediation-report'

export type ManualArchiveCanonicalizationDryRunInput = {
  database: ManualArchiveCanonicalizationDryRunDatabase
  manualArsipId: string
  approvedByUserId: string
  approvalNote?: string
}

export type ManualArchiveCanonicalizationDryRunPreview = {
  sourceType: 'MANUAL'
  dokumenId: null
  namaArsip: string
  nomorSurat: string
  klasifikasiId: string
  klasifikasiKodeSnapshot: string
  klasifikasiNamaSnapshot: string
  retensiAktif: string
  retensiInaktif: string
  masaAktifBerakhir: string
  masaInaktifBerakhir: string
  archivedAt: string
  archivedBy: string
  createdBy: string
  nominalRealisasi: string
  statusArsip: 'AKTIF'
  metadata: Record<string, never>
}

export type ManualArchiveCanonicalizationDryRunResult =
  | {
      status: 'would_canonicalize'
      manualArsipId: string
      buckets: ManualArchiveRemediationBucket[]
      missingFields: ManualArchiveRemediationMissingField[]
      warnings: ManualArchiveRemediationWarning[]
      preview: ManualArchiveCanonicalizationDryRunPreview
    }
  | {
      status: 'already_linked'
      manualArsipId: string
      canonicalArsipId: string
      buckets: ManualArchiveRemediationBucket[]
      missingFields: ManualArchiveRemediationMissingField[]
      warnings: ManualArchiveRemediationWarning[]
    }
  | {
      status: 'not_ready'
      manualArsipId: string
      buckets: ManualArchiveRemediationBucket[]
      missingFields: ManualArchiveRemediationMissingField[]
      warnings: ManualArchiveRemediationWarning[]
    }

export type ManualArchiveCanonicalizationDryRunErrorCode =
  | 'MANUAL_ARCHIVE_CANONICALIZATION_DRY_RUN_APPROVAL_REQUIRED'

export class ManualArchiveCanonicalizationDryRunError extends Error {
  constructor(public readonly code: ManualArchiveCanonicalizationDryRunErrorCode) {
    super(code)
    this.name = 'ManualArchiveCanonicalizationDryRunError'
  }
}

export type ManualArchiveCanonicalizationDryRunDatabase = {
  select(projection: Record<string, unknown>): {
    from(table: unknown): ManualArchiveCanonicalizationDryRunSelectQuery
  }
}

type ManualArchiveCanonicalizationDryRunSelectQuery = {
  leftJoin(table: unknown, condition: unknown): ManualArchiveCanonicalizationDryRunSelectQuery
  where(condition: unknown): ManualArchiveCanonicalizationDryRunSelectQuery
  limit(limit: number): Promise<unknown[]>
}

type ManualArchiveCanonicalizationDryRunReaderRow = {
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
  created_at?: Date | string | null
}

type ManualArchiveAttachmentCountRow = {
  attachment_count: string | number | null
}

type ManualArchiveCanonicalizationDryRunCandidate = {
  row: ManualArchiveCanonicalizationDryRunReaderRow
  attachmentCount: number
}

type ManualArchiveCanonicalizationDryRunEvaluation = {
  reportRow: ManualArchiveRemediationReportRow
  canonicalArsipId: string | null
}

const BLOCKING_BUCKETS = new Set<ManualArchiveRemediationBucket>([
  MANUAL_ARCHIVE_REMEDIATION_BUCKET.NEEDS_HUMAN_METADATA,
  MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_BROKEN,
  MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_WRONG_SOURCE_TYPE,
  MANUAL_ARCHIVE_REMEDIATION_BUCKET.NON_AKTIF_DEFERRED,
  MANUAL_ARCHIVE_REMEDIATION_BUCKET.NOMINAL_INVALID,
])

export async function dryRunManualArchiveCanonicalizationForReview(
  input: ManualArchiveCanonicalizationDryRunInput,
): Promise<ManualArchiveCanonicalizationDryRunResult> {
  if (!trimToNull(input.approvedByUserId)) {
    throw new ManualArchiveCanonicalizationDryRunError(
      'MANUAL_ARCHIVE_CANONICALIZATION_DRY_RUN_APPROVAL_REQUIRED',
    )
  }

  const candidate = await loadDryRunCandidate(input.database, input.manualArsipId)
  if (!candidate) {
    return {
      status: 'not_ready',
      manualArsipId: input.manualArsipId,
      buckets: [],
      missingFields: [],
      warnings: [],
    }
  }

  const evaluation = evaluateDryRunCandidate(candidate)
  const linkedResult = linkedResultIfSafe(input.manualArsipId, evaluation)
  if (linkedResult) return linkedResult

  if (!isReadyForDryRunCanonicalization(candidate, evaluation.reportRow)) {
    return notReadyResult(input.manualArsipId, evaluation.reportRow)
  }

  const plan = createManualArchiveCanonicalWritePlan(
    toManualArchiveCanonicalSource(candidate.row),
  )
  if (plan.action !== 'create') {
    return notReadyResult(input.manualArsipId, evaluation.reportRow)
  }

  return {
    status: 'would_canonicalize',
    manualArsipId: input.manualArsipId,
    buckets: evaluation.reportRow.buckets,
    missingFields: evaluation.reportRow.missingFields,
    warnings: evaluation.reportRow.warnings,
    preview: {
      sourceType: plan.insertValues.sourceType,
      dokumenId: plan.insertValues.dokumenId,
      namaArsip: plan.insertValues.namaArsip,
      nomorSurat: plan.insertValues.nomorSurat,
      klasifikasiId: plan.insertValues.klasifikasiId,
      klasifikasiKodeSnapshot: plan.insertValues.klasifikasiKodeSnapshot,
      klasifikasiNamaSnapshot: plan.insertValues.klasifikasiNamaSnapshot,
      retensiAktif: plan.insertValues.retensiAktif,
      retensiInaktif: plan.insertValues.retensiInaktif,
      masaAktifBerakhir: plan.insertValues.masaAktifBerakhir,
      masaInaktifBerakhir: plan.insertValues.masaInaktifBerakhir,
      archivedAt: plan.insertValues.archivedAt.toISOString(),
      archivedBy: plan.insertValues.archivedBy,
      createdBy: plan.insertValues.createdBy,
      nominalRealisasi: plan.insertValues.nominalRealisasi,
      statusArsip: plan.insertValues.statusArsip,
      metadata: {},
    },
  }
}

async function loadDryRunCandidate(
  database: ManualArchiveCanonicalizationDryRunDatabase,
  manualArsipId: string,
): Promise<ManualArchiveCanonicalizationDryRunCandidate | null> {
  const [row] = await database
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
    .leftJoin(arsip, eq(manualArsip.canonicalArsipId, arsip.id))
    .where(eq(manualArsip.id, manualArsipId))
    .limit(1) as ManualArchiveCanonicalizationDryRunReaderRow[]

  if (!row) return null

  return {
    row,
    attachmentCount: await selectAttachmentCount(database, manualArsipId),
  }
}

async function selectAttachmentCount(
  database: ManualArchiveCanonicalizationDryRunDatabase,
  manualArsipId: string,
): Promise<number> {
  const [row] = await database
    .select({
      attachment_count: sql<number>`count(${manualArsipAttachment.id})`,
    })
    .from(manualArsipAttachment)
    .where(eq(manualArsipAttachment.manualArsipId, manualArsipId))
    .limit(1) as ManualArchiveAttachmentCountRow[]

  return normalizeAttachmentCount(row?.attachment_count)
}

function evaluateDryRunCandidate(
  candidate: ManualArchiveCanonicalizationDryRunCandidate,
): ManualArchiveCanonicalizationDryRunEvaluation {
  const reportRow = classifyManualArchiveRemediationRow({
    manualArsipId: candidate.row.id,
    canonicalArsipId: candidate.row.canonical_arsip_id,
    linkedCanonicalArsipId: candidate.row.linked_canonical_arsip_id,
    linkedCanonicalSourceType: candidate.row.linked_canonical_source_type,
    nama: candidate.row.nama,
    nomorSurat: candidate.row.nomor_surat,
    tanggalDiarsipkan: candidate.row.tanggal_diarsipkan,
    klasifikasiId: candidate.row.klasifikasi_id,
    klasifikasiKodeSnapshot: candidate.row.klasifikasi_kode_snapshot,
    klasifikasiNamaSnapshot: candidate.row.klasifikasi_nama_snapshot,
    retensiAktif: candidate.row.retensi_aktif,
    retensiInaktif: candidate.row.retensi_inaktif,
    masaAktifBerakhir: candidate.row.masa_aktif_berakhir,
    masaInaktifBerakhir: candidate.row.masa_inaktif_berakhir,
    archivedBy: candidate.row.archived_by,
    createdBy: candidate.row.created_by,
    nominalRealisasi: candidate.row.nominal_realisasi,
    statusArsip: candidate.row.status_arsip,
    attachmentCount: candidate.attachmentCount,
    createdAt: candidate.row.created_at,
  })

  return {
    reportRow,
    canonicalArsipId: trimToNull(candidate.row.canonical_arsip_id),
  }
}

function linkedResultIfSafe(
  manualArsipId: string,
  evaluation: ManualArchiveCanonicalizationDryRunEvaluation,
): ManualArchiveCanonicalizationDryRunResult | null {
  if (!evaluation.canonicalArsipId) return null

  if (
    evaluation.reportRow.buckets.includes(MANUAL_ARCHIVE_REMEDIATION_BUCKET.LINKED_OK)
  ) {
    return {
      status: 'already_linked',
      manualArsipId,
      canonicalArsipId: evaluation.canonicalArsipId,
      buckets: evaluation.reportRow.buckets,
      missingFields: evaluation.reportRow.missingFields,
      warnings: evaluation.reportRow.warnings,
    }
  }

  return notReadyResult(manualArsipId, evaluation.reportRow)
}

function isReadyForDryRunCanonicalization(
  candidate: ManualArchiveCanonicalizationDryRunCandidate,
  reportRow: ManualArchiveRemediationReportRow,
): boolean {
  if (trimToNull(candidate.row.canonical_arsip_id)) return false
  if (candidate.row.status_arsip !== ARCHIVE_STATUS.AKTIF) return false
  if (!reportRow.buckets.includes(MANUAL_ARCHIVE_REMEDIATION_BUCKET.READY_FOR_CANONICALIZATION)) {
    return false
  }

  return !reportRow.buckets.some((bucket) => BLOCKING_BUCKETS.has(bucket))
}

function notReadyResult(
  manualArsipId: string,
  reportRow: ManualArchiveRemediationReportRow,
): ManualArchiveCanonicalizationDryRunResult {
  return {
    status: 'not_ready',
    manualArsipId,
    buckets: reportRow.buckets,
    missingFields: reportRow.missingFields,
    warnings: reportRow.warnings,
  }
}

function toManualArchiveCanonicalSource(
  row: ManualArchiveCanonicalizationDryRunReaderRow,
): ManualArchiveCanonicalSource {
  return {
    id: row.id,
    canonicalArsipId: row.canonical_arsip_id,
    nama: row.nama,
    nomorSurat: row.nomor_surat,
    tanggalDiarsipkan: toDateOnlyString(row.tanggal_diarsipkan),
    klasifikasiId: row.klasifikasi_id,
    klasifikasiKodeSnapshot: row.klasifikasi_kode_snapshot,
    klasifikasiNamaSnapshot: row.klasifikasi_nama_snapshot,
    retensiAktif: row.retensi_aktif,
    retensiInaktif: row.retensi_inaktif,
    masaAktifBerakhir: toDateOnlyString(row.masa_aktif_berakhir),
    masaInaktifBerakhir: toDateOnlyString(row.masa_inaktif_berakhir),
    archivedBy: row.archived_by,
    createdBy: row.created_by,
    nominalRealisasi: row.nominal_realisasi,
    statusArsip: row.status_arsip,
  }
}

function toDateOnlyString(value: Date | string | null): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10)

  return trimToNull(value)
}

function normalizeAttachmentCount(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
  }

  const trimmed = trimToNull(value)
  if (!trimmed) return 0

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}
