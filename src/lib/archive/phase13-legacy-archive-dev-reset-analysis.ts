// Server-only development helper. Do not import from client components.
// Phase 13B-dev.1 analyze-only helper; it must not grow execute/reset behavior.
import { and, eq, inArray, isNotNull, ne, sql, type SQL } from 'drizzle-orm'

import {
  arsip,
  arsipUsulMusnah,
  manualArsip,
  manualArsipAttachment,
  manualArsipCategory,
  masterKlasifikasiArsip,
} from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import {
  ketuaTimAssignments,
  masterDetailPermintaan,
  masterFungsi,
  masterJenisDokumen,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKelengkapanDokumen,
} from '#/db/schema/master'
import { ARCHIVE_SOURCE_TYPE } from '#/lib/constants/archive-status'
import { DOC_STATUS, type StatusDokumen } from '#/lib/constants/document-status'

export type Phase13LegacyArchiveDevResetAnalyzeOnlyWarning =
  | 'WORKFLOW_ARCHIVE_WITHOUT_LINKED_DOCUMENT_NOT_COUNTED'
  | 'WORKFLOW_ARCHIVE_LINKED_TO_NON_ARCHIVED_DOCUMENT_NOT_COUNTED'
  | 'UNKNOWN_ARCHIVE_SOURCE_TYPE_NOT_COUNTED_AS_WORKFLOW_OR_MANUAL'
  | 'ATTACHMENT_METADATA_COUNTS_ARE_METADATA_ROW_COUNTS_NOT_FILE_COUNTS'
  | 'LOG_ROWS_ARE_PROTECTED_BY_DEFAULT_AND_COUNTED_ONLY_AS_POTENTIALLY_AFFECTED'
  | 'PHYSICAL_FILE_DELETION_OUT_OF_SCOPE'
  | 'CLEANUP_EXECUTION_DISABLED_IN_THIS_PHASE'

export type Phase13LegacyArchiveDevResetAnalysis = {
  archiveRowsCandidateCount: number
  archiveAttachmentSnapshotCandidateCount: number
  archivedWorkflowDocumentCandidateCount: number
  archivedWorkflowAttachmentMetadataCandidateCount: number
  manualArchiveRowsCandidateCount: number
  manualArchiveAttachmentCandidateCount: number
  lifecycleOrProposalRowsCandidateCount: number
  logRowsPotentiallyAffectedCount: number
  workflowDocumentRowsPreservedCount: number
  masterDataPreservedCount: number
  physicalFileDeletionPlanned: false
  cleanupExecutionAllowedInThisPhase: false
  warnings: Phase13LegacyArchiveDevResetAnalyzeOnlyWarning[]
}

export type Phase13LegacyArchiveDevResetAnalysisDatabase = {
  select(projection: Record<string, unknown>): Phase13LegacyArchiveDevResetSelectFrom
}

type Phase13LegacyArchiveDevResetSelectFrom = {
  from(table: unknown): any
}

type CountRow = {
  count: string | number | null
}

const PHASE13_DEV_ANALYZE_ONLY_PRESERVED_WORKFLOW_STATUSES = [
  DOC_STATUS.DRAFT,
  DOC_STATUS.IN_PPK_VALIDATION,
  DOC_STATUS.IN_BENDAHARA_APPROVAL,
  DOC_STATUS.NEED_REVISION,
  DOC_STATUS.COMPLETED,
  DOC_STATUS.TERSIMPAN,
] as const satisfies readonly StatusDokumen[]

export async function analyzePhase13LegacyArchiveDevReset(): Promise<Phase13LegacyArchiveDevResetAnalysis> {
  const { db } = await import('#/db/client')

  return analyzePhase13LegacyArchiveDevResetForDatabase(
    db as unknown as Phase13LegacyArchiveDevResetAnalysisDatabase,
  )
}

export async function analyzePhase13LegacyArchiveDevResetForDatabase(
  database: Phase13LegacyArchiveDevResetAnalysisDatabase,
): Promise<Phase13LegacyArchiveDevResetAnalysis> {
  const [
    archiveRowsCandidateCount,
    archiveAttachmentSnapshotCandidateCount,
    archivedWorkflowDocumentCandidateCount,
    archivedWorkflowAttachmentMetadataCandidateCount,
    manualArchiveRowsCandidateCount,
    manualArchiveAttachmentCandidateCount,
    lifecycleOrProposalRowsCandidateCount,
    logRowsPotentiallyAffectedCount,
    workflowDocumentRowsPreservedCount,
    masterDataPreservedCount,
    workflowArchivesWithoutLinkedDocumentCount,
    workflowArchivesLinkedToNonArchivedDocumentCount,
    unknownSourceTypeArchiveCount,
  ] = await Promise.all([
    countRows(database, arsip),
    countArchiveRowsWithSnapshotMetadata(database),
    countArchivedWorkflowDocumentsLinkedToWorkflowArchives(database),
    countArchivedWorkflowDocumentsWithAttachmentMetadata(database),
    countRows(database, manualArsip),
    countRows(database, manualArsipAttachment),
    countRows(database, arsipUsulMusnah),
    countPotentiallyAffectedLogRows(database),
    countRows(database, dokumenTransaksi, [
      inArray(dokumenTransaksi.status, PHASE13_DEV_ANALYZE_ONLY_PRESERVED_WORKFLOW_STATUSES),
    ]),
    countPreservedMasterDataRows(database),
    countRows(database, arsip, [
      eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
      sql`${arsip.dokumenId} is null`,
    ]),
    countWorkflowArchiveRowsLinkedToNonArchivedDocuments(database),
    countRows(database, arsip, [
      sql`${arsip.sourceType} not in ('WORKFLOW', 'MANUAL')`,
    ]),
  ])

  return {
    archiveRowsCandidateCount,
    archiveAttachmentSnapshotCandidateCount,
    archivedWorkflowDocumentCandidateCount,
    archivedWorkflowAttachmentMetadataCandidateCount,
    manualArchiveRowsCandidateCount,
    manualArchiveAttachmentCandidateCount,
    lifecycleOrProposalRowsCandidateCount,
    logRowsPotentiallyAffectedCount,
    workflowDocumentRowsPreservedCount,
    masterDataPreservedCount,
    physicalFileDeletionPlanned: false,
    cleanupExecutionAllowedInThisPhase: false,
    warnings: buildWarnings({
      workflowArchivesWithoutLinkedDocumentCount,
      workflowArchivesLinkedToNonArchivedDocumentCount,
      unknownSourceTypeArchiveCount,
      logRowsPotentiallyAffectedCount,
    }),
  }
}

async function countRows(
  database: Phase13LegacyArchiveDevResetAnalysisDatabase,
  table: unknown,
  filters: SQL[] = [],
): Promise<number> {
  let builder = database
    .select({
      count: sql<number>`count(*)`,
    })
    .from(table) as any

  if (filters.length > 0) {
    builder = builder.where(and(...filters))
  }

  const rows = await builder.limit(1) as CountRow[]

  return normalizeCount(rows[0]?.count)
}

async function countArchiveRowsWithSnapshotMetadata(
  database: Phase13LegacyArchiveDevResetAnalysisDatabase,
): Promise<number> {
  const rows = await database
    .select({
      count: sql<number>`
        count(*) filter (
          where case
            when jsonb_typeof(${arsip.lampiranSnapshot}) = 'array'
            then jsonb_array_length(${arsip.lampiranSnapshot}) > 0
            else false
          end
        )
      `,
    })
    .from(arsip)
    .where(eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW))
    .limit(1) as CountRow[]

  return normalizeCount(rows[0]?.count)
}

async function countArchivedWorkflowDocumentsLinkedToWorkflowArchives(
  database: Phase13LegacyArchiveDevResetAnalysisDatabase,
): Promise<number> {
  const rows = await database
    .select({
      count: sql<number>`count(distinct ${dokumenTransaksi.id})`,
    })
    .from(arsip)
    .innerJoin(dokumenTransaksi, eq(dokumenTransaksi.id, arsip.dokumenId))
    .where(and(
      eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
      eq(dokumenTransaksi.status, DOC_STATUS.ARCHIVED),
    ))
    .limit(1) as CountRow[]

  return normalizeCount(rows[0]?.count)
}

async function countArchivedWorkflowDocumentsWithAttachmentMetadata(
  database: Phase13LegacyArchiveDevResetAnalysisDatabase,
): Promise<number> {
  const rows = await database
    .select({
      count: sql<number>`
        count(distinct case
          when jsonb_typeof(${dokumenTransaksi.lampiranUrls}) = 'array'
          then case
            when jsonb_array_length(${dokumenTransaksi.lampiranUrls}) > 0
            then ${dokumenTransaksi.id}
            else null
          end
          else null
        end)
      `,
    })
    .from(arsip)
    .innerJoin(dokumenTransaksi, eq(dokumenTransaksi.id, arsip.dokumenId))
    .where(and(
      eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
      eq(dokumenTransaksi.status, DOC_STATUS.ARCHIVED),
    ))
    .limit(1) as CountRow[]

  return normalizeCount(rows[0]?.count)
}

async function countPotentiallyAffectedLogRows(
  database: Phase13LegacyArchiveDevResetAnalysisDatabase,
): Promise<number> {
  const rows = await database
    .select({
      count: sql<number>`count(distinct ${logAktivitas.id})`,
    })
    .from(logAktivitas)
    .innerJoin(dokumenTransaksi, eq(dokumenTransaksi.id, logAktivitas.dokumenId))
    .innerJoin(arsip, eq(arsip.dokumenId, dokumenTransaksi.id))
    .where(and(
      eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
      eq(dokumenTransaksi.status, DOC_STATUS.ARCHIVED),
    ))
    .limit(1) as CountRow[]

  return normalizeCount(rows[0]?.count)
}

async function countWorkflowArchiveRowsLinkedToNonArchivedDocuments(
  database: Phase13LegacyArchiveDevResetAnalysisDatabase,
): Promise<number> {
  const rows = await database
    .select({
      count: sql<number>`count(distinct ${arsip.id})`,
    })
    .from(arsip)
    .innerJoin(dokumenTransaksi, eq(dokumenTransaksi.id, arsip.dokumenId))
    .where(and(
      eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
      isNotNull(arsip.dokumenId),
      ne(dokumenTransaksi.status, DOC_STATUS.ARCHIVED),
    ))
    .limit(1) as CountRow[]

  return normalizeCount(rows[0]?.count)
}

async function countPreservedMasterDataRows(
  database: Phase13LegacyArchiveDevResetAnalysisDatabase,
): Promise<number> {
  const counts = await Promise.all([
    countRows(database, masterFungsi),
    countRows(database, masterKegiatan),
    countRows(database, masterKelengkapanDokumen),
    countRows(database, masterJenisPermintaan),
    countRows(database, masterKategoriPermintaan),
    countRows(database, masterDetailPermintaan),
    countRows(database, masterJenisDokumen),
    countRows(database, ketuaTimAssignments),
    countRows(database, masterKlasifikasiArsip),
    countRows(database, manualArsipCategory),
  ])

  return counts.reduce((total, count) => total + count, 0)
}

function buildWarnings({
  workflowArchivesWithoutLinkedDocumentCount,
  workflowArchivesLinkedToNonArchivedDocumentCount,
  unknownSourceTypeArchiveCount,
  logRowsPotentiallyAffectedCount,
}: {
  workflowArchivesWithoutLinkedDocumentCount: number
  workflowArchivesLinkedToNonArchivedDocumentCount: number
  unknownSourceTypeArchiveCount: number
  logRowsPotentiallyAffectedCount: number
}): Phase13LegacyArchiveDevResetAnalyzeOnlyWarning[] {
  const warnings = new Set<Phase13LegacyArchiveDevResetAnalyzeOnlyWarning>([
    'ATTACHMENT_METADATA_COUNTS_ARE_METADATA_ROW_COUNTS_NOT_FILE_COUNTS',
    'PHYSICAL_FILE_DELETION_OUT_OF_SCOPE',
    'CLEANUP_EXECUTION_DISABLED_IN_THIS_PHASE',
  ])

  if (workflowArchivesWithoutLinkedDocumentCount > 0) {
    warnings.add('WORKFLOW_ARCHIVE_WITHOUT_LINKED_DOCUMENT_NOT_COUNTED')
  }

  if (workflowArchivesLinkedToNonArchivedDocumentCount > 0) {
    warnings.add('WORKFLOW_ARCHIVE_LINKED_TO_NON_ARCHIVED_DOCUMENT_NOT_COUNTED')
  }

  if (unknownSourceTypeArchiveCount > 0) {
    warnings.add('UNKNOWN_ARCHIVE_SOURCE_TYPE_NOT_COUNTED_AS_WORKFLOW_OR_MANUAL')
  }

  if (logRowsPotentiallyAffectedCount > 0) {
    warnings.add('LOG_ROWS_ARE_PROTECTED_BY_DEFAULT_AND_COUNTED_ONLY_AS_POTENTIALLY_AFFECTED')
  }

  return [...warnings].sort()
}

function normalizeCount(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : 0

  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}
