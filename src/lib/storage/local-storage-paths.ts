// Server-only module. Do not import from client components.
import path from 'node:path'

const LOCAL_STORAGE_ROOT_ENV = 'DMS_LOCAL_STORAGE_ROOT'
const DEVELOPMENT_STORAGE_ROOT = 'storage'

export type StoragePathClassification =
  | 'pending-dash'
  | 'pending-upload-api'
  | 'formal'
  | 'other'

const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i
const URL_ROOT_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const DASH_PENDING_FILENAME_PATTERN = /^\d{13}-[a-zA-Z0-9]+-.+$/
const UPLOAD_API_PENDING_FILENAME_PATTERN = /^[a-zA-Z0-9._-]+_\d{13}_.+$/
const UUID_WITH_EXTENSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i
const PUBLIC_ROOT_SEGMENTS = new Set(['public', 'static', 'www', 'wwwroot'])

export function getLocalStorageRoot(): string {
  const configuredRoot = process.env[LOCAL_STORAGE_ROOT_ENV]?.trim()

  return resolveStorageRoot(configuredRoot || DEVELOPMENT_STORAGE_ROOT)
}

export function resolveStorageRoot(input?: string): string {
  const rootInput = input?.trim()

  if (!rootInput) {
    throw new Error('Local storage root must be a non-empty path.')
  }

  if (URL_ROOT_PATTERN.test(rootInput)) {
    throw new Error('Local storage root must be a filesystem path, not a URL.')
  }

  const resolvedRoot = path.resolve(rootInput)

  if (pointsToPublicStorageRoot(resolvedRoot)) {
    throw new Error('Local storage root must not point to a public/static directory.')
  }

  return resolvedRoot
}

export function normalizeLogicalStoragePath(storagePath: string): string {
  const rawPath = storagePath.trim()

  if (!rawPath) {
    throw new Error('Logical storage path must be non-empty.')
  }

  if (WINDOWS_DRIVE_PATTERN.test(rawPath)) {
    throw new Error('Logical storage path must not be a Windows absolute path.')
  }

  if (URL_LIKE_PATTERN.test(rawPath)) {
    throw new Error('Logical storage path must not be a URL or protocol value.')
  }

  let normalized = rawPath.replace(/\\/g, '/')

  if (normalized.startsWith('//')) {
    throw new Error('Logical storage path must not be a network or protocol-relative path.')
  }

  normalized = normalized.replace(/\/+/g, '/').replace(/^\/+/, '')

  if (!normalized) {
    throw new Error('Logical storage path must be non-empty.')
  }

  if (normalized.includes(':')) {
    throw new Error('Logical storage path must not contain colon characters.')
  }

  const segments = normalized.split('/')
  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error('Logical storage path must not contain dot or traversal segments.')
  }

  if (segments.some(segment => segment.length === 0)) {
    throw new Error('Logical storage path must not contain empty segments.')
  }

  return normalized
}

export function assertSafeLogicalStoragePath(storagePath: string): string {
  return normalizeLogicalStoragePath(storagePath)
}

export function resolvePhysicalStoragePath(root: string, logicalPath: string): string {
  const resolvedRoot = resolveStorageRoot(root)
  const normalizedLogicalPath = assertSafeLogicalStoragePath(logicalPath)
  const physicalPath = path.resolve(resolvedRoot, normalizedLogicalPath)
  const relativePath = path.relative(resolvedRoot, physicalPath)

  if (
    relativePath === ''
    || relativePath.startsWith('..')
    || path.isAbsolute(relativePath)
  ) {
    throw new Error('Resolved storage path must remain within the storage root.')
  }

  return physicalPath
}

export function getLogicalPathOwnerId(storagePath: string): string | null {
  const normalizedPath = assertSafeLogicalStoragePath(storagePath)
  const [ownerId] = normalizedPath.split('/')

  return ownerId || null
}

export function storagePathBelongsToUser(storagePath: string, userId: string): boolean {
  if (!userId.trim()) return false

  return getLogicalPathOwnerId(storagePath) === userId
}

export function sanitizeStorageFilename(filename: string): string {
  const sanitized = filename.trim().replace(/[^a-zA-Z0-9._-]/g, '_')

  assertSafeSanitizedValue(sanitized, 'Storage filename')

  return sanitized
}

export function sanitizeStoragePathSegment(segment: string): string {
  const sanitized = segment.trim().replace(/[^a-zA-Z0-9._-]/g, '_')

  assertSafeSanitizedValue(sanitized, 'Storage path segment')

  return sanitized
}

/**
 * Returns the lowercase extension without a leading dot.
 */
export function getFileExtension(filenameOrPath: string): string {
  const normalizedPath = filenameOrPath.replace(/\\/g, '/')
  const filename = normalizedPath.split('/').pop() ?? ''
  const lastDotIndex = filename.lastIndexOf('.')

  if (lastDotIndex <= 0 || lastDotIndex === filename.length - 1) {
    return ''
  }

  return filename.slice(lastDotIndex + 1).toLowerCase()
}

export function isDashPendingPath(storagePath: string): boolean {
  const segments = assertSafeLogicalStoragePath(storagePath).split('/')
  const filename = segments[segments.length - 1] ?? ''

  return segments.length === 2 && DASH_PENDING_FILENAME_PATTERN.test(filename)
}

export function isUploadApiPendingPath(storagePath: string): boolean {
  const segments = assertSafeLogicalStoragePath(storagePath).split('/')
  const filename = segments[segments.length - 1] ?? ''

  return segments.length === 2 && UPLOAD_API_PENDING_FILENAME_PATTERN.test(filename)
}

export function classifyStoragePath(storagePath: string): StoragePathClassification {
  const normalizedPath = assertSafeLogicalStoragePath(storagePath)
  const segments = normalizedPath.split('/')
  const filename = segments[segments.length - 1] ?? ''

  if (segments.length === 2 && DASH_PENDING_FILENAME_PATTERN.test(filename)) {
    return 'pending-dash'
  }

  if (segments.length === 2 && UPLOAD_API_PENDING_FILENAME_PATTERN.test(filename)) {
    return 'pending-upload-api'
  }

  if (segments.length === 3 && UUID_WITH_EXTENSION_PATTERN.test(filename)) {
    return 'formal'
  }

  return 'other'
}

function assertSafeSanitizedValue(value: string, label: string): void {
  if (!value) {
    throw new Error(`${label} must be non-empty after sanitization.`)
  }

  if (value === '.' || value === '..' || /^[._-]+$/.test(value)) {
    throw new Error(`${label} must contain at least one alphanumeric character.`)
  }
}

function pointsToPublicStorageRoot(root: string): boolean {
  const normalizedSegments = root
    .replace(/\\/g, '/')
    .split('/')
    .map(segment => segment.toLowerCase())
    .filter(Boolean)

  return normalizedSegments.some(segment => PUBLIC_ROOT_SEGMENTS.has(segment))
}
