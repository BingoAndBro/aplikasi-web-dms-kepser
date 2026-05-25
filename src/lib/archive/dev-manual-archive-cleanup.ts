import { lstat, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { eq, inArray } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_SOURCE_TYPE_VALUES,
  type ArchiveSourceType,
} from '#/lib/constants/archive-status'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

export const DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION =
  'HAPUS DATA ARSIP MANUAL DEV INVALID'

export type DevManualArchiveCleanupMode = 'dry_run' | 'execute'

export type DevManualArchiveCleanupStatus =
  | 'completed'
  | 'partial'
  | 'rejected'
  | 'failed'

export type DevManualArchiveCleanupWarning =
  | 'INVALID_CONFIRMATION'
  | 'MANUAL_ROW_HAS_VALID_CANONICAL_ARCHIVE'
  | 'FILE_STILL_REFERENCED_BY_CANONICAL_ARCHIVE'
  | 'UNSAFE_STORAGE_PATH'
  | 'FILE_ALREADY_MISSING'
  | 'FILE_DELETE_FAILED'
  | 'METADATA_DELETE_FAILED'

export type DevManualArchiveCleanupResult = {
  mode: DevManualArchiveCleanupMode
  status: DevManualArchiveCleanupStatus
  scannedManualRows: number
  invalidManualRows: number
  deletedManualRows: number
  scannedAttachmentRows: number
  deletedAttachmentRows: number
  attemptedFileDeleteCount: number
  deletedFileCount: number
  alreadyMissingFileCount: number
  skippedFileCount: number
  failedFileDeleteCount: number
  protectedReferenceCount: number
  warnings: DevManualArchiveCleanupWarning[]
}

export type DevManualArchiveCleanupInput = {
  dryRun?: boolean
  confirm?: string
  limit?: number
  database?: DevManualArchiveCleanupDatabase
  storage?: DevManualArchiveCleanupStorage
}

export type DevManualArchiveCleanupDatabase = {
  select(projection: Record<string, unknown>): DevManualArchiveCleanupSelectFrom
  delete(table: unknown): DevManualArchiveCleanupDeleteWhere
  transaction?<T>(callback: (tx: DevManualArchiveCleanupDatabase) => Promise<T>): Promise<T>
}

type DevManualArchiveCleanupSelectFrom = {
  from(table: unknown): any
}

type DevManualArchiveCleanupDeleteWhere = {
  where(condition: unknown): Promise<unknown>
}

export type DevManualArchiveCleanupFileDeleteOutcome =
  | 'deleted'
  | 'already_missing'
  | 'skipped'
  | 'unsafe_skipped'
  | 'failed'

export type DevManualArchiveCleanupStorage = {
  deleteLogicalFile(input: {
    logicalPath: string
    dryRun: boolean
  }): Promise<DevManualArchiveCleanupFileDeleteOutcome>
}

type ManualArchiveCleanupRow = {
  id: string
  canonical_arsip_id: string | null
  canonical_id: string | null
  canonical_source_type: string | null
}

type ManualArchiveAttachmentCleanupRow = {
  id: string
  manual_arsip_id: string
  logical_path: string
}

type CanonicalArchiveReferenceRow = {
  id: string
  source_type: string | null
  lampiran_snapshot: unknown
}

type CandidateAttachmentPlan = {
  attachmentId: string
  manualArsipId: string
  safeLogicalPath: string | null
  protected: boolean
  fileOutcome: DevManualArchiveCleanupFileDeleteOutcome | null
}

export async function cleanupInvalidManualArchiveDevData(
  input: DevManualArchiveCleanupInput = {},
): Promise<DevManualArchiveCleanupResult> {
  const dryRun = input.dryRun ?? true
  const mode: DevManualArchiveCleanupMode = dryRun ? 'dry_run' : 'execute'
  const warnings = new Set<DevManualArchiveCleanupWarning>()

  if (!dryRun && input.confirm !== DEV_MANUAL_ARCHIVE_CLEANUP_CONFIRMATION) {
    warnings.add('INVALID_CONFIRMATION')
    return createResult({
      mode,
      status: 'rejected',
      warnings,
    })
  }

  try {
    const database = input.database ?? await loadDefaultDatabase()
    const storage = input.storage ?? createLocalDevManualArchiveCleanupStorage()
    const limit = normalizeLimit(input.limit)
    const manualRows = await selectManualArchiveRows(database, limit)
    const invalidManualRows = manualRows.filter(isInvalidManualArchiveRow)
    const protectedManualRows = manualRows.filter(isProtectedManualArchiveRow)

    if (protectedManualRows.length > 0) {
      warnings.add('MANUAL_ROW_HAS_VALID_CANONICAL_ARCHIVE')
    }

    const invalidManualIds = invalidManualRows.map((row) => row.id)
    const protectedReferences = await buildProtectedReferenceSet(database, protectedManualRows)
    const attachments = await selectManualAttachments(database, invalidManualIds)
    const attachmentPlans = await planAttachmentCleanup({
      attachments,
      protectedReferences,
      storage,
      dryRun,
      warnings,
    })
    const blockedManualIds = collectBlockedManualIds(attachmentPlans)
    const metadataDeletePlan = buildMetadataDeletePlan({
      invalidManualIds,
      attachmentPlans,
      blockedManualIds,
    })

    let deletedAttachmentRows = 0
    let deletedManualRows = 0
    let metadataDeleteFailed = false

    if (!dryRun && (metadataDeletePlan.attachmentIds.length > 0 || metadataDeletePlan.manualIds.length > 0)) {
      try {
        const deleted = await deleteInvalidMetadata(database, metadataDeletePlan)
        deletedAttachmentRows = deleted.deletedAttachmentRows
        deletedManualRows = deleted.deletedManualRows
      } catch {
        metadataDeleteFailed = true
        warnings.add('METADATA_DELETE_FAILED')
      }
    }

    return createResult({
      mode,
      status: resolveStatus({
        dryRun,
        metadataDeleteFailed,
        blockedManualCount: blockedManualIds.size,
        failedFileDeleteCount: countFileOutcomes(attachmentPlans, 'failed'),
      }),
      scannedManualRows: manualRows.length,
      invalidManualRows: invalidManualRows.length,
      deletedManualRows,
      scannedAttachmentRows: attachments.length,
      deletedAttachmentRows,
      attemptedFileDeleteCount: attachmentPlans
        .filter((plan) => plan.safeLogicalPath && !plan.protected)
        .length,
      deletedFileCount: countFileOutcomes(attachmentPlans, 'deleted'),
      alreadyMissingFileCount: countFileOutcomes(attachmentPlans, 'already_missing'),
      skippedFileCount: attachmentPlans
        .filter((plan) => plan.protected || plan.fileOutcome === 'skipped' || plan.fileOutcome === 'unsafe_skipped')
        .length,
      failedFileDeleteCount: countFileOutcomes(attachmentPlans, 'failed'),
      protectedReferenceCount: attachmentPlans.filter((plan) => plan.protected).length,
      warnings,
    })
  } catch {
    warnings.add('METADATA_DELETE_FAILED')
    return createResult({
      mode,
      status: 'failed',
      warnings,
    })
  }
}

function isInvalidManualArchiveRow(row: ManualArchiveCleanupRow): boolean {
  if (!trimToNull(row.canonical_arsip_id)) return true
  if (!trimToNull(row.canonical_id)) return true

  return normalizeSourceType(row.canonical_source_type) !== ARCHIVE_SOURCE_TYPE.MANUAL
}

function isProtectedManualArchiveRow(row: ManualArchiveCleanupRow): boolean {
  return Boolean(trimToNull(row.canonical_arsip_id))
    && Boolean(trimToNull(row.canonical_id))
    && normalizeSourceType(row.canonical_source_type) === ARCHIVE_SOURCE_TYPE.MANUAL
}

async function buildProtectedReferenceSet(
  database: DevManualArchiveCleanupDatabase,
  scannedProtectedManualRows: ManualArchiveCleanupRow[],
): Promise<Set<string>> {
  const protectedReferences = new Set<string>()

  const canonicalRows = await selectCanonicalArchiveReferenceRows(database)
  for (const row of canonicalRows) {
    collectWorkflowSnapshotReferences(row.lampiran_snapshot, protectedReferences)
  }

  const allManualRows = await selectManualArchiveRows(database)
  const validManualIds = allManualRows
    .filter(isProtectedManualArchiveRow)
    .map((row) => row.id)
  const scannedProtectedManualIds = scannedProtectedManualRows.map((row) => row.id)
  const protectedManualIds = [...new Set([...validManualIds, ...scannedProtectedManualIds])]
  const protectedAttachments = await selectManualAttachments(database, protectedManualIds)

  for (const attachment of protectedAttachments) {
    const safePath = normalizeCandidateLogicalPath(attachment.logical_path)
    if (safePath) protectedReferences.add(safePath)
  }

  return protectedReferences
}

async function planAttachmentCleanup({
  attachments,
  protectedReferences,
  storage,
  dryRun,
  warnings,
}: {
  attachments: ManualArchiveAttachmentCleanupRow[]
  protectedReferences: Set<string>
  storage: DevManualArchiveCleanupStorage
  dryRun: boolean
  warnings: Set<DevManualArchiveCleanupWarning>
}): Promise<CandidateAttachmentPlan[]> {
  const plans: CandidateAttachmentPlan[] = []

  for (const attachment of attachments) {
    const safeLogicalPath = normalizeCandidateLogicalPath(attachment.logical_path)
    if (!safeLogicalPath) {
      warnings.add('UNSAFE_STORAGE_PATH')
      plans.push({
        attachmentId: attachment.id,
        manualArsipId: attachment.manual_arsip_id,
        safeLogicalPath: null,
        protected: false,
        fileOutcome: 'unsafe_skipped',
      })
      continue
    }

    if (protectedReferences.has(safeLogicalPath)) {
      warnings.add('FILE_STILL_REFERENCED_BY_CANONICAL_ARCHIVE')
      plans.push({
        attachmentId: attachment.id,
        manualArsipId: attachment.manual_arsip_id,
        safeLogicalPath,
        protected: true,
        fileOutcome: 'skipped',
      })
      continue
    }

    let fileOutcome: DevManualArchiveCleanupFileDeleteOutcome
    try {
      fileOutcome = await storage.deleteLogicalFile({
        logicalPath: safeLogicalPath,
        dryRun,
      })
    } catch {
      fileOutcome = 'failed'
    }

    if (fileOutcome === 'already_missing') warnings.add('FILE_ALREADY_MISSING')
    if (fileOutcome === 'unsafe_skipped') warnings.add('UNSAFE_STORAGE_PATH')
    if (fileOutcome === 'failed') warnings.add('FILE_DELETE_FAILED')

    plans.push({
      attachmentId: attachment.id,
      manualArsipId: attachment.manual_arsip_id,
      safeLogicalPath,
      protected: false,
      fileOutcome,
    })
  }

  return plans
}

function collectBlockedManualIds(plans: CandidateAttachmentPlan[]): Set<string> {
  const blocked = new Set<string>()

  for (const plan of plans) {
    if (plan.fileOutcome === 'failed' || plan.fileOutcome === 'unsafe_skipped') {
      blocked.add(plan.manualArsipId)
    }
  }

  return blocked
}

function buildMetadataDeletePlan({
  invalidManualIds,
  attachmentPlans,
  blockedManualIds,
}: {
  invalidManualIds: string[]
  attachmentPlans: CandidateAttachmentPlan[]
  blockedManualIds: Set<string>
}): { manualIds: string[]; attachmentIds: string[] } {
  const deletableManualIds = invalidManualIds.filter((id) => !blockedManualIds.has(id))
  const deletableManualIdSet = new Set(deletableManualIds)
  const deletableAttachmentIds = attachmentPlans
    .filter((plan) => deletableManualIdSet.has(plan.manualArsipId))
    .map((plan) => plan.attachmentId)

  return {
    manualIds: deletableManualIds,
    attachmentIds: deletableAttachmentIds,
  }
}

async function deleteInvalidMetadata(
  database: DevManualArchiveCleanupDatabase,
  plan: { manualIds: string[]; attachmentIds: string[] },
): Promise<{ deletedManualRows: number; deletedAttachmentRows: number }> {
  const execute = async (executor: DevManualArchiveCleanupDatabase) => {
    if (plan.attachmentIds.length > 0) {
      await executor
        .delete(manualArsipAttachment)
        .where(inArray(manualArsipAttachment.id, plan.attachmentIds))
    }

    if (plan.manualIds.length > 0) {
      await executor
        .delete(manualArsip)
        .where(inArray(manualArsip.id, plan.manualIds))
    }
  }

  if (database.transaction) {
    await database.transaction(execute)
  } else {
    await execute(database)
  }

  return {
    deletedManualRows: plan.manualIds.length,
    deletedAttachmentRows: plan.attachmentIds.length,
  }
}

async function selectManualArchiveRows(
  database: DevManualArchiveCleanupDatabase,
  limit?: number,
): Promise<ManualArchiveCleanupRow[]> {
  let query = database
    .select({
      id: manualArsip.id,
      canonical_arsip_id: manualArsip.canonicalArsipId,
      canonical_id: arsip.id,
      canonical_source_type: arsip.sourceType,
    })
    .from(manualArsip)
    .leftJoin(arsip, eq(manualArsip.canonicalArsipId, arsip.id)) as any

  if (typeof limit === 'number') {
    return query.limit(limit) as Promise<ManualArchiveCleanupRow[]>
  }

  return query as Promise<ManualArchiveCleanupRow[]>
}

async function selectManualAttachments(
  database: DevManualArchiveCleanupDatabase,
  manualArsipIds: string[],
): Promise<ManualArchiveAttachmentCleanupRow[]> {
  const ids = [...new Set(manualArsipIds.filter(Boolean))]
  if (ids.length === 0) return []

  return database
    .select({
      id: manualArsipAttachment.id,
      manual_arsip_id: manualArsipAttachment.manualArsipId,
      logical_path: manualArsipAttachment.logicalPath,
    })
    .from(manualArsipAttachment)
    .where(inArray(manualArsipAttachment.manualArsipId, ids))
    .limit(5000) as Promise<ManualArchiveAttachmentCleanupRow[]>
}

async function selectCanonicalArchiveReferenceRows(
  database: DevManualArchiveCleanupDatabase,
): Promise<CanonicalArchiveReferenceRow[]> {
  return database
    .select({
      id: arsip.id,
      source_type: arsip.sourceType,
      lampiran_snapshot: arsip.lampiranSnapshot,
    })
    .from(arsip)
    .limit(5000) as Promise<CanonicalArchiveReferenceRow[]>
}

function collectWorkflowSnapshotReferences(
  snapshot: unknown,
  protectedReferences: Set<string>,
): void {
  for (const entry of parseAttachmentArray(snapshot)) {
    if (!isRecord(entry)) continue

    const rawPath = entry.url
    if (typeof rawPath !== 'string') continue

    const safePath = normalizeCandidateLogicalPath(rawPath)
    if (safePath) protectedReferences.add(safePath)
  }
}

function parseAttachmentArray(value: unknown): unknown[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeCandidateLogicalPath(value: string): string | null {
  try {
    return assertSafeLogicalStoragePath(value)
  } catch {
    return null
  }
}

function countFileOutcomes(
  plans: CandidateAttachmentPlan[],
  outcome: DevManualArchiveCleanupFileDeleteOutcome,
): number {
  return plans.filter((plan) => plan.fileOutcome === outcome).length
}

function resolveStatus({
  dryRun,
  metadataDeleteFailed,
  blockedManualCount,
  failedFileDeleteCount,
}: {
  dryRun: boolean
  metadataDeleteFailed: boolean
  blockedManualCount: number
  failedFileDeleteCount: number
}): DevManualArchiveCleanupStatus {
  if (metadataDeleteFailed) return 'failed'
  if (dryRun) return 'completed'
  if (blockedManualCount > 0 || failedFileDeleteCount > 0) return 'partial'

  return 'completed'
}

function createResult({
  mode,
  status,
  scannedManualRows = 0,
  invalidManualRows = 0,
  deletedManualRows = 0,
  scannedAttachmentRows = 0,
  deletedAttachmentRows = 0,
  attemptedFileDeleteCount = 0,
  deletedFileCount = 0,
  alreadyMissingFileCount = 0,
  skippedFileCount = 0,
  failedFileDeleteCount = 0,
  protectedReferenceCount = 0,
  warnings,
}: {
  mode: DevManualArchiveCleanupMode
  status: DevManualArchiveCleanupStatus
  scannedManualRows?: number
  invalidManualRows?: number
  deletedManualRows?: number
  scannedAttachmentRows?: number
  deletedAttachmentRows?: number
  attemptedFileDeleteCount?: number
  deletedFileCount?: number
  alreadyMissingFileCount?: number
  skippedFileCount?: number
  failedFileDeleteCount?: number
  protectedReferenceCount?: number
  warnings: Set<DevManualArchiveCleanupWarning>
}): DevManualArchiveCleanupResult {
  return {
    mode,
    status,
    scannedManualRows,
    invalidManualRows,
    deletedManualRows,
    scannedAttachmentRows,
    deletedAttachmentRows,
    attemptedFileDeleteCount,
    deletedFileCount,
    alreadyMissingFileCount,
    skippedFileCount,
    failedFileDeleteCount,
    protectedReferenceCount,
    warnings: [...warnings].sort(),
  }
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100

  return Math.min(Math.max(Math.trunc(value), 1), 1000)
}

function normalizeSourceType(value: string | null | undefined): ArchiveSourceType | 'UNKNOWN' {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
    ? value as ArchiveSourceType
    : 'UNKNOWN'
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function createLocalDevManualArchiveCleanupStorage(root = getLocalStorageRoot()): DevManualArchiveCleanupStorage {
  return {
    async deleteLogicalFile({ logicalPath, dryRun }) {
      return deleteLocalLogicalFile({ logicalPath, dryRun, root })
    },
  }
}

async function deleteLocalLogicalFile({
  logicalPath,
  dryRun,
  root,
}: {
  logicalPath: string
  dryRun: boolean
  root: string
}): Promise<DevManualArchiveCleanupFileDeleteOutcome> {
  let physicalPath: string

  try {
    physicalPath = resolvePhysicalStoragePath(root, logicalPath)
  } catch {
    return 'unsafe_skipped'
  }

  const inspection = await inspectDeletableLocalFile(root, physicalPath)
  if (inspection === 'missing') return 'already_missing'
  if (inspection !== 'ok') return 'unsafe_skipped'
  if (dryRun) return 'skipped'

  try {
    await unlink(physicalPath)
    return 'deleted'
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT') || isNodeErrorCode(error, 'ENOTDIR')) {
      return 'already_missing'
    }

    return 'failed'
  }
}

async function inspectDeletableLocalFile(
  storageRoot: string,
  physicalPath: string,
): Promise<'ok' | 'missing' | 'not-a-file' | 'path-outside-root'> {
  try {
    const stats = await lstat(physicalPath)
    if (stats.isSymbolicLink() || !stats.isFile()) return 'not-a-file'

    const [resolvedRoot, resolvedFile] = await Promise.all([
      realpath(storageRoot),
      realpath(physicalPath),
    ])

    return isPhysicalPathInsideRoot(resolvedRoot, resolvedFile)
      ? 'ok'
      : 'path-outside-root'
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT') || isNodeErrorCode(error, 'ENOTDIR')) {
      return 'missing'
    }

    return 'not-a-file'
  }
}

function isPhysicalPathInsideRoot(storageRoot: string, physicalPath: string): boolean {
  const relativePath = path.relative(storageRoot, physicalPath)

  return relativePath !== ''
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath)
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function loadDefaultDatabase(): Promise<DevManualArchiveCleanupDatabase> {
  const { db } = await import('#/db/client')

  return db as unknown as DevManualArchiveCleanupDatabase
}
