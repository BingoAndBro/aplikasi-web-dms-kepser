import { lstat, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_SOURCE_TYPE_VALUES,
  ARCHIVE_STATUS,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

export type UnifiedArchivePhysicalDestructionStatus =
  | 'completed'
  | 'partial'
  | 'skipped'
  | 'not_found'
  | 'not_destroyed'
  | 'failed'

export type UnifiedArchivePhysicalDestructionWarning =
  | 'UNKNOWN_SOURCE_TYPE'
  | 'MANUAL_SOURCE_MISSING'
  | 'NO_FILE_CANDIDATES'
  | 'UNSAFE_FILE_CANDIDATE_SKIPPED'
  | 'PHYSICAL_FILE_ALREADY_MISSING'
  | 'PHYSICAL_FILE_DELETE_FAILED'
  | 'DRY_RUN_NO_FILES_DELETED'

export type UnifiedArchivePhysicalDestructionResult = {
  status: UnifiedArchivePhysicalDestructionStatus
  archiveId: string
  sourceType: ArchiveSourceType | 'UNKNOWN' | null
  attemptedCount: number
  deletedCount: number
  alreadyMissingCount: number
  failedCount: number
  skippedCount: number
  warnings: UnifiedArchivePhysicalDestructionWarning[]
}

export type UnifiedArchivePhysicalDestructionDatabase = {
  select(projection: Record<string, unknown>): UnifiedArchivePhysicalDestructionSelectFrom
}

type UnifiedArchivePhysicalDestructionSelectFrom = {
  from(table: unknown): any
}

export type PhysicalFileDeleteOutcome =
  | 'deleted'
  | 'already_missing'
  | 'skipped'
  | 'unsafe_skipped'
  | 'failed'

export type UnifiedArchivePhysicalDestructionStorage = {
  deleteLogicalFile(input: {
    logicalPath: string
    dryRun: boolean
  }): Promise<PhysicalFileDeleteOutcome>
}

export type DestroyPhysicalFilesForDestroyedArchiveInput = {
  archiveId: string
  approvedByUserId?: string
  actorId?: string
  dryRun?: boolean
  database?: UnifiedArchivePhysicalDestructionDatabase
  storage?: UnifiedArchivePhysicalDestructionStorage
}

type CanonicalArchivePhysicalDestructionRow = {
  id: string
  source_type: string | null
  status_arsip: StatusArsip
  lampiran_snapshot: unknown
}

type ManualSourcePhysicalDestructionRow = {
  id: string
}

type ManualAttachmentPhysicalDestructionRow = {
  id: string
  logical_path: string
}

type SafeCandidateCollection = {
  logicalPaths: string[]
  skippedCount: number
  warnings: UnifiedArchivePhysicalDestructionWarning[]
}

export async function destroyPhysicalFilesForDestroyedArchive({
  archiveId,
  dryRun = false,
  database,
  storage,
}: DestroyPhysicalFilesForDestroyedArchiveInput): Promise<UnifiedArchivePhysicalDestructionResult> {
  const db = database ?? await loadDefaultDatabase()
  const fileStorage = storage ?? createLocalPhysicalDestructionStorage()
  const canonical = await selectCanonicalArchive(db, archiveId)

  if (!canonical) {
    return emptyResult({
      status: 'not_found',
      archiveId,
      sourceType: null,
    })
  }

  const sourceType = normalizeSourceType(canonical.source_type)
  if (canonical.status_arsip !== ARCHIVE_STATUS.DIMUSNAHKAN) {
    return emptyResult({
      status: 'not_destroyed',
      archiveId,
      sourceType,
    })
  }

  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    return destroyWorkflowArchivePhysicalFiles({
      archiveId,
      canonical,
      storage: fileStorage,
      dryRun,
      sourceType,
    })
  }

  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) {
    return destroyManualArchivePhysicalFiles({
      archiveId,
      database: db,
      storage: fileStorage,
      dryRun,
      sourceType,
    })
  }

  return emptyResult({
    status: 'skipped',
    archiveId,
    sourceType,
    skippedCount: 1,
    warnings: ['UNKNOWN_SOURCE_TYPE'],
  })
}

async function destroyWorkflowArchivePhysicalFiles({
  archiveId,
  canonical,
  storage,
  dryRun,
  sourceType,
}: {
  archiveId: string
  canonical: CanonicalArchivePhysicalDestructionRow
  storage: UnifiedArchivePhysicalDestructionStorage
  dryRun: boolean
  sourceType: ArchiveSourceType
}): Promise<UnifiedArchivePhysicalDestructionResult> {
  const candidates = collectSafeWorkflowSnapshotCandidates(canonical.lampiran_snapshot)

  return deleteCollectedCandidates({
    archiveId,
    sourceType,
    storage,
    dryRun,
    candidates,
  })
}

async function destroyManualArchivePhysicalFiles({
  archiveId,
  database,
  storage,
  dryRun,
  sourceType,
}: {
  archiveId: string
  database: UnifiedArchivePhysicalDestructionDatabase
  storage: UnifiedArchivePhysicalDestructionStorage
  dryRun: boolean
  sourceType: ArchiveSourceType
}): Promise<UnifiedArchivePhysicalDestructionResult> {
  const manualSource = await selectManualSource(database, archiveId)
  if (!manualSource) {
    return emptyResult({
      status: 'skipped',
      archiveId,
      sourceType,
      skippedCount: 1,
      warnings: ['MANUAL_SOURCE_MISSING'],
    })
  }

  const attachments = await selectManualAttachments(database, manualSource.id)
  const candidates = collectSafeManualAttachmentCandidates(attachments)

  return deleteCollectedCandidates({
    archiveId,
    sourceType,
    storage,
    dryRun,
    candidates,
  })
}

async function deleteCollectedCandidates({
  archiveId,
  sourceType,
  storage,
  dryRun,
  candidates,
}: {
  archiveId: string
  sourceType: ArchiveSourceType
  storage: UnifiedArchivePhysicalDestructionStorage
  dryRun: boolean
  candidates: SafeCandidateCollection
}): Promise<UnifiedArchivePhysicalDestructionResult> {
  let attemptedCount = 0
  let deletedCount = 0
  let alreadyMissingCount = 0
  let failedCount = 0
  let skippedCount = candidates.skippedCount
  const warnings = new Set<UnifiedArchivePhysicalDestructionWarning>(candidates.warnings)

  if (dryRun && candidates.logicalPaths.length > 0) {
    warnings.add('DRY_RUN_NO_FILES_DELETED')
  }

  for (const logicalPath of candidates.logicalPaths) {
    attemptedCount += 1

    let outcome: PhysicalFileDeleteOutcome
    try {
      outcome = await storage.deleteLogicalFile({ logicalPath, dryRun })
    } catch {
      outcome = 'failed'
    }

    if (outcome === 'deleted') {
      deletedCount += 1
    } else if (outcome === 'already_missing') {
      alreadyMissingCount += 1
      warnings.add('PHYSICAL_FILE_ALREADY_MISSING')
    } else if (outcome === 'unsafe_skipped') {
      skippedCount += 1
      warnings.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
    } else if (outcome === 'skipped') {
      skippedCount += 1
    } else {
      failedCount += 1
      warnings.add('PHYSICAL_FILE_DELETE_FAILED')
    }
  }

  if (attemptedCount === 0 && skippedCount === 0) {
    warnings.add('NO_FILE_CANDIDATES')
  }

  return {
    status: resolveResultStatus({
      attemptedCount,
      deletedCount,
      alreadyMissingCount,
      failedCount,
      skippedCount,
    }),
    archiveId,
    sourceType,
    attemptedCount,
    deletedCount,
    alreadyMissingCount,
    failedCount,
    skippedCount,
    warnings: [...warnings].sort(),
  }
}

function collectSafeWorkflowSnapshotCandidates(snapshot: unknown): SafeCandidateCollection {
  const entries = parseWorkflowAttachmentSnapshot(snapshot)
  const logicalPaths: string[] = []
  let skippedCount = 0
  const warnings = new Set<UnifiedArchivePhysicalDestructionWarning>()

  for (const entry of entries) {
    if (!isRecord(entry)) {
      skippedCount += 1
      warnings.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
      continue
    }

    const rawPath = entry.url
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      skippedCount += 1
      warnings.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
      continue
    }

    const logicalPath = normalizeCandidateLogicalPath(rawPath)
    if (!logicalPath) {
      skippedCount += 1
      warnings.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
      continue
    }

    logicalPaths.push(logicalPath)
  }

  return {
    logicalPaths: unique(logicalPaths),
    skippedCount,
    warnings: [...warnings],
  }
}

function collectSafeManualAttachmentCandidates(
  attachments: ManualAttachmentPhysicalDestructionRow[],
): SafeCandidateCollection {
  const logicalPaths: string[] = []
  let skippedCount = 0
  const warnings = new Set<UnifiedArchivePhysicalDestructionWarning>()

  for (const attachment of attachments) {
    const logicalPath = normalizeCandidateLogicalPath(attachment.logical_path)
    if (!logicalPath) {
      skippedCount += 1
      warnings.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
      continue
    }

    logicalPaths.push(logicalPath)
  }

  return {
    logicalPaths: unique(logicalPaths),
    skippedCount,
    warnings: [...warnings],
  }
}

function normalizeCandidateLogicalPath(value: string): string | null {
  try {
    return assertSafeLogicalStoragePath(value)
  } catch {
    return null
  }
}

function parseWorkflowAttachmentSnapshot(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function resolveResultStatus({
  attemptedCount,
  deletedCount,
  alreadyMissingCount,
  failedCount,
  skippedCount,
}: {
  attemptedCount: number
  deletedCount: number
  alreadyMissingCount: number
  failedCount: number
  skippedCount: number
}): UnifiedArchivePhysicalDestructionStatus {
  if (failedCount > 0) {
    return deletedCount > 0 || alreadyMissingCount > 0 || skippedCount > 0 ? 'partial' : 'failed'
  }

  if (attemptedCount === 0) return 'skipped'
  if (skippedCount > 0) return 'partial'

  return 'completed'
}

function emptyResult({
  status,
  archiveId,
  sourceType,
  skippedCount = 0,
  warnings = [],
}: {
  status: UnifiedArchivePhysicalDestructionStatus
  archiveId: string
  sourceType: ArchiveSourceType | 'UNKNOWN' | null
  skippedCount?: number
  warnings?: UnifiedArchivePhysicalDestructionWarning[]
}): UnifiedArchivePhysicalDestructionResult {
  return {
    status,
    archiveId,
    sourceType,
    attemptedCount: 0,
    deletedCount: 0,
    alreadyMissingCount: 0,
    failedCount: 0,
    skippedCount,
    warnings: [...warnings].sort(),
  }
}

async function selectCanonicalArchive(
  database: UnifiedArchivePhysicalDestructionDatabase,
  archiveId: string,
): Promise<CanonicalArchivePhysicalDestructionRow | null> {
  const rows = await database
    .select({
      id: arsip.id,
      source_type: arsip.sourceType,
      status_arsip: arsip.statusArsip,
      lampiran_snapshot: arsip.lampiranSnapshot,
    })
    .from(arsip)
    .where(eq(arsip.id, archiveId))
    .limit(1) as CanonicalArchivePhysicalDestructionRow[]

  return rows[0] ?? null
}

async function selectManualSource(
  database: UnifiedArchivePhysicalDestructionDatabase,
  archiveId: string,
): Promise<ManualSourcePhysicalDestructionRow | null> {
  const rows = await database
    .select({
      id: manualArsip.id,
    })
    .from(manualArsip)
    .where(eq(manualArsip.canonicalArsipId, archiveId))
    .limit(1) as ManualSourcePhysicalDestructionRow[]

  return rows[0] ?? null
}

async function selectManualAttachments(
  database: UnifiedArchivePhysicalDestructionDatabase,
  manualArsipId: string,
): Promise<ManualAttachmentPhysicalDestructionRow[]> {
  return database
    .select({
      id: manualArsipAttachment.id,
      logical_path: manualArsipAttachment.logicalPath,
    })
    .from(manualArsipAttachment)
    .where(eq(manualArsipAttachment.manualArsipId, manualArsipId))
    .limit(1000) as Promise<ManualAttachmentPhysicalDestructionRow[]>
}

function normalizeSourceType(value: string | null | undefined): ArchiveSourceType | 'UNKNOWN' {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
    ? value as ArchiveSourceType
    : 'UNKNOWN'
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function createLocalPhysicalDestructionStorage(root = getLocalStorageRoot()): UnifiedArchivePhysicalDestructionStorage {
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
}): Promise<PhysicalFileDeleteOutcome> {
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

async function loadDefaultDatabase(): Promise<UnifiedArchivePhysicalDestructionDatabase> {
  const { db } = await import('#/db/client')

  return db as unknown as UnifiedArchivePhysicalDestructionDatabase
}
