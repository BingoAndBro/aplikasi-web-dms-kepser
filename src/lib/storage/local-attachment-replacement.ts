// Server-only module. Do not import from client components.
import { constants as fsConstants } from 'node:fs'
import { copyFile, lstat, mkdir, realpath, rm, stat, unlink } from 'node:fs/promises'
import path from 'node:path'

import type { LampiranUrl } from '#/lib/dokumen/types'
import { createSubmitDiskPreflightChecker } from '#/lib/dokumen/submit-disk-preflight-checker'
import {
  assertSafeLogicalStoragePath,
  classifyStoragePath,
  getLocalStorageRoot,
  getLogicalPathOwnerId,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'
import {
  generateLocalFormalTargetLogicalPath,
  LocalPendingMoveError,
  moveLocalPendingFileToFormal,
} from '#/lib/storage/local-pending-move'

export type LocalAttachmentReplacementIssueCode =
  | 'invalid-source-path'
  | 'missing-source'
  | 'move-failed'
  | 'move-result-mismatch'
  | 'owner-mismatch'
  | 'rollback-failed'
  | 'target-exists'
  | 'unsupported-source-path'

export type LocalAttachmentReplacementIssue = {
  code: LocalAttachmentReplacementIssueCode
  index: number
  sourceLogicalPath: string | null
  targetLogicalPath: string | null
}

export type LocalAttachmentMoveOperation = {
  index: number
  sourceLogicalPath: string
  targetLogicalPath: string
  targetUuid: string
}

export type LocalAttachmentMovedFile = {
  index: number
  sourceLogicalPath: string
  targetLogicalPath: string
}

export type LocalAttachmentReplacementPlan =
  | {
    ok: true
    plannedAttachments: LampiranUrl[]
    operations: LocalAttachmentMoveOperation[]
  }
  | {
    ok: false
    issues: LocalAttachmentReplacementIssue[]
  }

export type LocalAttachmentMovementResult =
  | {
    ok: true
    moved: LocalAttachmentMovedFile[]
  }
  | {
    ok: false
    moved: LocalAttachmentMovedFile[]
    rollbackAttempted: boolean
    rollbackOk: boolean
    issue: LocalAttachmentReplacementIssue
  }

export type LocalReplacedAttachmentCleanupIssueCode =
  | 'delete-failed'
  | 'invalid-local-path'
  | 'not-a-file'
  | 'path-outside-root'

export type LocalReplacedAttachmentCleanupResult = {
  deletedCount: number
  missingCount: number
  skippedCount: number
  protectedCount: number
  failedCount: number
  failures: Array<{
    index: number
    code: LocalReplacedAttachmentCleanupIssueCode
  }>
}

type ExistingAttachmentKey = `${string}\n${string}`

export async function prepareLocalAttachmentReplacement({
  ownerUserId,
  dokumenId,
  nextAttachments,
  existingAttachments,
}: {
  ownerUserId: string
  dokumenId: string
  nextAttachments: LampiranUrl[]
  existingAttachments: LampiranUrl[]
}): Promise<LocalAttachmentReplacementPlan> {
  const existingKeys = new Set<ExistingAttachmentKey>(
    existingAttachments.map(lampiran => attachmentKey(lampiran)),
  )
  const plannedAttachments: LampiranUrl[] = []
  const operations: LocalAttachmentMoveOperation[] = []
  const issues: LocalAttachmentReplacementIssue[] = []

  for (const [index, attachment] of nextAttachments.entries()) {
    let sourceLogicalPath: string
    try {
      sourceLogicalPath = assertSafeLogicalStoragePath(attachment.url)
    } catch {
      issues.push(createIssue({ code: 'invalid-source-path', index }))
      continue
    }

    const classification = classifyStoragePath(sourceLogicalPath)

    // Existing metadata may belong to the original document submitter. Keep it
    // metadata-only when unchanged; only new/move-required paths are owner-bound.
    if (
      (classification === 'formal' || classification === 'other')
      && existingKeys.has(attachmentKey({ ...attachment, url: sourceLogicalPath }))
    ) {
      plannedAttachments.push({ ...attachment, url: sourceLogicalPath })
      continue
    }

    let ownerId: string | null
    try {
      ownerId = getLogicalPathOwnerId(sourceLogicalPath)
    } catch {
      issues.push(createIssue({ code: 'invalid-source-path', index }))
      continue
    }

    if (ownerId !== ownerUserId) {
      issues.push(createIssue({
        code: 'owner-mismatch',
        index,
        sourceLogicalPath,
      }))
      continue
    }

    if (classification === 'formal') {
      plannedAttachments.push({ ...attachment, url: sourceLogicalPath })
      continue
    }

    if (classification !== 'pending-dash' && classification !== 'pending-upload-api') {
      issues.push(createIssue({
        code: 'unsupported-source-path',
        index,
        sourceLogicalPath,
      }))
      continue
    }

    let targetLogicalPath: string
    try {
      targetLogicalPath = generateLocalFormalTargetLogicalPath({
        sourceLogicalPath,
        ownerUserId,
        dokumenId,
      })
    } catch (error) {
      issues.push(createIssue({
        code: mapLocalPendingMoveErrorCode(error),
        index,
        sourceLogicalPath,
      }))
      continue
    }

    const targetUuid = extractTargetUuid(targetLogicalPath)
    if (!targetUuid) {
      issues.push(createIssue({
        code: 'invalid-source-path',
        index,
        sourceLogicalPath,
        targetLogicalPath,
      }))
      continue
    }

    plannedAttachments.push({ ...attachment, url: targetLogicalPath })
    operations.push({
      index,
      sourceLogicalPath,
      targetLogicalPath,
      targetUuid,
    })
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const diskChecker = createSubmitDiskPreflightChecker()
  for (const operation of operations) {
    const sourceExists = await diskChecker.checkSourceExists(operation.sourceLogicalPath)
    if (!sourceExists) {
      issues.push(createIssue({
        code: 'missing-source',
        index: operation.index,
        sourceLogicalPath: operation.sourceLogicalPath,
        targetLogicalPath: operation.targetLogicalPath,
      }))
      continue
    }

    const targetAvailable = await diskChecker.checkTargetAvailable(operation.targetLogicalPath)
    if (!targetAvailable) {
      issues.push(createIssue({
        code: 'target-exists',
        index: operation.index,
        sourceLogicalPath: operation.sourceLogicalPath,
        targetLogicalPath: operation.targetLogicalPath,
      }))
    }
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, plannedAttachments, operations }
}

export async function executeLocalAttachmentMovements({
  ownerUserId,
  dokumenId,
  operations,
}: {
  ownerUserId: string
  dokumenId: string
  operations: LocalAttachmentMoveOperation[]
}): Promise<LocalAttachmentMovementResult> {
  const moved: LocalAttachmentMovedFile[] = []

  for (const operation of operations) {
    try {
      const result = await moveLocalPendingFileToFormal({
        sourceLogicalPath: operation.sourceLogicalPath,
        ownerUserId,
        dokumenId,
        targetUuid: operation.targetUuid,
      })

      if (
        result.action !== 'moved'
        || result.sourceLogicalPath !== operation.sourceLogicalPath
        || result.targetLogicalPath !== operation.targetLogicalPath
      ) {
        const rollback = await rollbackLocalAttachmentMovements(moved)
        return {
          ok: false,
          moved,
          rollbackAttempted: moved.length > 0,
          rollbackOk: rollback.ok,
          issue: createIssue({
            code: rollback.ok ? 'move-result-mismatch' : 'rollback-failed',
            index: operation.index,
            sourceLogicalPath: operation.sourceLogicalPath,
            targetLogicalPath: operation.targetLogicalPath,
          }),
        }
      }

      moved.push({
        index: operation.index,
        sourceLogicalPath: operation.sourceLogicalPath,
        targetLogicalPath: operation.targetLogicalPath,
      })
    } catch (error) {
      const rollback = await rollbackLocalAttachmentMovements(moved)
      return {
        ok: false,
        moved,
        rollbackAttempted: moved.length > 0,
        rollbackOk: rollback.ok,
        issue: createIssue({
          code: rollback.ok ? mapLocalPendingMoveErrorCode(error) : 'rollback-failed',
          index: operation.index,
          sourceLogicalPath: operation.sourceLogicalPath,
          targetLogicalPath: operation.targetLogicalPath,
        }),
      }
    }
  }

  return { ok: true, moved }
}

export async function rollbackLocalAttachmentMovements(
  moved: LocalAttachmentMovedFile[],
): Promise<{ ok: true } | { ok: false; failed: LocalAttachmentMovedFile | null }> {
  for (const file of [...moved].reverse()) {
    try {
      await moveLogicalFileNoOverwrite(file.targetLogicalPath, file.sourceLogicalPath)
    } catch {
      return { ok: false, failed: file }
    }
  }

  return { ok: true }
}

export async function cleanupReplacedLocalAttachments({
  oldAttachments,
  newAttachments,
  protectedLogicalPaths = new Set<string>(),
  root,
}: {
  oldAttachments: LampiranUrl[]
  newAttachments: LampiranUrl[]
  protectedLogicalPaths?: Set<string>
  root?: string
}): Promise<LocalReplacedAttachmentCleanupResult> {
  const result: LocalReplacedAttachmentCleanupResult = {
    deletedCount: 0,
    missingCount: 0,
    skippedCount: 0,
    protectedCount: 0,
    failedCount: 0,
    failures: [],
  }
  const storageRoot = root ?? getLocalStorageRoot()
  const keptPaths = new Set<string>(protectedLogicalPaths)

  for (const attachment of newAttachments) {
    const safePath = safeLogicalPathOrNull(attachment.url)
    if (safePath) keptPaths.add(safePath)
  }

  const attemptedPaths = new Set<string>()

  for (const [index, attachment] of oldAttachments.entries()) {
    const safePath = safeLogicalPathOrNull(attachment.url)
    if (!safePath) {
      result.skippedCount += 1
      continue
    }

    if (attemptedPaths.has(safePath)) {
      result.skippedCount += 1
      continue
    }
    attemptedPaths.add(safePath)

    if (keptPaths.has(safePath)) {
      result.protectedCount += 1
      continue
    }

    if (classifyStoragePath(safePath) !== 'formal') {
      result.skippedCount += 1
      continue
    }

    let physicalPath: string
    try {
      physicalPath = resolvePhysicalStoragePath(storageRoot, safePath)
    } catch {
      result.failures.push({ index, code: 'invalid-local-path' })
      continue
    }

    const inspection = await inspectDeletableLocalFile(storageRoot, physicalPath)
    if (inspection === 'missing') {
      result.missingCount += 1
      continue
    }

    if (inspection !== 'ok') {
      result.failures.push({ index, code: inspection })
      continue
    }

    try {
      await unlink(physicalPath)
      result.deletedCount += 1
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT')) {
        result.missingCount += 1
        continue
      }

      result.failures.push({ index, code: 'delete-failed' })
    }
  }

  result.failedCount = result.failures.length

  return result
}

export function localAttachmentIssueStatus(issue: LocalAttachmentReplacementIssue): number {
  if (issue.code === 'owner-mismatch') return 403
  if (issue.code === 'invalid-source-path' || issue.code === 'unsupported-source-path') return 400
  return 500
}

export function localAttachmentIssueMessage(issue: LocalAttachmentReplacementIssue): string {
  switch (issue.code) {
    case 'owner-mismatch':
      return 'Anda tidak memiliki akses'
    case 'invalid-source-path':
      return 'Path lampiran tidak valid'
    case 'unsupported-source-path':
      return 'Path lampiran tidak didukung'
    case 'missing-source':
      return 'File lokal tidak ditemukan'
    case 'target-exists':
      return 'Target file sudah ada'
    case 'rollback-failed':
      return 'Pemulihan file gagal'
    case 'move-result-mismatch':
    case 'move-failed':
      return 'Pemindahan file gagal'
  }
}

export function toSafeLocalAttachmentIssue(issue: LocalAttachmentReplacementIssue) {
  return {
    code: issue.code,
    index: issue.index,
    sourceLogicalPath: safeLogicalPathForResponse(issue.sourceLogicalPath),
    targetLogicalPath: safeLogicalPathForResponse(issue.targetLogicalPath),
  }
}

function attachmentKey(lampiran: Pick<LampiranUrl, 'kelengkapan_id' | 'url'>): ExistingAttachmentKey {
  return `${lampiran.kelengkapan_id}\n${lampiran.url}`
}

function createIssue({
  code,
  index,
  sourceLogicalPath = null,
  targetLogicalPath = null,
}: {
  code: LocalAttachmentReplacementIssueCode
  index: number
  sourceLogicalPath?: string | null
  targetLogicalPath?: string | null
}): LocalAttachmentReplacementIssue {
  return {
    code,
    index,
    sourceLogicalPath,
    targetLogicalPath,
  }
}

function mapLocalPendingMoveErrorCode(error: unknown): LocalAttachmentReplacementIssueCode {
  if (error instanceof LocalPendingMoveError) {
    if (error.code === 'owner-mismatch') return 'owner-mismatch'
    if (error.code === 'missing-source') return 'missing-source'
    if (error.code === 'target-exists') return 'target-exists'
    if (error.code === 'unsupported-source-path') return 'unsupported-source-path'
    if (error.code === 'invalid-source-path') return 'invalid-source-path'
  }

  return 'move-failed'
}

function extractTargetUuid(targetLogicalPath: string): string | null {
  const parts = targetLogicalPath.split('/')
  const filename = parts[2]
  if (!filename) return null

  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0) return null

  const targetUuid = filename.slice(0, dotIndex)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUuid)
    ? targetUuid.toLowerCase()
    : null
}

function safeLogicalPathForResponse(logicalPath: string | null): string | null {
  if (!logicalPath) return null

  try {
    return assertSafeLogicalStoragePath(logicalPath) === logicalPath ? logicalPath : null
  } catch {
    return null
  }
}

function safeLogicalPathOrNull(logicalPath: string | null | undefined): string | null {
  if (!logicalPath) return null

  try {
    return assertSafeLogicalStoragePath(logicalPath)
  } catch {
    return null
  }
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

function isPhysicalPathInsideRoot(storageRoot: string, physicalPath: string): boolean {
  const relativePath = path.relative(storageRoot, physicalPath)

  return relativePath !== ''
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath)
}

async function moveLogicalFileNoOverwrite(
  sourceLogicalPath: string,
  targetLogicalPath: string,
): Promise<void> {
  const storageRoot = getLocalStorageRoot()
  const sourcePhysicalPath = resolvePhysicalStoragePath(storageRoot, sourceLogicalPath)
  const targetPhysicalPath = resolvePhysicalStoragePath(storageRoot, targetLogicalPath)

  const sourceStats = await stat(sourcePhysicalPath)
  if (!sourceStats.isFile()) {
    throw new Error('source-not-file')
  }

  await assertRollbackTargetAvailable(targetPhysicalPath)
  await mkdir(path.dirname(targetPhysicalPath), { recursive: true })

  try {
    await copyFile(sourcePhysicalPath, targetPhysicalPath, fsConstants.COPYFILE_EXCL)
    await unlink(sourcePhysicalPath)
  } catch (error) {
    await rm(targetPhysicalPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function assertRollbackTargetAvailable(physicalPath: string): Promise<void> {
  try {
    await stat(physicalPath)
    throw new Error('rollback-target-exists')
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) {
      return
    }

    throw error
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}
