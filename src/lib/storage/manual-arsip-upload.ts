// Server-only helper for Manual Archive attachment upload storage.
import { randomUUID } from 'node:crypto'

import {
  DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES,
  DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE,
  DOCUMENT_UPLOAD_MAX_BYTES,
  type DocumentUploadAllowedExtension,
  type DocumentUploadAllowedMimeType,
  getDocumentUploadExtension,
  isAllowedDocumentUploadExtension,
  isAllowedDocumentUploadMimeType,
} from '#/lib/upload/document-upload-policy'
import {
  assertSafeLogicalStoragePath,
  sanitizeStoragePathSegment,
} from '#/lib/storage/local-storage-paths'
import { sanitizeClientUploadFilename } from '#/lib/storage/local-upload'

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
      | 'invalid-owner-id',
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
