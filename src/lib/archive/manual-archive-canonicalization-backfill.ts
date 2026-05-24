import { and, eq, isNull, sql } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_STATUS,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'
import {
  createManualArchiveCanonicalWritePlan,
  type ManualArchiveCanonicalInsertValues,
  type ManualArchiveCanonicalSource,
} from '#/lib/archive/manual-archive-canonical'
import {
  classifyManualArchiveRemediationRow,
  MANUAL_ARCHIVE_REMEDIATION_BUCKET,
  type ManualArchiveRemediationBucket,
  type ManualArchiveRemediationMissingField,
  type ManualArchiveRemediationReportRow,
} from '#/lib/archive/manual-archive-remediation-report'

export type ManualArchiveCanonicalizationInput = {
  database: ManualArchiveCanonicalizationDatabase
  manualArsipId: string
  approvedByUserId: string
  approvalNote?: string
}

export type ManualArchiveCanonicalizationResult =
  | {
      status: 'canonicalized'
      manualArsipId: string
      canonicalArsipId: string
      buckets: ManualArchiveRemediationBucket[]
      missingFields: ManualArchiveRemediationMissingField[]
    }
  | {
      status: 'already_linked'
      manualArsipId: string
      canonicalArsipId: string
      buckets: ManualArchiveRemediationBucket[]
      missingFields: ManualArchiveRemediationMissingField[]
    }
  | {
      status: 'not_ready'
      manualArsipId: string
      buckets?: ManualArchiveRemediationBucket[]
      missingFields?: ManualArchiveRemediationMissingField[]
    }

export type ManualArchiveCanonicalizationErrorCode =
  | 'MANUAL_ARCHIVE_CANONICALIZATION_APPROVAL_REQUIRED'
  | 'MANUAL_ARCHIVE_CANONICAL_INSERT_FAILED'
  | 'MANUAL_ARCHIVE_CANONICAL_SOURCE_LINK_FAILED'
  | 'MANUAL_ARCHIVE_CANONICALIZATION_FAILED'

export class ManualArchiveCanonicalizationError extends Error {
  constructor(public readonly code: ManualArchiveCanonicalizationErrorCode) {
    super(code)
    this.name = 'ManualArchiveCanonicalizationError'
  }
}

export type ManualArchiveCanonicalizationDatabase = ManualArchiveCanonicalizationQueryDatabase & {
  transaction<T>(
    operation: (tx: ManualArchiveCanonicalizationTransaction) => Promise<T>,
  ): Promise<T>
}

export type ManualArchiveCanonicalizationTransaction = ManualArchiveCanonicalizationQueryDatabase

type ManualArchiveCanonicalizationQueryDatabase = {
  select(projection: Record<string, unknown>): {
    from(table: unknown): ManualArchiveCanonicalizationSelectQuery
  }
  insert(table: unknown): {
    values(values: ManualArchiveCanonicalInsertValues): {
      returning(projection: Record<string, unknown>): Promise<Array<{ id: string }>>
    }
  }
  update(table: unknown): {
    set(values: Record<string, unknown>): {
      where(condition: unknown): {
        returning(projection: Record<string, unknown>): Promise<Array<{
          id: string
          canonical_arsip_id: string | null
        }>>
      }
    }
  }
}

type ManualArchiveCanonicalizationSelectQuery = {
  leftJoin(table: unknown, condition: unknown): ManualArchiveCanonicalizationSelectQuery
  where(condition: unknown): ManualArchiveCanonicalizationSelectQuery
  limit(limit: number): Promise<unknown[]>
}

type ManualArchiveCanonicalizationReaderRow = {
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

type ManualArchiveCanonicalizationCandidate = {
  row: ManualArchiveCanonicalizationReaderRow
  attachmentCount: number
}

type ManualArchiveCanonicalizationEvaluation = {
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

export async function canonicalizeReadyManualArchiveRowForReview(
  input: ManualArchiveCanonicalizationInput,
): Promise<ManualArchiveCanonicalizationResult> {
  if (!trimToNull(input.approvedByUserId)) {
    throw new ManualArchiveCanonicalizationError(
      'MANUAL_ARCHIVE_CANONICALIZATION_APPROVAL_REQUIRED',
    )
  }

  const initialCandidate = await loadCanonicalizationCandidate(
    input.database,
    input.manualArsipId,
  )
  if (!initialCandidate) {
    return {
      status: 'not_ready',
      manualArsipId: input.manualArsipId,
    }
  }

  const initialEvaluation = evaluateCanonicalizationCandidate(initialCandidate)
  const initialLinkedResult = linkedResultIfSafe(input.manualArsipId, initialEvaluation)
  if (initialLinkedResult) return initialLinkedResult

  if (!isReadyForCanonicalization(initialCandidate, initialEvaluation.reportRow)) {
    return notReadyResult(input.manualArsipId, initialEvaluation.reportRow)
  }

  try {
    return await input.database.transaction(async (tx) => {
      const currentCandidate = await loadCanonicalizationCandidate(tx, input.manualArsipId)
      if (!currentCandidate) {
        return {
          status: 'not_ready',
          manualArsipId: input.manualArsipId,
        }
      }

      const currentEvaluation = evaluateCanonicalizationCandidate(currentCandidate)
      const currentLinkedResult = linkedResultIfSafe(input.manualArsipId, currentEvaluation)
      if (currentLinkedResult) return currentLinkedResult

      if (!isReadyForCanonicalization(currentCandidate, currentEvaluation.reportRow)) {
        return notReadyResult(input.manualArsipId, currentEvaluation.reportRow)
      }

      const plan = createManualArchiveCanonicalWritePlan(
        toManualArchiveCanonicalSource(currentCandidate.row),
      )
      if (plan.action !== 'create') {
        return notReadyResult(input.manualArsipId, currentEvaluation.reportRow)
      }

      const [canonical] = await tx
        .insert(arsip)
        .values(plan.insertValues)
        .returning({
          id: arsip.id,
        })

      if (!canonical?.id) {
        throw new ManualArchiveCanonicalizationError(
          'MANUAL_ARCHIVE_CANONICAL_INSERT_FAILED',
        )
      }

      const [linked] = await tx
        .update(manualArsip)
        .set({
          canonicalArsipId: canonical.id,
        })
        .where(and(
          eq(manualArsip.id, input.manualArsipId),
          isNull(manualArsip.canonicalArsipId),
          eq(manualArsip.statusArsip, ARCHIVE_STATUS.AKTIF),
        ))
        .returning({
          id: manualArsip.id,
          canonical_arsip_id: manualArsip.canonicalArsipId,
        })

      if (linked?.canonical_arsip_id !== canonical.id) {
        throw new ManualArchiveCanonicalizationError(
          'MANUAL_ARCHIVE_CANONICAL_SOURCE_LINK_FAILED',
        )
      }

      return {
        status: 'canonicalized',
        manualArsipId: input.manualArsipId,
        canonicalArsipId: canonical.id,
        buckets: currentEvaluation.reportRow.buckets,
        missingFields: currentEvaluation.reportRow.missingFields,
      }
    })
  } catch (error) {
    if (error instanceof ManualArchiveCanonicalizationError) throw error

    throw new ManualArchiveCanonicalizationError(
      'MANUAL_ARCHIVE_CANONICALIZATION_FAILED',
    )
  }
}

async function loadCanonicalizationCandidate(
  database: ManualArchiveCanonicalizationQueryDatabase,
  manualArsipId: string,
): Promise<ManualArchiveCanonicalizationCandidate | null> {
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
    .limit(1) as ManualArchiveCanonicalizationReaderRow[]

  if (!row) return null

  return {
    row,
    attachmentCount: await selectAttachmentCount(database, manualArsipId),
  }
}

async function selectAttachmentCount(
  database: ManualArchiveCanonicalizationQueryDatabase,
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

function evaluateCanonicalizationCandidate(
  candidate: ManualArchiveCanonicalizationCandidate,
): ManualArchiveCanonicalizationEvaluation {
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
  evaluation: ManualArchiveCanonicalizationEvaluation,
): ManualArchiveCanonicalizationResult | null {
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
    }
  }

  return notReadyResult(manualArsipId, evaluation.reportRow)
}

function isReadyForCanonicalization(
  candidate: ManualArchiveCanonicalizationCandidate,
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
): ManualArchiveCanonicalizationResult {
  return {
    status: 'not_ready',
    manualArsipId,
    buckets: reportRow.buckets,
    missingFields: reportRow.missingFields,
  }
}

function toManualArchiveCanonicalSource(
  row: ManualArchiveCanonicalizationReaderRow,
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
