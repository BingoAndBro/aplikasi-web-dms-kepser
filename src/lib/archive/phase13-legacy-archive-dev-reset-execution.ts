// Server-only development helper. Do not import from client components.
import { eq, inArray, sql } from 'drizzle-orm'

import {
  arsip,
  arsipUsulMusnah,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { ARCHIVE_SOURCE_TYPE } from '#/lib/constants/archive-status'
import { DOC_STATUS } from '#/lib/constants/document-status'
import {
  analyzePhase13LegacyArchiveDevResetForDatabase,
  type Phase13LegacyArchiveDevResetAnalysis,
  type Phase13LegacyArchiveDevResetAnalysisDatabase,
} from '#/lib/archive/phase13-legacy-archive-dev-reset-analysis'

export const PHASE13_LEGACY_ARCHIVE_DEV_RESET_CONFIRMATION =
  'RESET LEGACY ARCHIVE DEV DATA FOR PHASE 13'

export type Phase13LegacyArchiveDevResetExecutionMode = 'analyze' | 'execute'

export type Phase13LegacyArchiveDevResetExecutionWarning =
  | 'ATTACHMENT_METADATA_COUNTS_ARE_METADATA_ROW_COUNTS_NOT_FILE_COUNTS'
  | 'LOG_ROWS_DELETED_BY_NARROW_DEV_RESET_EXCEPTION'
  | 'PHYSICAL_FILE_DELETION_OUT_OF_SCOPE'

export type Phase13LegacyArchiveDevResetExecutionResult = {
  deletedArchiveRowsCount: number
  deletedArchiveSnapshotMetadataCount: number
  deletedArchivedWorkflowDocumentsCount: number
  deletedArchivedWorkflowAttachmentMetadataCount: number
  deletedManualArchiveRowsCount: number
  deletedManualArchiveAttachmentRowsCount: number
  deletedLifecycleOrProposalRowsCount: number
  deletedLogRowsCount: number
  physicalFileDeletionPerformed: false
  warnings: Phase13LegacyArchiveDevResetExecutionWarning[]
}

export type Phase13LegacyArchiveDevResetExecutionInput = {
  mode?: Phase13LegacyArchiveDevResetExecutionMode
  confirmation?: string
  database?: Phase13LegacyArchiveDevResetExecutionDatabase
}

export type Phase13LegacyArchiveDevResetExecutionDatabase =
  Phase13LegacyArchiveDevResetAnalysisDatabase & {
    delete(table: unknown): Phase13LegacyArchiveDevResetDeleteWhere
    transaction<T>(
      callback: (tx: Phase13LegacyArchiveDevResetExecutionDatabase) => Promise<T>,
    ): Promise<T>
  }

type Phase13LegacyArchiveDevResetDeleteWhere = {
  where(condition: unknown): Phase13LegacyArchiveDevResetDeleteReturning
}

type Phase13LegacyArchiveDevResetDeleteReturning = {
  returning(projection: Record<string, unknown>): Promise<unknown[]>
}

type IdRow = {
  id: string | null
}

export async function resetPhase13LegacyArchiveDevData(
  input: Phase13LegacyArchiveDevResetExecutionInput = {},
): Promise<Phase13LegacyArchiveDevResetAnalysis | Phase13LegacyArchiveDevResetExecutionResult> {
  if ((input.mode ?? 'analyze') === 'execute') {
    assertExactConfirmation(input.confirmation)
  }

  const database = input.database ?? await loadDefaultDatabase()

  return resetPhase13LegacyArchiveDevDataForDatabase(database, input)
}

export async function resetPhase13LegacyArchiveDevDataForDatabase(
  database: Phase13LegacyArchiveDevResetExecutionDatabase,
  input: Omit<Phase13LegacyArchiveDevResetExecutionInput, 'database'> = {},
): Promise<Phase13LegacyArchiveDevResetAnalysis | Phase13LegacyArchiveDevResetExecutionResult> {
  const mode = input.mode ?? 'analyze'

  if (mode === 'analyze') {
    return analyzePhase13LegacyArchiveDevResetForDatabase(database)
  }

  assertExactConfirmation(input.confirmation)

  if (typeof database.transaction !== 'function') {
    throw new Error('Phase 13 legacy archive dev reset requires transaction support.')
  }

  return database.transaction(async (tx) => {
    const analysis = await analyzePhase13LegacyArchiveDevResetForDatabase(tx)
    const candidateArchiveIds = await selectCandidateArchiveIds(tx)
    const candidateManualArchiveIds = await selectCandidateManualArchiveIds(tx)
    const candidateArchivedWorkflowDocumentIds = await selectCandidateArchivedWorkflowDocumentIds(tx)

    const deletedLifecycleOrProposalRowsCount = await deleteByIds({
      database: tx,
      table: arsipUsulMusnah,
      column: arsipUsulMusnah.arsipId,
      ids: candidateArchiveIds,
      returningColumn: arsipUsulMusnah.id,
    })
    const deletedManualArchiveAttachmentRowsCount = await deleteByIds({
      database: tx,
      table: manualArsipAttachment,
      column: manualArsipAttachment.manualArsipId,
      ids: candidateManualArchiveIds,
      returningColumn: manualArsipAttachment.id,
    })
    const deletedManualArchiveRowsCount = await deleteByIds({
      database: tx,
      table: manualArsip,
      column: manualArsip.id,
      ids: candidateManualArchiveIds,
      returningColumn: manualArsip.id,
    })
    const deletedArchiveRowsCount = await deleteByIds({
      database: tx,
      table: arsip,
      column: arsip.id,
      ids: candidateArchiveIds,
      returningColumn: arsip.id,
    })
    const deletedLogRowsCount = await deleteByIds({
      database: tx,
      table: logAktivitas,
      column: logAktivitas.dokumenId,
      ids: candidateArchivedWorkflowDocumentIds,
      returningColumn: logAktivitas.id,
    })
    const deletedArchivedWorkflowDocumentsCount = await deleteByIds({
      database: tx,
      table: dokumenTransaksi,
      column: dokumenTransaksi.id,
      ids: candidateArchivedWorkflowDocumentIds,
      returningColumn: dokumenTransaksi.id,
    })

    return {
      deletedArchiveRowsCount,
      deletedArchiveSnapshotMetadataCount: analysis.archiveAttachmentSnapshotCandidateCount,
      deletedArchivedWorkflowDocumentsCount,
      deletedArchivedWorkflowAttachmentMetadataCount:
        analysis.archivedWorkflowAttachmentMetadataCandidateCount,
      deletedManualArchiveRowsCount,
      deletedManualArchiveAttachmentRowsCount,
      deletedLifecycleOrProposalRowsCount,
      deletedLogRowsCount,
      physicalFileDeletionPerformed: false,
      warnings: buildExecutionWarnings(deletedLogRowsCount),
    }
  })
}

function assertExactConfirmation(confirmation: string | undefined): void {
  if (confirmation !== PHASE13_LEGACY_ARCHIVE_DEV_RESET_CONFIRMATION) {
    throw new Error('Phase 13 legacy archive dev reset confirmation mismatch.')
  }
}

async function selectCandidateArchiveIds(
  database: Phase13LegacyArchiveDevResetExecutionDatabase,
): Promise<string[]> {
  const rows = await database
    .select({ id: arsip.id })
    .from(arsip) as IdRow[]

  return normalizeIds(rows)
}

async function selectCandidateManualArchiveIds(
  database: Phase13LegacyArchiveDevResetExecutionDatabase,
): Promise<string[]> {
  const rows = await database
    .select({ id: manualArsip.id })
    .from(manualArsip) as IdRow[]

  return normalizeIds(rows)
}

async function selectCandidateArchivedWorkflowDocumentIds(
  database: Phase13LegacyArchiveDevResetExecutionDatabase,
): Promise<string[]> {
  const rows = await database
    .select({
      id: sql<string>`distinct ${dokumenTransaksi.id}`,
    })
    .from(arsip)
    .innerJoin(dokumenTransaksi, eq(dokumenTransaksi.id, arsip.dokumenId))
    .where(sql`${arsip.sourceType} = ${ARCHIVE_SOURCE_TYPE.WORKFLOW}
      and ${dokumenTransaksi.status} = ${DOC_STATUS.ARCHIVED}`) as IdRow[]

  return normalizeIds(rows)
}

async function deleteByIds({
  database,
  table,
  column,
  ids,
  returningColumn,
}: {
  database: Phase13LegacyArchiveDevResetExecutionDatabase
  table: unknown
  column: unknown
  ids: string[]
  returningColumn: unknown
}): Promise<number> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (uniqueIds.length === 0) return 0

  const deletedRows = await database
    .delete(table)
    .where(inArray(column as never, uniqueIds))
    .returning({ id: returningColumn })

  return deletedRows.length
}

function buildExecutionWarnings(
  deletedLogRowsCount: number,
): Phase13LegacyArchiveDevResetExecutionWarning[] {
  const warnings = new Set<Phase13LegacyArchiveDevResetExecutionWarning>([
    'ATTACHMENT_METADATA_COUNTS_ARE_METADATA_ROW_COUNTS_NOT_FILE_COUNTS',
    'PHYSICAL_FILE_DELETION_OUT_OF_SCOPE',
  ])

  if (deletedLogRowsCount > 0) {
    warnings.add('LOG_ROWS_DELETED_BY_NARROW_DEV_RESET_EXCEPTION')
  }

  return [...warnings].sort()
}

function normalizeIds(rows: IdRow[]): string[] {
  return [...new Set(rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

async function loadDefaultDatabase(): Promise<Phase13LegacyArchiveDevResetExecutionDatabase> {
  const { db } = await import('#/db/client')

  return db as unknown as Phase13LegacyArchiveDevResetExecutionDatabase
}
