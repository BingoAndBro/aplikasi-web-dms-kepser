// Server-only module. Do not import from client components.
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

import {
  assertSafeLogicalStoragePath,
  getFileExtension,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
  sanitizeStoragePathSegment,
} from '#/lib/storage/local-storage-paths'

export const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024

export const PROFILE_AVATAR_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type ProfileAvatarMimeType = typeof PROFILE_AVATAR_ALLOWED_MIME_TYPES[number]
export type ProfileAvatarExtension = 'jpg' | 'jpeg' | 'png' | 'webp'

export type ProfileAvatarFileMetadata = {
  name: string
  type: string
  size: number
}

export type ValidatedProfileAvatar = {
  mimeType: ProfileAvatarMimeType
  extension: ProfileAvatarExtension
  size: number
}

export type StoredProfileAvatar = ValidatedProfileAvatar & {
  storageKey: string
}

export class ProfileAvatarError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid-content-size'
      | 'invalid-file-extension'
      | 'invalid-file-name'
      | 'invalid-file-size'
      | 'invalid-file-signature'
      | 'invalid-file-type'
      | 'invalid-owner-id'
      | 'read-failed'
      | 'target-exists'
      | 'write-failed',
  ) {
    super(message)
    this.name = 'ProfileAvatarError'
  }
}

const EXTENSIONS_BY_MIME_TYPE: Record<ProfileAvatarMimeType, readonly ProfileAvatarExtension[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
}

const PRIMARY_EXTENSION_BY_MIME_TYPE: Record<ProfileAvatarMimeType, ProfileAvatarExtension> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const AVATAR_ROOT_SEGMENT = 'profile-avatars'
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i

export function createProfileAvatarUrl(avatarUpdatedAt?: Date | string | null): string | null {
  if (!avatarUpdatedAt) return null

  const updatedAt = avatarUpdatedAt instanceof Date
    ? avatarUpdatedAt.toISOString()
    : avatarUpdatedAt

  return `/api/users/me?avatar=1&v=${encodeURIComponent(updatedAt)}`
}

/**
 * Cache-busted avatar URL for an arbitrary user, used by admin surfaces
 * (e.g. the user management table) via the admin-only avatar endpoint.
 */
export function createUserAvatarUrl(
  userId: string,
  avatarUpdatedAt?: Date | string | null,
): string | null {
  if (!avatarUpdatedAt) return null

  const updatedAt = avatarUpdatedAt instanceof Date
    ? avatarUpdatedAt.toISOString()
    : avatarUpdatedAt

  return `/api/users/${encodeURIComponent(userId)}/avatar?v=${encodeURIComponent(updatedAt)}`
}

export function isAllowedProfileAvatarResponseMimeType(
  value: string | null | undefined,
): value is ProfileAvatarMimeType {
  return typeof value === 'string' && isAllowedProfileAvatarMimeType(value)
}

export function validateProfileAvatarFileMetadata(
  file: ProfileAvatarFileMetadata,
): ValidatedProfileAvatar {
  const extension = getSafeAvatarExtension(file.name, file.type)

  if (!isAllowedProfileAvatarMimeType(file.type)) {
    throw new ProfileAvatarError('Profile avatar file type is not allowed.', 'invalid-file-type')
  }

  if (!EXTENSIONS_BY_MIME_TYPE[file.type].includes(extension)) {
    throw new ProfileAvatarError('Profile avatar file extension does not match type.', 'invalid-file-extension')
  }

  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new ProfileAvatarError('Profile avatar file size is invalid.', 'invalid-file-size')
  }

  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    throw new ProfileAvatarError('Profile avatar file exceeds the maximum allowed size.', 'invalid-file-size')
  }

  return {
    mimeType: file.type,
    extension,
    size: file.size,
  }
}

export async function writeProfileAvatarContent({
  ownerUserId,
  file,
  content,
  previousStorageKey,
  root,
}: {
  ownerUserId: string
  file: ProfileAvatarFileMetadata
  content: ArrayBuffer | Uint8Array | Buffer
  previousStorageKey?: string | null
  root?: string
}): Promise<StoredProfileAvatar> {
  const validated = validateProfileAvatarFileMetadata(file)
  const contentBuffer = toBuffer(content)

  if (contentBuffer.byteLength !== validated.size || contentBuffer.byteLength > PROFILE_AVATAR_MAX_BYTES) {
    throw new ProfileAvatarError('Profile avatar content length is invalid.', 'invalid-content-size')
  }

  if (!matchesDeclaredImageSignature(contentBuffer, validated.mimeType)) {
    throw new ProfileAvatarError('Profile avatar signature is invalid.', 'invalid-file-signature')
  }

  const storageKey = generateProfileAvatarStorageKey(ownerUserId, validated.extension)
  const storageRoot = root ?? getLocalStorageRoot()
  const physicalPath = resolvePhysicalStoragePath(storageRoot, storageKey)
  let openedTarget = false
  let handle: Awaited<ReturnType<typeof open>> | null = null

  try {
    await mkdir(path.dirname(physicalPath), { recursive: true })
    handle = await open(physicalPath, 'wx')
    openedTarget = true
    await handle.writeFile(contentBuffer)
    await handle.close()
    handle = null
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined)
    }

    if (openedTarget) {
      await rm(physicalPath, { force: true }).catch(() => undefined)
    }

    if (isNodeErrorCode(error, 'EEXIST')) {
      throw new ProfileAvatarError('Profile avatar target already exists.', 'target-exists')
    }

    if (error instanceof ProfileAvatarError) {
      throw error
    }

    throw new ProfileAvatarError('Profile avatar write failed.', 'write-failed')
  }

  if (previousStorageKey && previousStorageKey !== storageKey) {
    await removeProfileAvatarContent(previousStorageKey, { root: storageRoot })
  }

  return {
    ...validated,
    storageKey,
  }
}

export async function readProfileAvatarContent(
  storageKey: string,
  options: { root?: string } = {},
): Promise<Buffer | null> {
  try {
    const normalizedKey = assertProfileAvatarStorageKey(storageKey)
    const physicalPath = resolvePhysicalStoragePath(options.root ?? getLocalStorageRoot(), normalizedKey)

    return await readFile(physicalPath)
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) return null
    if (error instanceof ProfileAvatarError) throw error
    throw new ProfileAvatarError('Profile avatar read failed.', 'read-failed')
  }
}

export async function removeProfileAvatarContent(
  storageKey: string,
  options: { root?: string } = {},
): Promise<void> {
  const normalizedKey = assertProfileAvatarStorageKey(storageKey)
  const physicalPath = resolvePhysicalStoragePath(options.root ?? getLocalStorageRoot(), normalizedKey)

  await rm(physicalPath, { force: true }).catch(() => undefined)
}

export function assertProfileAvatarStorageKey(storageKey: string): string {
  const normalized = assertSafeLogicalStoragePath(storageKey)
  const segments = normalized.split('/')

  if (
    segments.length !== 3
    || segments[0] !== AVATAR_ROOT_SEGMENT
    || sanitizeStoragePathSegment(segments[1] ?? '') !== segments[1]
    || !/^[0-9a-f-]+\.(jpg|jpeg|png|webp)$/i.test(segments[2] ?? '')
  ) {
    throw new ProfileAvatarError('Profile avatar storage key is invalid.', 'invalid-file-name')
  }

  return normalized
}

function generateProfileAvatarStorageKey(ownerUserId: string, extension: ProfileAvatarExtension): string {
  const ownerSegment = sanitizeStoragePathSegment(ownerUserId.trim())

  if (ownerSegment !== ownerUserId.trim()) {
    throw new ProfileAvatarError('Profile avatar owner segment is invalid.', 'invalid-owner-id')
  }

  return assertSafeLogicalStoragePath(`${AVATAR_ROOT_SEGMENT}/${ownerSegment}/${randomUUID()}.${extension}`)
}

function getSafeAvatarExtension(filename: string, mimeType: string): ProfileAvatarExtension {
  const sanitizedFilename = sanitizeAvatarFilename(filename)
  const extension = getFileExtension(sanitizedFilename)

  if (!extension) {
    if (isAllowedProfileAvatarMimeType(mimeType)) {
      return PRIMARY_EXTENSION_BY_MIME_TYPE[mimeType]
    }

    throw new ProfileAvatarError('Profile avatar file extension is missing.', 'invalid-file-extension')
  }

  if (!isAllowedProfileAvatarExtension(extension)) {
    throw new ProfileAvatarError('Profile avatar file extension is not allowed.', 'invalid-file-extension')
  }

  return extension
}

function sanitizeAvatarFilename(filename: string): string {
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
    throw new ProfileAvatarError('Profile avatar filename is unsafe.', 'invalid-file-name')
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function isAllowedProfileAvatarMimeType(value: string): value is ProfileAvatarMimeType {
  return PROFILE_AVATAR_ALLOWED_MIME_TYPES.includes(value as ProfileAvatarMimeType)
}

function isAllowedProfileAvatarExtension(value: string): value is ProfileAvatarExtension {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(value)
}

function matchesDeclaredImageSignature(buffer: Buffer, mimeType: ProfileAvatarMimeType): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff
  }

  if (mimeType === 'image/png') {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a
  }

  return buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
}

function toBuffer(content: ArrayBuffer | Uint8Array | Buffer): Buffer {
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content)
  }

  return Buffer.from(content.buffer, content.byteOffset, content.byteLength)
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}
