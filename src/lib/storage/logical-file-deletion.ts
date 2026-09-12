// Server-only module. Do not import from client components.
//
// Helper hapus-file-fisik yang aman, diangkat dari versi paling keras yang
// sudah ada (`src/lib/archive/berkas-arsip-physical-destruction.ts` --
// `deleteLocalLogicalFile`/`inspectDeletableLocalFile`): menolak symlink,
// menahan path di luar root, dan mengategorikan hasil per item alih-alih
// menggagalkan seluruh batch. Dipakai oleh fitur Pembersihan Dokumen
// (non-material) agar tidak menambah salinan ke-4 dari logika ini.
import { lstat, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

export type LogicalFileDeletionOutcome =
  | 'deleted'
  | 'already_missing'
  | 'protected'
  | 'unsafe_skipped'
  | 'duplicate_skipped'
  | 'failed'
  // Dry-run only: file exists and would have been deleted, but wasn't.
  | 'skipped'

export type LogicalFileDeletionItemResult = {
  index: number
  outcome: LogicalFileDeletionOutcome
}

export type LogicalFileDeletionReportStatus = 'completed' | 'partial' | 'failed' | 'skipped'

export type LogicalFileDeletionReport = {
  status: LogicalFileDeletionReportStatus
  total_candidates: number
  deleted_count: number
  already_missing_count: number
  protected_count: number
  skipped_unsafe_count: number
  skipped_duplicate_count: number
  failed_count: number
  items: LogicalFileDeletionItemResult[]
}

/**
 * Menghapus sekumpulan file fisik lewat path logisnya, dengan aman.
 *
 * - `protectedLogicalPaths`: path yang TIDAK boleh dihapus (masih dirujuk
 *   baris lain) -- ditandai `protected`, bukan `deleted`/`failed`.
 * - Duplikat dideteksi dari *physical path hasil resolve* (bukan string
 *   logis mentah), meniru `prepareUniqueCandidates` di modul arsip.
 * - Tidak pernah melempar untuk kegagalan per-item; hanya untuk input yang
 *   secara struktural tidak valid (root storage tidak bisa diresolusi).
 */
export async function deleteLogicalFilesSafely(
  logicalPaths: readonly string[],
  options: {
    root?: string
    dryRun?: boolean
    protectedLogicalPaths?: ReadonlySet<string>
  } = {},
): Promise<LogicalFileDeletionReport> {
  const root = options.root ?? getLocalStorageRoot()
  const dryRun = options.dryRun ?? false
  const protectedLogicalPaths = options.protectedLogicalPaths ?? new Set<string>()

  const items: LogicalFileDeletionItemResult[] = []
  const seenPhysicalKeys = new Set<string>()

  let deletedCount = 0
  let alreadyMissingCount = 0
  let protectedCount = 0
  let skippedUnsafeCount = 0
  let skippedDuplicateCount = 0
  let failedCount = 0

  for (const [index, rawLogicalPath] of logicalPaths.entries()) {
    let logicalPath: string
    let physicalPath: string
    try {
      logicalPath = assertSafeLogicalStoragePath(rawLogicalPath)
      physicalPath = resolvePhysicalStoragePath(root, logicalPath)
    } catch {
      skippedUnsafeCount += 1
      items.push({ index, outcome: 'unsafe_skipped' })
      continue
    }

    // Diperiksa setelah normalisasi (bukan pada string mentah) agar
    // perbedaan ejaan yang setara (mis. slash) tidak diam-diam melewati
    // guard perlindungan.
    if (protectedLogicalPaths.has(logicalPath) || protectedLogicalPaths.has(rawLogicalPath)) {
      protectedCount += 1
      items.push({ index, outcome: 'protected' })
      continue
    }

    const physicalKey = physicalPath.toLowerCase()
    if (seenPhysicalKeys.has(physicalKey)) {
      skippedDuplicateCount += 1
      items.push({ index, outcome: 'duplicate_skipped' })
      continue
    }
    seenPhysicalKeys.add(physicalKey)

    const outcome = await deleteLocalLogicalFile({ root, physicalPath, dryRun })

    switch (outcome) {
      case 'deleted':
        deletedCount += 1
        break
      case 'already_missing':
        alreadyMissingCount += 1
        break
      case 'unsafe_skipped':
        skippedUnsafeCount += 1
        break
      case 'failed':
        failedCount += 1
        break
    }

    items.push({ index, outcome })
  }

  return {
    status: resolveExecutionStatus({
      attemptedCount: items.length - protectedCount,
      deletedCount,
      alreadyMissingCount,
      skippedUnsafeCount,
      failedCount,
    }),
    total_candidates: logicalPaths.length,
    deleted_count: deletedCount,
    already_missing_count: alreadyMissingCount,
    protected_count: protectedCount,
    skipped_unsafe_count: skippedUnsafeCount,
    skipped_duplicate_count: skippedDuplicateCount,
    failed_count: failedCount,
    items,
  }
}

type LocalFileDeleteOutcome = Exclude<LogicalFileDeletionOutcome, 'protected' | 'duplicate_skipped'>

async function deleteLocalLogicalFile({
  root,
  physicalPath,
  dryRun,
}: {
  root: string
  physicalPath: string
  dryRun: boolean
}): Promise<LocalFileDeleteOutcome> {
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
}): LogicalFileDeletionReportStatus {
  if (failedCount > 0) {
    return deletedCount > 0 || alreadyMissingCount > 0 || skippedUnsafeCount > 0
      ? 'partial'
      : 'failed'
  }

  if (skippedUnsafeCount > 0) return 'partial'
  if (attemptedCount === 0) return 'skipped'

  return 'completed'
}
