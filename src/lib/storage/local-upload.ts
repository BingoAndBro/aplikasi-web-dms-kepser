// Server-only module. Do not import from client components.
// Isolated helper foundation only: do not wire runtime upload routes or UI callers here.
// This phase validates declared metadata only; it does not inspect deep file signatures.
import { mkdir, open, rm } from 'node:fs/promises'
import path from 'node:path'

import {
  assertSafeLogicalStoragePath,
  getFileExtension,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
  sanitizeStoragePathSegment,
} from '#/lib/storage/local-storage-paths'

export const LOCAL_UPLOAD_MAX_BYTES = 2 * 1024 * 1024

export const LOCAL_UPLOAD_ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

export const LOCAL_UPLOAD_ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
] as const

const EXTENSIONS_BY_MIME_TYPE: Record<LocalUploadAllowedMimeType, readonly LocalUploadAllowedExtension[]> = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const USER_CUSTOM_KELENGKAPAN_PATTERN =
  /^user-custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i

export type LocalUploadAllowedMimeType = typeof LOCAL_UPLOAD_ALLOWED_TYPES[number]
export type LocalUploadAllowedExtension = typeof LOCAL_UPLOAD_ALLOWED_EXTENSIONS[number]

export type LocalUploadFileMetadata = {
  name: string
  type: string
  size: number
}

export type ValidatedLocalUploadFile = {
  originalFilename: string
  sanitizedFilename: string
  contentType: LocalUploadAllowedMimeType
  extension: LocalUploadAllowedExtension
  size: number
}

export type LocalUploadDescriptor = ValidatedLocalUploadFile & {
  kelengkapanId: string
  logicalPath: string
}

export type CreateLocalUploadDescriptorInput = {
  file: LocalUploadFileMetadata
  kelengkapanId: string
  ownerUserId: string
  timestamp?: number
}

export type GenerateLocalUploadPendingPathInput = {
  ownerUserId: string
  kelengkapanId: string
  sanitizedFilename: string
  timestamp?: number
}

export type WriteLocalUploadContentInput = {
  logicalPath: string
  content: ArrayBuffer | Uint8Array | Buffer
  expectedBytes?: number
  root?: string
}

export type LocalUploadWriteResult = {
  logicalPath: string
  bytesWritten: number
}

export class LocalUploadError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid-content-size'
      | 'invalid-file-extension'
      | 'invalid-file-name'
      | 'invalid-file-size'
      | 'invalid-file-type'
      | 'invalid-kelengkapan-id'
      | 'invalid-owner-id'
      | 'invalid-timestamp'
      | 'target-exists'
      | 'write-failed',
  ) {
    super(message)
    this.name = 'LocalUploadError'
  }
}

export function validateLocalUploadFileMetadata(
  file: LocalUploadFileMetadata,
): ValidatedLocalUploadFile {
  const sanitizedFilename = sanitizeClientUploadFilename(file.name)
  const extension = getFileExtension(sanitizedFilename)

  if (!isAllowedUploadExtension(extension)) {
    throw new LocalUploadError('Upload file extension is not allowed.', 'invalid-file-extension')
  }

  if (!isAllowedUploadMimeType(file.type)) {
    throw new LocalUploadError('Upload file type is not allowed.', 'invalid-file-type')
  }

  if (!EXTENSIONS_BY_MIME_TYPE[file.type].includes(extension)) {
    throw new LocalUploadError('Upload file extension does not match its declared type.', 'invalid-file-extension')
  }

  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new LocalUploadError('Upload file size is invalid.', 'invalid-file-size')
  }

  if (file.size > LOCAL_UPLOAD_MAX_BYTES) {
    throw new LocalUploadError('Upload file exceeds the maximum allowed size.', 'invalid-file-size')
  }

  return {
    originalFilename: file.name,
    sanitizedFilename,
    contentType: file.type,
    extension,
    size: file.size,
  }
}

export function sanitizeClientUploadFilename(filename: string): string {
  const trimmed = filename.trim()

  if (
    !trimmed
    || trimmed === '.'
    || trimmed === '..'
    || trimmed.includes('/')
    || trimmed.includes('\\')
    || trimmed.includes('\r')
    || trimmed.includes('\n')
    || trimmed.includes('..')
    || path.isAbsolute(trimmed)
    || WINDOWS_DRIVE_PATTERN.test(trimmed)
    || URL_LIKE_PATTERN.test(trimmed)
  ) {
    throw new LocalUploadError('Upload filename is not safe.', 'invalid-file-name')
  }

  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_')

  if (!sanitized || sanitized === '.' || sanitized === '..' || /^[._-]+$/.test(sanitized)) {
    throw new LocalUploadError('Upload filename is not safe after sanitization.', 'invalid-file-name')
  }

  return sanitized
}

export function validateLocalUploadKelengkapanId(kelengkapanId: string): string {
  const trimmed = kelengkapanId.trim()

  if (!UUID_PATTERN.test(trimmed) && !USER_CUSTOM_KELENGKAPAN_PATTERN.test(trimmed)) {
    throw new LocalUploadError('Upload kelengkapan_id is not valid.', 'invalid-kelengkapan-id')
  }

  return trimmed
}

export function generateLocalUploadPendingLogicalPath({
  ownerUserId,
  kelengkapanId,
  sanitizedFilename,
  timestamp = Date.now(),
}: GenerateLocalUploadPendingPathInput): string {
  const ownerSegment = assertSafeServerPathSegment(ownerUserId, 'invalid-owner-id')
  const safeKelengkapanId = sanitizeStoragePathSegment(validateLocalUploadKelengkapanId(kelengkapanId))
  const safeFilename = sanitizeClientUploadFilename(sanitizedFilename)

  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new LocalUploadError('Upload timestamp is invalid.', 'invalid-timestamp')
  }

  const logicalPath = `${ownerSegment}/${safeKelengkapanId}_${timestamp}_${safeFilename}`

  return assertSafeLogicalStoragePath(logicalPath)
}

export function createLocalUploadDescriptor({
  file,
  kelengkapanId,
  ownerUserId,
  timestamp,
}: CreateLocalUploadDescriptorInput): LocalUploadDescriptor {
  const validatedFile = validateLocalUploadFileMetadata(file)
  const validKelengkapanId = validateLocalUploadKelengkapanId(kelengkapanId)
  const logicalPath = generateLocalUploadPendingLogicalPath({
    ownerUserId,
    kelengkapanId: validKelengkapanId,
    sanitizedFilename: validatedFile.sanitizedFilename,
    timestamp,
  })

  return {
    ...validatedFile,
    kelengkapanId: validKelengkapanId,
    logicalPath,
  }
}

/**
 * Writes a small upload buffer with no-overwrite semantics.
 *
 * The current upload limit is 2 MB, so this foundation writes the target file
 * directly with the exclusive `wx` flag and removes the target on write failure.
 * It is not a fully atomic temp-file swap primitive; future streaming work can
 * add a temp/link strategy if larger files or retry recovery are introduced.
 */
export async function writeLocalUploadContent({
  logicalPath,
  content,
  expectedBytes,
  root,
}: WriteLocalUploadContentInput): Promise<LocalUploadWriteResult> {
  const normalizedLogicalPath = assertSafeLogicalStoragePath(logicalPath)
  const contentBuffer = toUploadBuffer(content)

  if (contentBuffer.byteLength > LOCAL_UPLOAD_MAX_BYTES) {
    throw new LocalUploadError('Upload file exceeds the maximum allowed size.', 'invalid-content-size')
  }

  if (expectedBytes !== undefined && expectedBytes !== contentBuffer.byteLength) {
    throw new LocalUploadError('Upload file content length does not match metadata.', 'invalid-content-size')
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
      throw new LocalUploadError('Local upload target already exists.', 'target-exists')
    }

    if (error instanceof LocalUploadError) {
      throw error
    }

    throw new LocalUploadError('Local upload write failed.', 'write-failed')
  }
}

function isAllowedUploadMimeType(value: string): value is LocalUploadAllowedMimeType {
  return LOCAL_UPLOAD_ALLOWED_TYPES.includes(value as LocalUploadAllowedMimeType)
}

function isAllowedUploadExtension(value: string): value is LocalUploadAllowedExtension {
  return LOCAL_UPLOAD_ALLOWED_EXTENSIONS.includes(value as LocalUploadAllowedExtension)
}

function assertSafeServerPathSegment(
  segment: string,
  errorCode: LocalUploadError['code'],
): string {
  const trimmed = segment.trim()
  let sanitized: string

  try {
    sanitized = sanitizeStoragePathSegment(trimmed)
  } catch {
    throw new LocalUploadError('Upload owner segment is not safe.', errorCode)
  }

  if (sanitized !== trimmed) {
    throw new LocalUploadError('Upload owner segment is not safe.', errorCode)
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
