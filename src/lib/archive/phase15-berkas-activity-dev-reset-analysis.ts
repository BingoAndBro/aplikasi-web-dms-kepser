// Server-only module. Development-only archive data reset helper; do not import from client components.
import { sql } from 'drizzle-orm'

import {
  berkasArsip,
  berkasArsipActivity,
  berkasArsipItem,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'

export const PHASE15_BERKAS_ACTIVITY_DEV_RESET_CONFIRMATION =
  'RESET DEV ARCHIVE DATA FOR AUTHORITATIVE BERKAS ACTIVITY LOG'

export type Phase15BerkasActivityDevResetMode = 'dry_run' | 'execute'

export type Phase15BerkasActivityDevResetStatus =
  | 'dry_run'
  | 'completed'
  | 'confirmation_required'
  | 'production_refused'

export type Phase15BerkasActivityDevResetWarning =
  | 'ARCHIVE_LIFECYCLE_PROPOSAL_ROWS_NOT_PRESENT_IN_ACTIVE_SCHEMA'
  | 'AUTH_MASTER_USER_DATA_PRESERVED'
  | 'FUNGSI_KEGIATAN_KELENGKAPAN_PRESERVED'
  | 'INVALID_CONFIRMATION'
  | 'PHYSICAL_FILE_DELETION_OUT_OF_SCOPE'
  | 'PRODUCTION_RUNTIME_REFUSED'
  | 'WORKFLOW_SOURCE_DOCUMENTS_PRESERVED'

export type Phase15BerkasActivityDevResetTableCounts = {
  berkas_arsip_activity: number
  berkas_arsip_item: number
  berkas_arsip: number
  manual_arsip_attachment: number
  manual_arsip: number
  archive_lifecycle_or_proposal: number
}

export type Phase15BerkasActivityDevResetPreservedCounts = {
  workflow_source_documents_referenced_by_berkas_items: number
  workflow_source_documents_deleted: 0
  workflow_approval_history_deleted: 0
  auth_user_session_rows_deleted: 0
  master_data_rows_deleted: 0
  fungsi_kegiatan_rows_deleted: 0
  kelengkapan_configuration_rows_deleted: 0
}

export type Phase15BerkasActivityDevResetReport = {
  mode: Phase15BerkasActivityDevResetMode
  status: Phase15BerkasActivityDevResetStatus
  would_delete_rows_by_table: Phase15BerkasActivityDevResetTableCounts
  deleted_rows_by_table: Phase15BerkasActivityDevResetTableCounts
  preserved_counts: Phase15BerkasActivityDevResetPreservedCounts
  physicalFileDeletionPerformed: false
  warnings: Phase15BerkasActivityDevResetWarning[]
}

export type Phase15BerkasActivityDevResetRepository = {
  countResetScope(): Promise<{
    deleteCounts: Phase15BerkasActivityDevResetTableCounts
    preservedCounts: Phase15BerkasActivityDevResetPreservedCounts
  }>
  executeReset(): Promise<Phase15BerkasActivityDevResetTableCounts>
}

export type Phase15BerkasActivityDevResetInput = {
  dryRun?: boolean
  confirmation?: string
  repository?: Phase15BerkasActivityDevResetRepository
}

const EMPTY_TABLE_COUNTS: Phase15BerkasActivityDevResetTableCounts = {
  berkas_arsip_activity: 0,
  berkas_arsip_item: 0,
  berkas_arsip: 0,
  manual_arsip_attachment: 0,
  manual_arsip: 0,
  archive_lifecycle_or_proposal: 0,
}

const EMPTY_PRESERVED_COUNTS: Phase15BerkasActivityDevResetPreservedCounts = {
  workflow_source_documents_referenced_by_berkas_items: 0,
  workflow_source_documents_deleted: 0,
  workflow_approval_history_deleted: 0,
  auth_user_session_rows_deleted: 0,
  master_data_rows_deleted: 0,
  fungsi_kegiatan_rows_deleted: 0,
  kelengkapan_configuration_rows_deleted: 0,
}

const DEFAULT_WARNINGS: Phase15BerkasActivityDevResetWarning[] = [
  'ARCHIVE_LIFECYCLE_PROPOSAL_ROWS_NOT_PRESENT_IN_ACTIVE_SCHEMA',
  'AUTH_MASTER_USER_DATA_PRESERVED',
  'FUNGSI_KEGIATAN_KELENGKAPAN_PRESERVED',
  'PHYSICAL_FILE_DELETION_OUT_OF_SCOPE',
  'WORKFLOW_SOURCE_DOCUMENTS_PRESERVED',
]

export async function analyzePhase15BerkasActivityDevReset(
  input: Omit<Phase15BerkasActivityDevResetInput, 'dryRun' | 'confirmation'> = {},
): Promise<Phase15BerkasActivityDevResetReport> {
  return resetPhase15BerkasActivityDevData({
    ...input,
    dryRun: true,
  })
}

export async function resetPhase15BerkasActivityDevData(
  input: Phase15BerkasActivityDevResetInput = {},
): Promise<Phase15BerkasActivityDevResetReport> {
  const dryRun = input.dryRun !== false
  const repository = input.repository ?? defaultPhase15BerkasActivityDevResetRepository

  if (!dryRun && input.confirmation !== PHASE15_BERKAS_ACTIVITY_DEV_RESET_CONFIRMATION) {
    return emptyReport({
      mode: 'execute',
      status: 'confirmation_required',
      warnings: ['INVALID_CONFIRMATION'],
    })
  }

  if (!dryRun && process.env.NODE_ENV === 'production') {
    return emptyReport({
      mode: 'execute',
      status: 'production_refused',
      warnings: ['PRODUCTION_RUNTIME_REFUSED'],
    })
  }

  const analysis = await repository.countResetScope()

  if (dryRun) {
    return {
      mode: 'dry_run',
      status: 'dry_run',
      would_delete_rows_by_table: analysis.deleteCounts,
      deleted_rows_by_table: { ...EMPTY_TABLE_COUNTS },
      preserved_counts: analysis.preservedCounts,
      physicalFileDeletionPerformed: false,
      warnings: [...DEFAULT_WARNINGS].sort(),
    }
  }

  const deletedCounts = await repository.executeReset()

  return {
    mode: 'execute',
    status: 'completed',
    would_delete_rows_by_table: analysis.deleteCounts,
    deleted_rows_by_table: deletedCounts,
    preserved_counts: analysis.preservedCounts,
    physicalFileDeletionPerformed: false,
    warnings: [...DEFAULT_WARNINGS].sort(),
  }
}

function emptyReport({
  mode,
  status,
  warnings,
}: {
  mode: Phase15BerkasActivityDevResetMode
  status: Phase15BerkasActivityDevResetStatus
  warnings: Phase15BerkasActivityDevResetWarning[]
}): Phase15BerkasActivityDevResetReport {
  return {
    mode,
    status,
    would_delete_rows_by_table: { ...EMPTY_TABLE_COUNTS },
    deleted_rows_by_table: { ...EMPTY_TABLE_COUNTS },
    preserved_counts: { ...EMPTY_PRESERVED_COUNTS },
    physicalFileDeletionPerformed: false,
    warnings: [...warnings].sort(),
  }
}

const defaultPhase15BerkasActivityDevResetRepository: Phase15BerkasActivityDevResetRepository = {
  async countResetScope() {
    const database = await getDatabase()
    return countResetScopeWithDatabase(database)
  },

  async executeReset() {
    const database = await getDatabase()
    return database.transaction(async (tx: ArchiveResetDatabase) => {
      const analysis = await countResetScopeWithDatabase(tx)

      await tx.delete(berkasArsipActivity)
      await tx.delete(berkasArsipItem)
      await tx.delete(manualArsipAttachment)
      await tx.delete(manualArsip)
      await tx.delete(berkasArsip)

      return analysis.deleteCounts
    })
  },
}

type ArchiveResetDatabase = {
  select: (...args: unknown[]) => any
  delete: (...args: unknown[]) => any
  transaction?: (...args: unknown[]) => any
}

async function countResetScopeWithDatabase(
  database: ArchiveResetDatabase,
): Promise<{
  deleteCounts: Phase15BerkasActivityDevResetTableCounts
  preservedCounts: Phase15BerkasActivityDevResetPreservedCounts
}> {
  const [
    activityRows,
    itemRows,
    berkasRows,
    manualAttachmentRows,
    manualRows,
    workflowItemRows,
  ] = await Promise.all([
    countTable(database, berkasArsipActivity),
    countTable(database, berkasArsipItem),
    countTable(database, berkasArsip),
    countTable(database, manualArsipAttachment),
    countTable(database, manualArsip),
    countWorkflowArchiveItemRows(database),
  ])

  return {
    deleteCounts: {
      berkas_arsip_activity: activityRows,
      berkas_arsip_item: itemRows,
      berkas_arsip: berkasRows,
      manual_arsip_attachment: manualAttachmentRows,
      manual_arsip: manualRows,
      archive_lifecycle_or_proposal: 0,
    },
    preservedCounts: {
      ...EMPTY_PRESERVED_COUNTS,
      workflow_source_documents_referenced_by_berkas_items: workflowItemRows,
    },
  }
}

async function countTable(database: ArchiveResetDatabase, table: unknown): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(table)

  return Number(row?.count ?? 0)
}

async function countWorkflowArchiveItemRows(database: ArchiveResetDatabase): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(berkasArsipItem)
    .where(sql`${berkasArsipItem.sourceType} = 'WORKFLOW' and ${berkasArsipItem.dokumenId} is not null`)

  return Number(row?.count ?? 0)
}

async function getDatabase(): Promise<ArchiveResetDatabase> {
  const client = await import('#/db/client')
  return client.db as ArchiveResetDatabase
}
