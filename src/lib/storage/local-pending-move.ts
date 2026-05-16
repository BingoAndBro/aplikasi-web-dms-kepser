// Server-only module. Do not import from client components.
// Isolated helper foundation only: do not wire submit/update/resubmit routes here.
import { constants as fsConstants } from 'node:fs'
import { mkdir, rm, stat, unlink } from 'node:fs/promises'
import { copyFile, link } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  assertSafeLogicalStoragePath,
  classifyStoragePath,
  getFileExtension,
  getLocalStorageRoot,
  getLogicalPathOwnerId,
  resolvePhysicalStoragePath,
  sanitizeStoragePathSegment,
} from '#/lib/storage/local-storage-paths'

export type LocalPendingMovePathKind =
  | 'pending-dash'
  | 'pending-upload-api'
  | 'formal'
  | 'unsupported'

export type LocalPendingMoveSource = {
  logicalPath: string
  ownerId: string
  classification: Exclude<LocalPendingMovePathKind, 'unsupported'>
  extension: string
}

export type GenerateLocalFormalTargetInput = {
  sourceLogicalPath: string
  ownerUserId: string
  dokumenId: string
  targetUuid?: string
}

export type MoveLocalPendingFileToFormalInput = GenerateLocalFormalTargetInput & {
  root?: string
}

export type LocalPendingMoveResult = {
  action: 'moved' | 'unchanged'
  sourceLogicalPath: string
  targetLogicalPath: string
  sourceClassification: Exclude<LocalPendingMovePathKind, 'unsupported'>
}

export class LocalPendingMoveError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid-document-id'
      | 'invalid-owner-id'
      | 'invalid-source-path'
      | 'invalid-target-path'
      | 'invalid-target-uuid'
      | 'missing-source'
      | 'move-failed'
      | 'owner-mismatch'
      | 'source-not-file'
      | 'target-exists'
      | 'unsupported-source-path',
  ) {
    super(message)
    this.name = 'LocalPendingMoveError'
  }
}

export const localPendingMoveFsForTest = {
  copyFile,
  link,
}

export function classifyLocalPendingMovePath(logicalPath: string): LocalPendingMovePathKind {
  const classification = classifyStoragePath(toSafeLogicalPath(logicalPath))

  if (classification === 'other') {
    return 'unsupported'
  }

  return classification
}

export function validateLocalPendingMoveSource({
  sourceLogicalPath,
  ownerUserId,
}: {
  sourceLogicalPath: string
  ownerUserId: string
}): LocalPendingMoveSource {
  const ownerSegment = validateLocalMoveOwnerSegment(ownerUserId)
  const logicalPath = toSafeLogicalPath(sourceLogicalPath)
  const ownerId = getLogicalPathOwnerId(logicalPath)

  if (ownerId !== ownerSegment) {
    throw new LocalPendingMoveError('Local move source owner does not match.', 'owner-mismatch')
  }

  const classification = classifyLocalPendingMovePath(logicalPath)
  if (classification === 'unsupported') {
    throw new LocalPendingMoveError('Local move source path is not supported.', 'unsupported-source-path')
  }

  const extension = getFileExtension(logicalPath)
  if (!/^[a-z0-9]+$/.test(extension)) {
    throw new LocalPendingMoveError('Local move source extension is not valid.', 'invalid-source-path')
  }

  return {
    logicalPath,
    ownerId,
    classification,
    extension,
  }
}

export function generateLocalFormalTargetLogicalPath({
  sourceLogicalPath,
  ownerUserId,
  dokumenId,
  targetUuid = randomUUID(),
}: GenerateLocalFormalTargetInput): string {
  const source = validateLocalPendingMoveSource({ sourceLogicalPath, ownerUserId })

  if (source.classification === 'formal') {
    return source.logicalPath
  }

  const ownerSegment = validateLocalMoveOwnerSegment(ownerUserId)
  const documentSegment = validateLocalMoveDocumentSegment(dokumenId)
  const uuid = validateLocalMoveTargetUuid(targetUuid)
  const targetLogicalPath = `${ownerSegment}/${documentSegment}/${uuid}.${source.extension}`

  try {
    const normalizedTarget = assertSafeLogicalStoragePath(targetLogicalPath)

    if (classifyStoragePath(normalizedTarget) !== 'formal') {
      throw new LocalPendingMoveError('Local move target path is not formal.', 'invalid-target-path')
    }

    return normalizedTarget
  } catch (error) {
    if (error instanceof LocalPendingMoveError) {
      throw error
    }

    throw new LocalPendingMoveError('Local move target path is not safe.', 'invalid-target-path')
  }
}

export async function moveLocalPendingFileToFormal({
  sourceLogicalPath,
  ownerUserId,
  dokumenId,
  targetUuid,
  root,
}: MoveLocalPendingFileToFormalInput): Promise<LocalPendingMoveResult> {
  const source = validateLocalPendingMoveSource({ sourceLogicalPath, ownerUserId })

  if (source.classification === 'formal') {
    return {
      action: 'unchanged',
      sourceLogicalPath: source.logicalPath,
      targetLogicalPath: source.logicalPath,
      sourceClassification: source.classification,
    }
  }

  const targetLogicalPath = generateLocalFormalTargetLogicalPath({
    sourceLogicalPath: source.logicalPath,
    ownerUserId,
    dokumenId,
    targetUuid,
  })

  const storageRoot = root ?? getLocalStorageRoot()
  const sourcePhysicalPath = resolvePhysicalStoragePath(storageRoot, source.logicalPath)
  const targetPhysicalPath = resolvePhysicalStoragePath(storageRoot, targetLogicalPath)

  await assertSourceFileExists(sourcePhysicalPath)
  await assertTargetDoesNotExist(targetPhysicalPath)
  await mkdir(path.dirname(targetPhysicalPath), { recursive: true })
  await moveFileNoOverwrite(sourcePhysicalPath, targetPhysicalPath)

  return {
    action: 'moved',
    sourceLogicalPath: source.logicalPath,
    targetLogicalPath,
    sourceClassification: source.classification,
  }
}

export function validateLocalMoveOwnerSegment(ownerUserId: string): string {
  return validateExactSafeSegment(ownerUserId, 'invalid-owner-id')
}

function validateLocalMoveDocumentSegment(dokumenId: string): string {
  return validateExactSafeSegment(dokumenId, 'invalid-document-id')
}

function validateLocalMoveTargetUuid(targetUuid: string): string {
  const trimmed = targetUuid.trim()

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw new LocalPendingMoveError('Local move target UUID is not valid.', 'invalid-target-uuid')
  }

  return trimmed.toLowerCase()
}

function validateExactSafeSegment(
  segment: string,
  code: 'invalid-document-id' | 'invalid-owner-id',
): string {
  const trimmed = segment.trim()

  try {
    const sanitized = sanitizeStoragePathSegment(trimmed)
    if (sanitized !== trimmed) {
      throw new LocalPendingMoveError('Local move path segment is not safe.', code)
    }

    return sanitized
  } catch (error) {
    if (error instanceof LocalPendingMoveError) {
      throw error
    }

    throw new LocalPendingMoveError('Local move path segment is not safe.', code)
  }
}

function toSafeLogicalPath(logicalPath: string): string {
  try {
    return assertSafeLogicalStoragePath(logicalPath)
  } catch {
    throw new LocalPendingMoveError('Local move source path is not safe.', 'invalid-source-path')
  }
}

async function assertSourceFileExists(physicalPath: string): Promise<void> {
  try {
    const sourceStats = await stat(physicalPath)

    if (!sourceStats.isFile()) {
      throw new LocalPendingMoveError('Local move source is not a regular file.', 'source-not-file')
    }
  } catch (error) {
    if (error instanceof LocalPendingMoveError) {
      throw error
    }

    if (isNodeErrorCode(error, 'ENOENT')) {
      throw new LocalPendingMoveError('Local move source file does not exist.', 'missing-source')
    }

    throw new LocalPendingMoveError('Local move source could not be inspected.', 'move-failed')
  }
}

async function assertTargetDoesNotExist(physicalPath: string): Promise<void> {
  try {
    await stat(physicalPath)
    throw new LocalPendingMoveError('Local move target already exists.', 'target-exists')
  } catch (error) {
    if (error instanceof LocalPendingMoveError) {
      throw error
    }

    if (isNodeErrorCode(error, 'ENOENT')) {
      return
    }

    throw new LocalPendingMoveError('Local move target could not be inspected.', 'move-failed')
  }
}

async function moveFileNoOverwrite(sourcePhysicalPath: string, targetPhysicalPath: string): Promise<void> {
  try {
    await localPendingMoveFsForTest.link(sourcePhysicalPath, targetPhysicalPath)
    await unlinkSourceAfterTargetCreated(sourcePhysicalPath, targetPhysicalPath)
    return
  } catch (error) {
    if (isNodeErrorCode(error, 'EEXIST')) {
      throw new LocalPendingMoveError('Local move target already exists.', 'target-exists')
    }

    if (!shouldFallbackToCopyUnlink(error)) {
      throw mapMoveError(error)
    }
  }

  try {
    await localPendingMoveFsForTest.copyFile(sourcePhysicalPath, targetPhysicalPath, fsConstants.COPYFILE_EXCL)
    await unlinkSourceAfterTargetCreated(sourcePhysicalPath, targetPhysicalPath)
  } catch (error) {
    if (isNodeErrorCode(error, 'EEXIST')) {
      throw new LocalPendingMoveError('Local move target already exists.', 'target-exists')
    }

    await rm(targetPhysicalPath, { force: true }).catch(() => undefined)
    throw mapMoveError(error)
  }
}

async function unlinkSourceAfterTargetCreated(
  sourcePhysicalPath: string,
  targetPhysicalPath: string,
): Promise<void> {
  try {
    await unlink(sourcePhysicalPath)
  } catch (error) {
    await rm(targetPhysicalPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function shouldFallbackToCopyUnlink(error: unknown): boolean {
  return isNodeErrorCode(error, 'EXDEV')
    || isNodeErrorCode(error, 'EPERM')
    || isNodeErrorCode(error, 'EACCES')
    || isNodeErrorCode(error, 'ENOTSUP')
    || isNodeErrorCode(error, 'EINVAL')
}

function mapMoveError(error: unknown): LocalPendingMoveError {
  if (error instanceof LocalPendingMoveError) {
    return error
  }

  if (isNodeErrorCode(error, 'ENOENT')) {
    return new LocalPendingMoveError('Local move source file does not exist.', 'missing-source')
  }

  if (isNodeErrorCode(error, 'EEXIST')) {
    return new LocalPendingMoveError('Local move target already exists.', 'target-exists')
  }

  return new LocalPendingMoveError('Local file move failed.', 'move-failed')
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}
