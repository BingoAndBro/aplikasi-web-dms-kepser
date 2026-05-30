// Server-only module. Do not import from client components.
import { lstat, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { asc, eq, inArray } from 'drizzle-orm'

import {
  berkasArsip,
  berkasArsipItem,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ARCHIVE_SOURCE_TYPE,
  BERKAS_ARCHIVE_STATUS,
  BERKAS_STATUS,
  type ArchiveSourceType,
  type BerkasArchiveStatus,
  type BerkasStatus,
} from '#/lib/constants/archive-status'
import { parseWorkflowAttachmentEntries } from '#/lib/archive/berkas-arsip-attachment-names'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

export const BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE = 'HAPUS FILE FISIK ARSIP'

export type BerkasPhysicalDestructionReportStatus =
  | 'dry_run'
  | 'completed'
  | 'partial'
  | 'skipped'
  | 'not_found'
  | 'not_destroyed'
  | 'confirmation_required'
  | 'failed'

export type BerkasPhysicalDestructionErrorCategory =
  | 'FOLDER_NOT_DIMUSNAHKAN'
  | 'UNSAFE_FILE_CANDIDATE_SKIPPED'
  | 'PHYSICAL_FILE_ALREADY_MISSING'
  | 'PHYSICAL_FILE_DELETE_FAILED'
  | 'NO_FILE_CANDIDATES'
  | 'CONFIRMATION_REQUIRED'
  | 'DUPLICATE_FILE_CANDIDATE_SKIPPED'

export type BerkasPhysicalDestructionReport = {
  status: BerkasPhysicalDestructionReportStatus
  total_items: number
  workflow_attachment_candidates: number
  manual_attachment_candidates: number
  deleted_count: number
  already_missing_count: number
  skipped_unsafe_count: number
  skipped_duplicate_count: number
  failed_count: number
  physical_deletion_performed: boolean
  errors: BerkasPhysicalDestructionErrorCategory[]
}

export type BerkasPhysicalDestructionFolderRow = {
  id: string
  status_berkas: BerkasStatus | string
  status_arsip: BerkasArchiveStatus | string | null
}

export type BerkasPhysicalDestructionItemRow = {
  id: string
  berkas_id: string
  source_type: ArchiveSourceType | string
  dokumen_id: string | null
  manual_arsip_id: string | null
}

export type BerkasPhysicalDestructionWorkflowSourceRow = {
  id: string
  lampiran_urls: unknown
}

export type BerkasPhysicalDestructionManualAttachmentRow = {
  manual_arsip_id: string
  logical_path: string
}

export type BerkasPhysicalDestructionRepository = {
  getBerkasForPhysicalDestruction(berkasId: string): Promise<BerkasPhysicalDestructionFolderRow | null>
  listBerkasItems(berkasId: string): Promise<BerkasPhysicalDestructionItemRow[]>
  listWorkflowAttachmentSources(dokumenIds: string[]): Promise<BerkasPhysicalDestructionWorkflowSourceRow[]>
  listManualAttachmentSources(manualArsipIds: string[]): Promise<BerkasPhysicalDestructionManualAttachmentRow[]>
}

export type BerkasPhysicalFileDeleteOutcome =
  | 'deleted'
  | 'already_missing'
  | 'skipped'
  | 'unsafe_skipped'
  | 'failed'

export type BerkasPhysicalDestructionStorage = {
  resolveCandidateKey(logicalPath: string): Promise<string | null> | string | null
  deleteLogicalFile(input: {
    logicalPath: string
    dryRun: boolean
  }): Promise<BerkasPhysicalFileDeleteOutcome>
}

export type AnalyzeBerkasPhysicalFileDestructionInput = {
  berkasId: string
  repository?: BerkasPhysicalDestructionRepository
  storage?: BerkasPhysicalDestructionStorage
}

export type ExecuteBerkasPhysicalFileDestructionInput =
  AnalyzeBerkasPhysicalFileDestructionInput & {
    confirmation?: string
  }

type CandidateSource = 'WORKFLOW' | 'MANUAL'

type Candidate = {
  source: CandidateSource
  logicalPath: string
}

type CandidateCollection = {
  candidates: Candidate[]
  totalItems: number
  workflowAttachmentCandidates: number
  manualAttachmentCandidates: number
  skippedUnsafeCount: number
  errors: Set<BerkasPhysicalDestructionErrorCategory>
}

type CandidatePreparation = {
  candidates: Candidate[]
  skippedUnsafeCount: number
  skippedDuplicateCount: number
  errors: Set<BerkasPhysicalDestructionErrorCategory>
}

export async function analyzeBerkasPhysicalFileDestruction(
  input: AnalyzeBerkasPhysicalFileDestructionInput,
): Promise<BerkasPhysicalDestructionReport> {
  return runBerkasPhysicalFileDestruction({
    ...input,
    dryRun: true,
  })
}

export async function executeBerkasPhysicalFileDestruction(
  input: ExecuteBerkasPhysicalFileDestructionInput,
): Promise<BerkasPhysicalDestructionReport> {
  if (input.confirmation !== BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE) {
    return emptyReport({
      status: 'confirmation_required',
      errors: ['CONFIRMATION_REQUIRED'],
    })
  }

  return runBerkasPhysicalFileDestruction({
    ...input,
    dryRun: false,
  })
}

export function createLocalBerkasPhysicalDestructionStorage(
  root = getLocalStorageRoot(),
): BerkasPhysicalDestructionStorage {
  return {
    resolveCandidateKey(logicalPath) {
      try {
        return resolvePhysicalStoragePath(root, logicalPath)
      } catch {
        return null
      }
    },
    async deleteLogicalFile({ logicalPath, dryRun }) {
      return deleteLocalLogicalFile({ root, logicalPath, dryRun })
    },
  }
}

async function runBerkasPhysicalFileDestruction({
  berkasId,
  repository = defaultBerkasPhysicalDestructionRepository,
  storage = createLocalBerkasPhysicalDestructionStorage(),
  dryRun,
}: AnalyzeBerkasPhysicalFileDestructionInput & {
  dryRun: boolean
}): Promise<BerkasPhysicalDestructionReport> {
  const folder = await repository.getBerkasForPhysicalDestruction(berkasId)
  if (!folder) return emptyReport({ status: 'not_found' })

  if (
    folder.status_berkas !== BERKAS_STATUS.CLOSED
    || folder.status_arsip !== BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN
  ) {
    return emptyReport({
      status: 'not_destroyed',
      errors: ['FOLDER_NOT_DIMUSNAHKAN'],
    })
  }

  const collection = await collectFolderCandidates({ berkasId, repository })
  const prepared = await prepareUniqueCandidates(collection.candidates, storage)
  const errors = new Set<BerkasPhysicalDestructionErrorCategory>([
    ...collection.errors,
    ...prepared.errors,
  ])
  let deletedCount = 0
  let alreadyMissingCount = 0
  let failedCount = 0
  let skippedUnsafeCount = collection.skippedUnsafeCount + prepared.skippedUnsafeCount

  for (const candidate of prepared.candidates) {
    let outcome: BerkasPhysicalFileDeleteOutcome
    try {
      outcome = await storage.deleteLogicalFile({
        logicalPath: candidate.logicalPath,
        dryRun,
      })
    } catch {
      outcome = 'failed'
    }

    if (outcome === 'deleted') {
      deletedCount += 1
    } else if (outcome === 'already_missing') {
      alreadyMissingCount += 1
      errors.add('PHYSICAL_FILE_ALREADY_MISSING')
    } else if (outcome === 'unsafe_skipped') {
      skippedUnsafeCount += 1
      errors.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
    } else if (outcome === 'failed') {
      failedCount += 1
      errors.add('PHYSICAL_FILE_DELETE_FAILED')
    }
  }

  if (collection.candidates.length === 0 && skippedUnsafeCount === 0) {
    errors.add('NO_FILE_CANDIDATES')
  }

  const skippedDuplicateCount = prepared.skippedDuplicateCount
  if (skippedDuplicateCount > 0) errors.add('DUPLICATE_FILE_CANDIDATE_SKIPPED')

  return {
    status: dryRun
      ? 'dry_run'
      : resolveExecutionStatus({
        attemptedCount: prepared.candidates.length,
        deletedCount,
        alreadyMissingCount,
        skippedUnsafeCount,
        failedCount,
      }),
    total_items: collection.totalItems,
    workflow_attachment_candidates: collection.workflowAttachmentCandidates,
    manual_attachment_candidates: collection.manualAttachmentCandidates,
    deleted_count: deletedCount,
    already_missing_count: alreadyMissingCount,
    skipped_unsafe_count: skippedUnsafeCount,
    skipped_duplicate_count: skippedDuplicateCount,
    failed_count: failedCount,
    physical_deletion_performed: !dryRun && deletedCount > 0,
    errors: [...errors].sort(),
  }
}

async function collectFolderCandidates({
  berkasId,
  repository,
}: {
  berkasId: string
  repository: BerkasPhysicalDestructionRepository
}): Promise<CandidateCollection> {
  const items = await repository.listBerkasItems(berkasId)
  const workflowIds = unique(
    items
      .filter((item) => item.source_type === ARCHIVE_SOURCE_TYPE.WORKFLOW)
      .map((item) => trimToNull(item.dokumen_id))
      .filter((id): id is string => Boolean(id)),
  )
  const manualArsipIds = unique(
    items
      .filter((item) => item.source_type === ARCHIVE_SOURCE_TYPE.MANUAL)
      .map((item) => trimToNull(item.manual_arsip_id))
      .filter((id): id is string => Boolean(id)),
  )
  const [workflowSources, manualAttachments] = await Promise.all([
    repository.listWorkflowAttachmentSources(workflowIds),
    repository.listManualAttachmentSources(manualArsipIds),
  ])
  const workflowCandidates = collectWorkflowCandidates(workflowSources)
  const manualCandidates = collectManualCandidates(manualAttachments)
  const errors = new Set<BerkasPhysicalDestructionErrorCategory>([
    ...workflowCandidates.errors,
    ...manualCandidates.errors,
  ])

  return {
    candidates: [...workflowCandidates.candidates, ...manualCandidates.candidates],
    totalItems: items.length,
    workflowAttachmentCandidates: workflowCandidates.rawCandidateCount,
    manualAttachmentCandidates: manualCandidates.rawCandidateCount,
    skippedUnsafeCount: workflowCandidates.skippedUnsafeCount + manualCandidates.skippedUnsafeCount,
    errors,
  }
}

function collectWorkflowCandidates(
  sources: BerkasPhysicalDestructionWorkflowSourceRow[],
): {
  candidates: Candidate[]
  rawCandidateCount: number
  skippedUnsafeCount: number
  errors: Set<BerkasPhysicalDestructionErrorCategory>
} {
  const candidates: Candidate[] = []
  let rawCandidateCount = 0
  let skippedUnsafeCount = 0
  const errors = new Set<BerkasPhysicalDestructionErrorCategory>()

  for (const source of sources) {
    for (const entry of parseWorkflowAttachmentEntries(source.lampiran_urls)) {
      rawCandidateCount += 1
      const rawPath = isRecord(entry) ? entry.url : null
      const logicalPath = typeof rawPath === 'string'
        ? normalizeCandidateLogicalPath(rawPath)
        : null

      if (!logicalPath) {
        skippedUnsafeCount += 1
        errors.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
        continue
      }

      candidates.push({ source: 'WORKFLOW', logicalPath })
    }
  }

  return {
    candidates,
    rawCandidateCount,
    skippedUnsafeCount,
    errors,
  }
}

function collectManualCandidates(
  attachments: BerkasPhysicalDestructionManualAttachmentRow[],
): {
  candidates: Candidate[]
  rawCandidateCount: number
  skippedUnsafeCount: number
  errors: Set<BerkasPhysicalDestructionErrorCategory>
} {
  const candidates: Candidate[] = []
  let skippedUnsafeCount = 0
  const errors = new Set<BerkasPhysicalDestructionErrorCategory>()

  for (const attachment of attachments) {
    const logicalPath = normalizeCandidateLogicalPath(attachment.logical_path)
    if (!logicalPath) {
      skippedUnsafeCount += 1
      errors.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
      continue
    }

    candidates.push({ source: 'MANUAL', logicalPath })
  }

  return {
    candidates,
    rawCandidateCount: attachments.length,
    skippedUnsafeCount,
    errors,
  }
}

async function prepareUniqueCandidates(
  candidates: Candidate[],
  storage: BerkasPhysicalDestructionStorage,
): Promise<CandidatePreparation> {
  const uniqueCandidates: Candidate[] = []
  const seenKeys = new Set<string>()
  let skippedUnsafeCount = 0
  let skippedDuplicateCount = 0
  const errors = new Set<BerkasPhysicalDestructionErrorCategory>()

  for (const candidate of candidates) {
    let key: string | null
    try {
      key = await storage.resolveCandidateKey(candidate.logicalPath)
    } catch {
      key = null
    }

    if (!key) {
      skippedUnsafeCount += 1
      errors.add('UNSAFE_FILE_CANDIDATE_SKIPPED')
      continue
    }

    if (seenKeys.has(key)) {
      skippedDuplicateCount += 1
      continue
    }

    seenKeys.add(key)
    uniqueCandidates.push(candidate)
  }

  return {
    candidates: uniqueCandidates,
    skippedUnsafeCount,
    skippedDuplicateCount,
    errors,
  }
}

function resolveExecutionStatus({
  attemptedCount,
  deletedCount,
  alreadyMissingCount,
  skippedUnsafeCount,
  failedCount,
}: {
  attemptedCount: number
  deletedCount: number
  alreadyMissingCount: number
  skippedUnsafeCount: number
  failedCount: number
}): BerkasPhysicalDestructionReportStatus {
  if (failedCount > 0) {
    return deletedCount > 0 || alreadyMissingCount > 0 || skippedUnsafeCount > 0
      ? 'partial'
      : 'failed'
  }

  if (skippedUnsafeCount > 0) return 'partial'
  if (attemptedCount === 0) return 'skipped'

  return 'completed'
}

function emptyReport({
  status,
  errors = [],
}: {
  status: BerkasPhysicalDestructionReportStatus
  errors?: BerkasPhysicalDestructionErrorCategory[]
}): BerkasPhysicalDestructionReport {
  return {
    status,
    total_items: 0,
    workflow_attachment_candidates: 0,
    manual_attachment_candidates: 0,
    deleted_count: 0,
    already_missing_count: 0,
    skipped_unsafe_count: 0,
    skipped_duplicate_count: 0,
    failed_count: 0,
    physical_deletion_performed: false,
    errors: [...errors].sort(),
  }
}

function normalizeCandidateLogicalPath(value: string): string | null {
  try {
    return assertSafeLogicalStoragePath(value)
  } catch {
    return null
  }
}

async function deleteLocalLogicalFile({
  root,
  logicalPath,
  dryRun,
}: {
  root: string
  logicalPath: string
  dryRun: boolean
}): Promise<BerkasPhysicalFileDeleteOutcome> {
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

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const defaultBerkasPhysicalDestructionRepository: BerkasPhysicalDestructionRepository = {
  async getBerkasForPhysicalDestruction(berkasId) {
    const database = await getDatabase()
    const rows = await database
      .select({
        id: berkasArsip.id,
        status_berkas: berkasArsip.statusBerkas,
        status_arsip: berkasArsip.statusArsip,
      })
      .from(berkasArsip)
      .where(eq(berkasArsip.id, berkasId))
      .limit(1) as BerkasPhysicalDestructionFolderRow[]

    return rows[0] ?? null
  },

  async listBerkasItems(berkasId) {
    const database = await getDatabase()
    return database
      .select({
        id: berkasArsipItem.id,
        berkas_id: berkasArsipItem.berkasId,
        source_type: berkasArsipItem.sourceType,
        dokumen_id: berkasArsipItem.dokumenId,
        manual_arsip_id: berkasArsipItem.manualArsipId,
      })
      .from(berkasArsipItem)
      .where(eq(berkasArsipItem.berkasId, berkasId))
      .orderBy(asc(berkasArsipItem.addedAt), asc(berkasArsipItem.id)) as Promise<BerkasPhysicalDestructionItemRow[]>
  },

  async listWorkflowAttachmentSources(dokumenIds) {
    const uniqueIds = unique(dokumenIds)
    if (uniqueIds.length === 0) return []

    const database = await getDatabase()
    return database
      .select({
        id: dokumenTransaksi.id,
        lampiran_urls: dokumenTransaksi.lampiranUrls,
      })
      .from(dokumenTransaksi)
      .where(inArray(dokumenTransaksi.id, uniqueIds)) as Promise<BerkasPhysicalDestructionWorkflowSourceRow[]>
  },

  async listManualAttachmentSources(manualArsipIds) {
    const uniqueIds = unique(manualArsipIds)
    if (uniqueIds.length === 0) return []

    const database = await getDatabase()
    return database
      .select({
        manual_arsip_id: manualArsipAttachment.manualArsipId,
        logical_path: manualArsipAttachment.logicalPath,
      })
      .from(manualArsipAttachment)
      .where(inArray(manualArsipAttachment.manualArsipId, uniqueIds))
      .orderBy(
        manualArsipAttachment.manualArsipId,
        asc(manualArsipAttachment.createdAt),
        asc(manualArsipAttachment.id),
      ) as Promise<BerkasPhysicalDestructionManualAttachmentRow[]>
  },
}

async function getDatabase() {
  const client = await import('#/db/client')
  return client.db
}
