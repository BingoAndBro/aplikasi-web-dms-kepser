// Server-only module. Do not import from client components.
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

import { assertSafeLogicalStoragePath } from '#/lib/storage/local-storage-paths'

export type FileAccessTokenPurpose = 'preview' | 'download'

export type FileAccessTokenPayload = {
  version: 1
  purpose: FileAccessTokenPurpose
  expiresAt: number
  issuedAt?: number
  logicalPath?: string
  documentId?: string
  lampiranIndex?: number
  archiveId?: string
  subjectUserId?: string
  sessionId?: string
  downloadFilename?: string
  contentDisposition?: 'inline' | 'attachment'
  statusCheck?: 'document' | 'archive'
}

const TOKEN_VERSION_SEGMENT = 'v1'
const TOKEN_SEPARATOR = '.'
const HMAC_ALGORITHM = 'sha256'
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
const SAFE_STRING_PATTERN = /^[A-Za-z0-9._/@ -]+$/
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i

const PAYLOAD_KEYS = [
  'version',
  'purpose',
  'expiresAt',
  'issuedAt',
  'logicalPath',
  'documentId',
  'lampiranIndex',
  'archiveId',
  'subjectUserId',
  'sessionId',
  'downloadFilename',
  'contentDisposition',
  'statusCheck',
] as const satisfies readonly (keyof FileAccessTokenPayload)[]

const ALLOWED_PAYLOAD_KEYS = new Set<string>(PAYLOAD_KEYS)
const SENSITIVE_CLAIM_KEYS = new Set([
  'absolutePath',
  'dbUrl',
  'env',
  'filesystemPath',
  'password',
  'passwordHash',
  'physicalPath',
  'rawSessionToken',
  'secret',
  'sessionToken',
  'sessionTokenHash',
  'signedUrl',
  'signingSecret',
  'storageRoot',
  'tokenHash',
])

export function signFileAccessToken(
  payload: FileAccessTokenPayload,
  secret: string,
): string {
  assertUsableSecret(secret)

  const validatedPayload = assertValidFileAccessTokenPayload(payload)
  const encodedPayload = toBase64url(Buffer.from(stableSerialize(validatedPayload), 'utf8'))
  const signature = signEncodedPayload(encodedPayload, secret)

  return [TOKEN_VERSION_SEGMENT, encodedPayload, signature].join(TOKEN_SEPARATOR)
}

export function verifyFileAccessToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): FileAccessTokenPayload | null {
  if (!isNonEmptyString(token) || !isNonEmptyString(secret)) {
    return null
  }

  const parts = token.split(TOKEN_SEPARATOR)
  if (parts.length !== 3) {
    return null
  }

  const [versionSegment, encodedPayload, signature] = parts
  if (
    versionSegment !== TOKEN_VERSION_SEGMENT
    || !isBase64url(encodedPayload)
    || !isBase64url(signature)
  ) {
    return null
  }

  const expectedSignature = signEncodedPayload(encodedPayload, secret)
  if (!timingSafeEqualBase64url(signature, expectedSignature)) {
    return null
  }

  try {
    const decodedPayload = JSON.parse(fromBase64url(encodedPayload).toString('utf8'))
    return assertValidFileAccessTokenPayload(decodedPayload, now)
  } catch {
    return null
  }
}

export function assertValidFileAccessTokenPayload(
  payload: unknown,
  now?: Date,
): FileAccessTokenPayload {
  if (!isPlainObject(payload)) {
    throw new Error('File access token payload must be an object.')
  }

  assertNoUnknownOrSensitiveClaims(payload)

  if (payload.version !== 1) {
    throw new Error('File access token version is not supported.')
  }

  if (!isFileAccessTokenPurpose(payload.purpose)) {
    throw new Error('File access token purpose is not supported.')
  }

  const expiresAt = assertTimestamp(payload.expiresAt, 'expiresAt')
  if (now && expiresAt <= now.getTime()) {
    throw new Error('File access token has expired.')
  }

  const validated: FileAccessTokenPayload = {
    version: 1,
    purpose: payload.purpose,
    expiresAt,
  }

  if (payload.issuedAt !== undefined) {
    const issuedAt = assertTimestamp(payload.issuedAt, 'issuedAt')
    if (issuedAt > expiresAt) {
      throw new Error('File access token issuedAt must not be after expiresAt.')
    }
    validated.issuedAt = issuedAt
  }

  if (payload.logicalPath !== undefined) {
    if (!isNonEmptyString(payload.logicalPath)) {
      throw new Error('File access token logicalPath must be a non-empty string.')
    }

    validated.logicalPath = assertSafeLogicalStoragePath(payload.logicalPath)
  }

  if (payload.documentId !== undefined) {
    validated.documentId = assertSafeClaimString(payload.documentId, 'documentId')
  }

  if (payload.lampiranIndex !== undefined) {
    validated.lampiranIndex = assertNonNegativeInteger(payload.lampiranIndex, 'lampiranIndex')
  }

  if (payload.archiveId !== undefined) {
    validated.archiveId = assertSafeClaimString(payload.archiveId, 'archiveId')
  }

  if (payload.subjectUserId !== undefined) {
    validated.subjectUserId = assertSafeClaimString(payload.subjectUserId, 'subjectUserId')
  }

  if (payload.sessionId !== undefined) {
    validated.sessionId = assertSafeClaimString(payload.sessionId, 'sessionId')
  }

  if (payload.downloadFilename !== undefined) {
    validated.downloadFilename = assertSafeClaimString(payload.downloadFilename, 'downloadFilename')
  }

  if (payload.contentDisposition !== undefined) {
    if (payload.contentDisposition !== 'inline' && payload.contentDisposition !== 'attachment') {
      throw new Error('File access token contentDisposition is not supported.')
    }
    validated.contentDisposition = payload.contentDisposition
  }

  if (payload.statusCheck !== undefined) {
    if (payload.statusCheck !== 'document' && payload.statusCheck !== 'archive') {
      throw new Error('File access token statusCheck is not supported.')
    }
    validated.statusCheck = payload.statusCheck
  }

  assertHasFileReference(validated)
  assertPurposeDispositionConsistency(validated)

  return validated
}

export function isFileAccessTokenPurpose(value: unknown): value is FileAccessTokenPurpose {
  return value === 'preview' || value === 'download'
}

function signEncodedPayload(encodedPayload: string, secret: string): string {
  return toBase64url(
    createHmac(HMAC_ALGORITHM, secret)
      .update(`${TOKEN_VERSION_SEGMENT}${TOKEN_SEPARATOR}${encodedPayload}`)
      .digest(),
  )
}

function stableSerialize(payload: FileAccessTokenPayload): string {
  const orderedPayload: Partial<FileAccessTokenPayload> = {}

  for (const key of PAYLOAD_KEYS) {
    const value = payload[key]
    if (value !== undefined) {
      Object.assign(orderedPayload, { [key]: value })
    }
  }

  return JSON.stringify(orderedPayload)
}

function assertNoUnknownOrSensitiveClaims(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (SENSITIVE_CLAIM_KEYS.has(key)) {
      throw new Error('File access token payload contains a sensitive claim.')
    }

    if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
      throw new Error('File access token payload contains an unsupported claim.')
    }
  }
}

function assertHasFileReference(payload: FileAccessTokenPayload): void {
  if (payload.logicalPath) return
  if (payload.archiveId) return
  if (payload.documentId && payload.lampiranIndex !== undefined) return

  throw new Error('File access token payload must identify a file reference.')
}

function assertPurposeDispositionConsistency(payload: FileAccessTokenPayload): void {
  if (payload.purpose === 'preview' && payload.contentDisposition === 'attachment') {
    throw new Error('Preview file access tokens must not request attachment disposition.')
  }

  if (payload.purpose === 'download' && payload.contentDisposition === 'inline') {
    throw new Error('Download file access tokens must not request inline disposition.')
  }
}

function assertTimestamp(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`File access token ${label} must be a non-negative integer timestamp.`)
  }

  return value
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`File access token ${label} must be a non-negative integer.`)
  }

  return value
}

function assertSafeClaimString(
  value: unknown,
  label: string,
): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`File access token ${label} must be a non-empty string.`)
  }

  const normalizedValue = value.trim()

  if (
    WINDOWS_DRIVE_PATTERN.test(normalizedValue)
    || URL_LIKE_PATTERN.test(normalizedValue)
    || normalizedValue.startsWith('/')
    || normalizedValue.startsWith('\\\\')
    || normalizedValue.includes('..')
    || normalizedValue.includes('\\')
  ) {
    throw new Error(`File access token ${label} must not contain filesystem paths or URLs.`)
  }

  if (normalizedValue.includes('/')) {
    throw new Error(`File access token ${label} must not contain path separators.`)
  }

  if (!SAFE_STRING_PATTERN.test(normalizedValue)) {
    throw new Error(`File access token ${label} contains unsupported characters.`)
  }

  return normalizedValue
}

function timingSafeEqualBase64url(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function assertUsableSecret(secret: string): void {
  if (!isNonEmptyString(secret)) {
    throw new Error('File access token secret must be a non-empty string.')
  }
}

function toBase64url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function isBase64url(value: string): boolean {
  return value.length > 0 && BASE64URL_PATTERN.test(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
