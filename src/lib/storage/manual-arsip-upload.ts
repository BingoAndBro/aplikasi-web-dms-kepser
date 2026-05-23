// Server-only helper for Manual Archive attachment upload storage.
// This validates declared file metadata; it does not perform magic-byte inspection.
import { randomUUID } from 'node:crypto'
import { mkdir, open, rm } from 'node:fs/promises'
import path from 'node:path'

import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
  sanitizeStoragePathSegment,
} from '#/lib/storage/local-storage-paths'
import { sanitizeClientUploadFilename } from '#/lib/storage/local-upload'

export const MANUAL_ARSIP_ATTACHMENT_FIELD_NAME = 'files'
export const MANUAL_ARSIP_ATTACHMENT_MAX_FILES = 5
export const MANUAL_ARSIP_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

const PDF_CONTENT_TYPE = 'application/pdf'

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  [PDF_CONTENT_TYPE]: 'pdf',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tif',
  'image/webp': 'webp',
}

export type ManualArsipUploadFileMetadata = {
  name: string
  type: string
  size: number
}

export type ValidatedManualArsipUploadFile = {
  originalFilename: string
  contentType: string
  extension: string
  sizeBytes: number
}

export type ManualArsipAttachmentStorageDescriptor = ValidatedManualArsipUploadFile & {
  logicalPath: string
}

export type ManualArsipUploadContentInput = {
  logicalPath: string
  content: ArrayBuffer | Uint8Array | Buffer
  expectedBytes?: number
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
      | 'invalid-file-name'
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
  const extension = extensionFromContentType(contentType)

  if (!extension) {
    throw new ManualArsipUploadError('Manual archive upload file type is not allowed.', 'invalid-file-type')
  }

  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new ManualArsipUploadError('Manual archive upload file size is invalid.', 'invalid-file-size')
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

function extensionFromContentType(contentType: string): string | null {
  const knownExtension = EXTENSION_BY_CONTENT_TYPE[contentType]
  return knownExtension ?? null
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
