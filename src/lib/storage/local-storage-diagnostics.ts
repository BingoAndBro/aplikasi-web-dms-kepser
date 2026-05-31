// Server-only local storage diagnostics for the Phase 9G admin routes.
import { lstat, readdir, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { Dirent } from 'node:fs'

import {
  assertSafeLogicalStoragePath,
  classifyStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
  type StoragePathClassification,
} from '#/lib/storage/local-storage-paths'

export const DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES = 1440

type AttachmentReference = {
  url?: unknown
}

export type StorageDocumentMetadataRow = {
  id: string
  lampiranUrls: unknown
}

export type StorageManualAttachmentMetadataRow = {
  id: string
  logicalPath: unknown
}

export type LocalStorageFolderDetails = {
  total_files: number
  orphan_files: string[]
  orphan_count: number
  referenced_files: string[]
  referenced_count: number
  pending_files: string[]
  pending_count: number
  unsupported_files: string[]
  unsupported_count: number
  unsafe_files: string[]
  unsafe_count: number
}

export type LocalPendingStoragePathDetails = {
  path: string
  classification: Extract<StoragePathClassification, 'pending-dash' | 'pending-upload-api'>
  age_minutes: number | null
  last_modified_at: string | null
  eligible_for_cleanup_default: boolean
}

export type LocalStorageAnalysis = {
  summary: {
    total_folders: number
    total_storage_files: number
    total_orphan_files: number
    total_referenced_files: number
    total_pending_files: number
    total_unsupported_files: number
    total_unsafe_files: number
    total_missing_referenced_files: number
    total_legacy_unsupported_metadata_references: number
    total_eligible_pending_files_for_default_cleanup: number
    total_recent_pending_files_for_default_cleanup: number
  }
  folder_details: Record<string, LocalStorageFolderDetails>
  orphan_paths: string[]
  referenced_paths_count: number
  referenced_paths: string[]
  missing_referenced_paths: string[]
  pending_paths: string[]
  pending_path_details: LocalPendingStoragePathDetails[]
  eligible_pending_paths: string[]
  recent_pending_paths: string[]
  unsupported_paths: string[]
  unsafe_paths: string[]
  metadata_issues: Array<{
    source: 'dokumen_transaksi.lampiran_urls' | 'manual_arsip_attachment.logical_path'
    sourceId: string
    index: number
    code: 'invalid-local-path' | 'legacy-or-url-reference' | 'non-string-url'
  }>
}

export type SafeLocalStorageAnalysisResponse = {
  summary: LocalStorageAnalysis['summary']
  referenced_paths_count: number
  orphan_count: number
  pending_count: number
  eligible_pending_count: number
  recent_pending_count: number
  unsupported_count: number
  unsafe_count: number
  missing_referenced_count: number
  metadata_issue_counts: Array<{
    source: LocalStorageAnalysis['metadata_issues'][number]['source']
    code: LocalStorageAnalysis['metadata_issues'][number]['code']
    count: number
  }>
}

export type LocalOrphanCleanupResult = {
  deletedCount: number
  missingCount: number
  failedCount: number
  failures: Array<{
    path: string
    code:
      | 'invalid-local-path'
      | 'not-a-file'
      | 'path-outside-root'
      | 'delete-failed'
      | 'unsupported-path'
  }>
}

type ScannedStoragePath = {
  logicalPath: string
  classification: StoragePathClassification
  modifiedAtMs: number
}

type UnsafeStoragePath = {
  logicalPath: string
  code: 'invalid-local-path' | 'not-a-file' | 'path-outside-root' | 'unreadable'
}

export async function analyzeLocalStorageReferences({
  documents,
  manualAttachments,
}: {
  documents: StorageDocumentMetadataRow[]
  manualAttachments: StorageManualAttachmentMetadataRow[]
}): Promise<LocalStorageAnalysis> {
  const metadata = collectReferencedPaths({ documents, manualAttachments })
  const scanned = await scanLocalStorage()
  const localPathSet = new Set(scanned.files.map(file => file.logicalPath))
  const folderDetails: Record<string, LocalStorageFolderDetails> = {}

  const orphanPaths: string[] = []
  const referencedPaths: string[] = []
  const pendingPaths: string[] = []
  const pendingPathDetails: LocalPendingStoragePathDetails[] = []
  const unsupportedPaths: string[] = []
  const unsafePaths = scanned.unsafe.map(file => file.logicalPath)

  for (const file of scanned.files) {
    const folder = getLogicalFolder(file.logicalPath)
    const folderFile = getFolderRelativePath(file.logicalPath)
    const details = getOrCreateFolderDetails(folderDetails, folder)
    details.total_files += 1

    if (metadata.referencedPaths.has(file.logicalPath)) {
      details.referenced_files.push(folderFile)
      details.referenced_count += 1
      referencedPaths.push(file.logicalPath)
      continue
    }

    if (
      file.classification === 'pending-dash'
      || file.classification === 'pending-upload-api'
    ) {
      const pendingDetail = createPendingPathDetails(file)
      details.pending_files.push(folderFile)
      details.pending_count += 1
      pendingPaths.push(file.logicalPath)
      pendingPathDetails.push(pendingDetail)
      continue
    }

    if (file.classification !== 'formal') {
      details.unsupported_files.push(folderFile)
      details.unsupported_count += 1
      unsupportedPaths.push(file.logicalPath)
      continue
    }

    details.orphan_files.push(folderFile)
    details.orphan_count += 1
    orphanPaths.push(file.logicalPath)
  }

  for (const unsafe of scanned.unsafe) {
    const folder = getLogicalFolder(unsafe.logicalPath)
    const folderFile = getFolderRelativePath(unsafe.logicalPath)
    const details = getOrCreateFolderDetails(folderDetails, folder)
    details.unsafe_files.push(folderFile)
    details.unsafe_count += 1
  }

  const missingReferencedPaths = [...metadata.referencedPaths]
    .filter(referencedPath => !localPathSet.has(referencedPath))
    .sort()
  const sortedPendingPathDetails = pendingPathDetails.sort((left, right) => left.path.localeCompare(right.path))
  const eligiblePendingPaths = sortedPendingPathDetails
    .filter(detail => detail.eligible_for_cleanup_default)
    .map(detail => detail.path)
  const recentPendingPaths = sortedPendingPathDetails
    .filter(detail => !detail.eligible_for_cleanup_default)
    .map(detail => detail.path)

  return {
    summary: {
      total_folders: Object.keys(folderDetails).length,
      total_storage_files: scanned.files.length,
      total_orphan_files: orphanPaths.length,
      total_referenced_files: referencedPaths.length,
      total_pending_files: pendingPaths.length,
      total_unsupported_files: unsupportedPaths.length,
      total_unsafe_files: unsafePaths.length,
      total_missing_referenced_files: missingReferencedPaths.length,
      total_legacy_unsupported_metadata_references: metadata.issues.length,
      total_eligible_pending_files_for_default_cleanup: eligiblePendingPaths.length,
      total_recent_pending_files_for_default_cleanup: recentPendingPaths.length,
    },
    folder_details: sortFolderDetails(folderDetails),
    orphan_paths: orphanPaths.sort(),
    referenced_paths_count: metadata.referencedPaths.size,
    referenced_paths: referencedPaths.sort(),
    missing_referenced_paths: missingReferencedPaths,
    pending_paths: pendingPaths.sort(),
    pending_path_details: sortedPendingPathDetails,
    eligible_pending_paths: eligiblePendingPaths,
    recent_pending_paths: recentPendingPaths,
    unsupported_paths: unsupportedPaths.sort(),
    unsafe_paths: unsafePaths.sort(),
    metadata_issues: metadata.issues,
  }
}

export function toSafeLocalStorageAnalysisResponse(
  analysis: LocalStorageAnalysis,
): SafeLocalStorageAnalysisResponse {
  return {
    summary: analysis.summary,
    referenced_paths_count: analysis.referenced_paths_count,
    orphan_count: analysis.orphan_paths.length,
    pending_count: analysis.pending_paths.length,
    eligible_pending_count: analysis.eligible_pending_paths.length,
    recent_pending_count: analysis.recent_pending_paths.length,
    unsupported_count: analysis.unsupported_paths.length,
    unsafe_count: analysis.unsafe_paths.length,
    missing_referenced_count: analysis.missing_referenced_paths.length,
    metadata_issue_counts: summarizeMetadataIssueCounts(analysis.metadata_issues),
  }
}

export function getEligiblePendingCleanupPaths(
  pendingPathDetails: LocalPendingStoragePathDetails[],
  minAgeMinutes: number,
): string[] {
  const safeMinAgeMinutes = Math.max(0, Math.floor(minAgeMinutes))

  return pendingPathDetails
    .filter((detail) => {
      if (detail.age_minutes === null) return false
      return detail.age_minutes >= safeMinAgeMinutes
    })
    .map(detail => detail.path)
    .sort()
}

export async function deleteLocalOrphanCandidates(
  logicalPaths: string[],
  options: {
    allowedClassifications?: StoragePathClassification[]
  } = {},
): Promise<LocalOrphanCleanupResult> {
  let deletedCount = 0
  let missingCount = 0
  const failures: LocalOrphanCleanupResult['failures'] = []
  const storageRoot = getLocalStorageRoot()
  const allowedClassifications = new Set(options.allowedClassifications ?? ['formal'])

  for (const logicalPath of logicalPaths) {
    let safeLogicalPath: string
    let physicalPath: string

    try {
      safeLogicalPath = assertSafeLogicalStoragePath(logicalPath)
      physicalPath = resolvePhysicalStoragePath(storageRoot, safeLogicalPath)
    } catch {
      failures.push({ path: safeLogicalPathForResponse(logicalPath), code: 'invalid-local-path' })
      continue
    }

    if (!allowedClassifications.has(classifyStoragePath(safeLogicalPath))) {
      failures.push({ path: safeLogicalPath, code: 'unsupported-path' })
      continue
    }

    const inspection = await inspectDeletableLocalFile(storageRoot, physicalPath)
    if (inspection === 'missing') {
      missingCount += 1
      continue
    }

    if (inspection !== 'ok') {
      failures.push({ path: safeLogicalPath, code: inspection })
      continue
    }

    try {
      await unlink(physicalPath)
      deletedCount += 1
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT')) {
        missingCount += 1
        continue
      }

      failures.push({ path: safeLogicalPath, code: 'delete-failed' })
    }
  }

  return {
    deletedCount,
    missingCount,
    failedCount: failures.length,
    failures,
  }
}

function collectReferencedPaths({
  documents,
  manualAttachments,
}: {
  documents: StorageDocumentMetadataRow[]
  manualAttachments: StorageManualAttachmentMetadataRow[]
}): {
  referencedPaths: Set<string>
  issues: LocalStorageAnalysis['metadata_issues']
} {
  const referencedPaths = new Set<string>()
  const issues: LocalStorageAnalysis['metadata_issues'] = []

  for (const doc of documents) {
    collectAttachmentReferences({
      value: doc.lampiranUrls,
      source: 'dokumen_transaksi.lampiran_urls',
      sourceId: doc.id,
      referencedPaths,
      issues,
    })
  }

  for (const attachment of manualAttachments) {
    collectSingleLogicalPathReference({
      value: attachment.logicalPath,
      source: 'manual_arsip_attachment.logical_path',
      sourceId: attachment.id,
      referencedPaths,
      issues,
    })
  }

  return { referencedPaths, issues }
}

function collectAttachmentReferences({
  value,
  source,
  sourceId,
  referencedPaths,
  issues,
}: {
  value: unknown
  source: 'dokumen_transaksi.lampiran_urls'
  sourceId: string
  referencedPaths: Set<string>
  issues: LocalStorageAnalysis['metadata_issues']
}): void {
  const attachments = parseAttachmentArray(value)

  for (const [index, attachment] of attachments.entries()) {
    const rawPath = attachment.url
    if (!rawPath) continue

    if (typeof rawPath !== 'string') {
      issues.push({ source, sourceId, index, code: 'non-string-url' })
      continue
    }

    if (isUrlLikeStoragePath(rawPath)) {
      issues.push({ source, sourceId, index, code: 'legacy-or-url-reference' })
      continue
    }

    try {
      referencedPaths.add(assertSafeLogicalStoragePath(rawPath))
    } catch {
      issues.push({ source, sourceId, index, code: 'invalid-local-path' })
    }
  }
}

function parseAttachmentArray(value: unknown): AttachmentReference[] {
  if (!value) return []
  if (Array.isArray(value)) return value as AttachmentReference[]
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as AttachmentReference[] : []
  } catch {
    return []
  }
}

async function scanLocalStorage(): Promise<{
  files: ScannedStoragePath[]
  unsafe: UnsafeStoragePath[]
}> {
  const storageRoot = getLocalStorageRoot()
  const files: ScannedStoragePath[] = []
  const unsafe: UnsafeStoragePath[] = []

  try {
    await realpath(storageRoot)
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) {
      return { files, unsafe }
    }

    unsafe.push({ logicalPath: '.', code: 'unreadable' })
    return { files, unsafe }
  }

  await scanDirectory({ storageRoot, relativeSegments: [], files, unsafe })

  return { files, unsafe }
}

async function scanDirectory({
  storageRoot,
  relativeSegments,
  files,
  unsafe,
}: {
  storageRoot: string
  relativeSegments: string[]
  files: ScannedStoragePath[]
  unsafe: UnsafeStoragePath[]
}): Promise<void> {
  const logicalDirectory = relativeSegments.join('/')
  let physicalDirectory: string

  try {
    physicalDirectory = logicalDirectory
      ? resolvePhysicalStoragePath(storageRoot, logicalDirectory)
      : storageRoot
  } catch {
    unsafe.push({ logicalPath: logicalDirectory || '.', code: 'invalid-local-path' })
    return
  }

  let entries: Dirent[]
  try {
    entries = await readdir(physicalDirectory, { withFileTypes: true })
  } catch {
    unsafe.push({ logicalPath: logicalDirectory || '.', code: 'unreadable' })
    return
  }

  for (const entry of entries) {
    const logicalPath = [...relativeSegments, entry.name].join('/')

    let safeLogicalPath: string
    try {
      safeLogicalPath = assertSafeLogicalStoragePath(logicalPath)
    } catch {
      unsafe.push({ logicalPath: safeLogicalPathForResponse(logicalPath), code: 'invalid-local-path' })
      continue
    }

    if (entry.isDirectory()) {
      await scanDirectory({
        storageRoot,
        relativeSegments: [...relativeSegments, entry.name],
        files,
        unsafe,
      })
      continue
    }

    if (!entry.isFile()) {
      unsafe.push({ logicalPath: safeLogicalPath, code: 'not-a-file' })
      continue
    }

    const physicalPath = resolvePhysicalStoragePath(storageRoot, safeLogicalPath)
    const inspection = await inspectDeletableLocalFile(storageRoot, physicalPath)
    if (inspection !== 'ok') {
      unsafe.push({
        logicalPath: safeLogicalPath,
        code: inspection === 'missing' ? 'unreadable' : inspection,
      })
      continue
    }

    const stats = await lstat(physicalPath)
    files.push({
      logicalPath: safeLogicalPath,
      classification: classifyStoragePath(safeLogicalPath),
      modifiedAtMs: stats.mtimeMs,
    })
  }
}

function collectSingleLogicalPathReference({
  value,
  source,
  sourceId,
  referencedPaths,
  issues,
}: {
  value: unknown
  source: 'manual_arsip_attachment.logical_path'
  sourceId: string
  referencedPaths: Set<string>
  issues: LocalStorageAnalysis['metadata_issues']
}): void {
  if (!value) return

  if (typeof value !== 'string') {
    issues.push({ source, sourceId, index: 0, code: 'non-string-url' })
    return
  }

  if (isUrlLikeStoragePath(value)) {
    issues.push({ source, sourceId, index: 0, code: 'legacy-or-url-reference' })
    return
  }

  try {
    referencedPaths.add(assertSafeLogicalStoragePath(value))
  } catch {
    issues.push({ source, sourceId, index: 0, code: 'invalid-local-path' })
  }
}

function summarizeMetadataIssueCounts(
  issues: LocalStorageAnalysis['metadata_issues'],
): SafeLocalStorageAnalysisResponse['metadata_issue_counts'] {
  const counts = new Map<string, {
    source: LocalStorageAnalysis['metadata_issues'][number]['source']
    code: LocalStorageAnalysis['metadata_issues'][number]['code']
    count: number
  }>()

  for (const issue of issues) {
    const key = `${issue.source}:${issue.code}`
    const current = counts.get(key)
    if (current) {
      current.count += 1
    } else {
      counts.set(key, {
        source: issue.source,
        code: issue.code,
        count: 1,
      })
    }
  }

  return [...counts.values()].sort((left, right) => {
    const sourceComparison = left.source.localeCompare(right.source)
    return sourceComparison || left.code.localeCompare(right.code)
  })
}

async function inspectDeletableLocalFile(
  storageRoot: string,
  physicalPath: string,
): Promise<'ok' | 'missing' | 'not-a-file' | 'path-outside-root'> {
  try {
    const stats = await lstat(physicalPath)
    if (!stats.isFile()) return 'not-a-file'

    const [resolvedRoot, resolvedFile] = await Promise.all([
      realpath(storageRoot),
      realpath(physicalPath),
    ])

    return isPhysicalPathInsideRoot(resolvedRoot, resolvedFile)
      ? 'ok'
      : 'path-outside-root'
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) return 'missing'
    return 'not-a-file'
  }
}

function getLogicalFolder(logicalPath: string): string {
  return logicalPath.split('/')[0] || '__root__'
}

function getFolderRelativePath(logicalPath: string): string {
  const segments = logicalPath.split('/')
  return segments.length > 1 ? segments.slice(1).join('/') : logicalPath
}

function getOrCreateFolderDetails(
  folderDetails: Record<string, LocalStorageFolderDetails>,
  folder: string,
): LocalStorageFolderDetails {
  folderDetails[folder] ??= {
    total_files: 0,
    orphan_files: [],
    orphan_count: 0,
    referenced_files: [],
    referenced_count: 0,
    pending_files: [],
    pending_count: 0,
    unsupported_files: [],
    unsupported_count: 0,
    unsafe_files: [],
    unsafe_count: 0,
  }

  return folderDetails[folder]
}

function sortFolderDetails(
  folderDetails: Record<string, LocalStorageFolderDetails>,
): Record<string, LocalStorageFolderDetails> {
  return Object.fromEntries(
    Object.entries(folderDetails)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([folder, details]) => [
        folder,
        {
          ...details,
          orphan_files: details.orphan_files.sort(),
          referenced_files: details.referenced_files.sort(),
          pending_files: details.pending_files.sort(),
          unsupported_files: details.unsupported_files.sort(),
          unsafe_files: details.unsafe_files.sort(),
        },
      ]),
  )
}

function createPendingPathDetails(file: ScannedStoragePath): LocalPendingStoragePathDetails {
  const ageMinutes = Number.isFinite(file.modifiedAtMs)
    ? Math.max(0, Math.floor((Date.now() - file.modifiedAtMs) / 60000))
    : null

  return {
    path: file.logicalPath,
    classification: file.classification === 'pending-dash' ? 'pending-dash' : 'pending-upload-api',
    age_minutes: ageMinutes,
    last_modified_at: Number.isFinite(file.modifiedAtMs)
      ? new Date(file.modifiedAtMs).toISOString()
      : null,
    eligible_for_cleanup_default: ageMinutes !== null
      && ageMinutes >= DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES,
  }
}

function safeLogicalPathForResponse(value: string): string {
  try {
    return assertSafeLogicalStoragePath(value)
  } catch {
    return '[unsafe-path]'
  }
}

function isPhysicalPathInsideRoot(storageRoot: string, physicalPath: string): boolean {
  const relativePath = path.relative(storageRoot, physicalPath)

  return relativePath !== ''
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath)
}

function isUrlLikeStoragePath(storagePath: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(storagePath.trim())
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}
