// Server-only helper for Manual Archive attachment upload storage.
import { randomUUID } from 'node:crypto'
import { mkdir, open, rm } from 'node:fs/promises'
import path from 'node:path'

import {
  DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES,
  DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE,
  DOCUMENT_UPLOAD_MAX_BYTES,
  type DocumentUploadAllowedExtension,
  type DocumentUploadAllowedMimeType,
  getAllowedDocumentUploadExtensionsForMimeType,
  getDocumentUploadExtension,
  isAllowedDocumentUploadExtension,
  isAllowedDocumentUploadMimeType,
  matchesDocumentUploadSignature,
} from '#/lib/upload/document-upload-policy'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
  sanitizeStoragePathSegment,
} from '#/lib/storage/local-storage-paths'
import { sanitizeClientUploadFilename } from '#/lib/storage/local-upload'

export const MANUAL_ARSIP_ATTACHMENT_FIELD_NAME = 'files'
export const MANUAL_ARSIP_ATTACHMENT_MAX_FILES = 5
export const MANUAL_ARSIP_ATTACHMENT_MAX_BYTES = DOCUMENT_UPLOAD_MAX_BYTES
export const MANUAL_ARSIP_ALLOWED_CONTENT_TYPES = DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES

export type ManualArsipUploadFileMetadata = {
  name: string
  type: string
  size: number
}

export type ValidatedManualArsipUploadFile = {
  originalFilename: string
  contentType: DocumentUploadAllowedMimeType
  extension: DocumentUploadAllowedExtension
  sizeBytes: number
}

export type ManualArsipAttachmentStorageDescriptor = ValidatedManualArsipUploadFile & {
  logicalPath: string
}

export type ManualArsipUploadContentInput = {
  logicalPath: string
  content: ArrayBuffer | Uint8Array | Buffer
  expectedBytes?: number
  expectedContentType?: DocumentUploadAllowedMimeType
  expectedExtension?: DocumentUploadAllowedExtension
  root?: string
}

export type ManualArsipUploadWriteResult = {
  logicalPath: string
  bytesWritten: number
}

export class ManualArsipUploadError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid-content-size'
      | 'invalid-file-count'
      | 'invalid-file-empty'
      | 'invalid-file-extension'
      | 'invalid-file-name'
      | 'invalid-file-signature'
      | 'invalid-file-size'
      | 'invalid-file-type'
      | 'invalid-manual-arsip-id'
      | 'invalid-owner-id'
      | 'target-exists'
      | 'write-failed',
  ) {
    super(message)
    this.name = 'ManualArsipUploadError'
  }
}

export function validateManualArsipUploadFiles(
  files: ManualArsipUploadFileMetadata[],
): ValidatedManualArsipUploadFile[] {
  if (files.length === 0 || files.length > MANUAL_ARSIP_ATTACHMENT_MAX_FILES) {
    throw new ManualArsipUploadError('Manual archive upload file count is invalid.', 'invalid-file-count')
  }

  return files.map(validateManualArsipUploadFileMetadata)
}

export function isAllowedManualArsipAttachmentContentType(contentType: string): boolean {
  return isAllowedDocumentUploadMimeType(contentType.trim().toLowerCase())
}

export function createManualArsipAttachmentStorageDescriptors({
  files,
  manualArsipId,
  ownerUserId,
  uuidFactory = randomUUID,
}: {
  files: ManualArsipUploadFileMetadata[]
  manualArsipId: string
  ownerUserId: string
  uuidFactory?: () => string
}): ManualArsipAttachmentStorageDescriptor[] {
  const ownerSegment = assertSafeServerPathSegment(ownerUserId, 'invalid-owner-id')
  const manualArsipSegment = assertSafeServerPathSegment(manualArsipId, 'invalid-manual-arsip-id')

  return validateManualArsipUploadFiles(files).map((file) => {
    const logicalPath = assertSafeLogicalStoragePath(
      `manual-arsip/${ownerSegment}/${manualArsipSegment}/${uuidFactory()}.${file.extension}`,
    )

    return {
      ...file,
      logicalPath,
    }
  })
}

export async function writeManualArsipAttachmentContent({
  logicalPath,
  content,
  expectedBytes,
  expectedContentType,
  expectedExtension,
  root,
}: ManualArsipUploadContentInput): Promise<ManualArsipUploadWriteResult> {
  const normalizedLogicalPath = assertSafeLogicalStoragePath(logicalPath)
  const contentBuffer = toUploadBuffer(content)

  if (contentBuffer.byteLength > MANUAL_ARSIP_ATTACHMENT_MAX_BYTES) {
    throw new ManualArsipUploadError('Manual archive upload file exceeds the maximum allowed size.', 'invalid-content-size')
  }

  if (expectedBytes !== undefined && expectedBytes !== contentBuffer.byteLength) {
    throw new ManualArsipUploadError('Manual archive upload content length does not match metadata.', 'invalid-content-size')
  }

  if (expectedContentType) {
    if (
      expectedExtension
      && !getAllowedDocumentUploadExtensionsForMimeType(expectedContentType).includes(expectedExtension)
    ) {
      throw new ManualArsipUploadError('Manual archive upload extension does not match its declared type.', 'invalid-file-extension')
    }

    if (!matchesDocumentUploadSignature(contentBuffer, expectedContentType)) {
      throw new ManualArsipUploadError('Manual archive upload signature is invalid.', 'invalid-file-signature')
    }
  }

  const physicalPath = resolvePhysicalStoragePath(root ?? getLocalStorageRoot(), normalizedLogicalPath)
  let openedTarget = false
  let handle: Awaited<ReturnType<typeof open>> | null = null

  try {
    await mkdir(path.dirname(physicalPath), { recursive: true })
    handle = await open(physicalPath, 'wx')
    openedTarget = true
    await handle.writeFile(contentBuffer)
    await handle.close()
    handle = null

    return {
      logicalPath: normalizedLogicalPath,
      bytesWritten: contentBuffer.byteLength,
    }
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined)
    }

    if (openedTarget) {
      await rm(physicalPath, { force: true }).catch(() => undefined)
    }

    if (isFileExistsError(error)) {
      throw new ManualArsipUploadError('Manual archive upload target already exists.', 'target-exists')
    }

    if (error instanceof ManualArsipUploadError) {
      throw error
    }

    throw new ManualArsipUploadError('Manual archive upload write failed.', 'write-failed')
  }
}

function validateManualArsipUploadFileMetadata(
  file: ManualArsipUploadFileMetadata,
): ValidatedManualArsipUploadFile {
  let originalFilename: string

  try {
    originalFilename = sanitizeClientUploadFilename(file.name)
  } catch {
    throw new ManualArsipUploadError('Manual archive upload filename is not safe.', 'invalid-file-name')
  }

  const contentType = file.type.trim().toLowerCase()
  const extension = getDocumentUploadExtension(originalFilename)

  if (!isAllowedDocumentUploadExtension(extension)) {
    throw new ManualArsipUploadError('Manual archive upload file extension is not allowed.', 'invalid-file-extension')
  }

  if (!isAllowedDocumentUploadMimeType(contentType)) {
    throw new ManualArsipUploadError('Manual archive upload file type is not allowed.', 'invalid-file-type')
  }

  if (!DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE[contentType].includes(extension)) {
    throw new ManualArsipUploadError('Manual archive upload file extension does not match type.', 'invalid-file-extension')
  }

  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new ManualArsipUploadError('Manual archive upload file size is invalid.', 'invalid-file-empty')
  }

  if (file.size > MANUAL_ARSIP_ATTACHMENT_MAX_BYTES) {
    throw new ManualArsipUploadError('Manual archive upload file exceeds the maximum allowed size.', 'invalid-file-size')
  }

  return {
    originalFilename,
    contentType,
    extension,
    sizeBytes: file.size,
  }
}

function assertSafeServerPathSegment(
  segment: string,
  errorCode: ManualArsipUploadError['code'],
): string {
  const trimmed = segment.trim()
  let sanitized: string

  try {
    sanitized = sanitizeStoragePathSegment(trimmed)
  } catch {
    throw new ManualArsipUploadError('Manual archive upload path segment is not safe.', errorCode)
  }

  if (sanitized !== trimmed) {
    throw new ManualArsipUploadError('Manual archive upload path segment is not safe.', errorCode)
  }

  return sanitized
}

function toUploadBuffer(content: ArrayBuffer | Uint8Array | Buffer): Buffer {
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content)
  }

  return Buffer.from(content.buffer, content.byteOffset, content.byteLength)
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'EEXIST'
}
