// Server-only module. Do not import from client components.
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { ROLES, type RoleName } from '#/lib/constants/roles'
import type { LocalServerSession } from '#/lib/auth/local-server-auth'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
  storagePathBelongsToUser,
} from '#/lib/storage/local-storage-paths'
import {
  verifyFileAccessToken,
  type FileAccessTokenPayload,
} from '#/lib/storage/file-access-token'

const FILE_TOKEN_SECRET_ENV = 'DMS_FILE_TOKEN_SECRET'
const RAW_PATH_COMPATIBILITY_ROLES: readonly RoleName[] = [
  ROLES.PPK,
  ROLES.BENDAHARA,
  ROLES.ARSIPARIS,
]
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
}
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i
const FALLBACK_FILENAME = 'download'

type FileAccessSession = Pick<LocalServerSession, 'userId' | 'roles' | 'sessionId'>
type FileReferenceResult =
  | { ok: true; logicalPath: string }
  | { ok: false; status: number; message: string }

export type InternalFileAccessOptions = {
  request: Request
  session: FileAccessSession | null
  secret: string
  root?: string
}

export function getFileTokenSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env[FILE_TOKEN_SECRET_ENV]?.trim()

  if (!secret) {
    throw new Error('File access token secret is not configured.')
  }

  return secret
}

export async function handleInternalFileAccessRequest({
  request,
  session,
  secret,
  root,
}: InternalFileAccessOptions): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token')

  if (!token) {
    return jsonError('Token parameter required', 400)
  }

  const payload = verifyFileAccessToken(token, secret)
  if (!payload) {
    return jsonError('Invalid or expired token', 401)
  }

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  let logicalPath: string
  if (isSupportedLogicalPathToken(payload)) {
    logicalPath = payload.logicalPath
    if (!canAccessLogicalFilePath(session, logicalPath)) {
      return jsonError('Akses ditolak', 403)
    }
  } else if (isSupportedDocumentToken(payload)) {
    const resolved = await resolveDocumentTokenLogicalPath({ payload, session })
    if (!resolved.ok) {
      return jsonError(resolved.message, resolved.status)
    }
    logicalPath = resolved.logicalPath
  } else {
    return jsonError('Token type is not supported by this access route foundation yet', 501)
  }

  let physicalPath: string
  try {
    logicalPath = assertSafeLogicalStoragePath(logicalPath)
    physicalPath = resolvePhysicalStoragePath(root ?? getLocalStorageRoot(), logicalPath)
  } catch {
    return jsonError('File access path is not available', 500)
  }

  return await readLocalLogicalPathFile({
    logicalPath,
    physicalPath,
    payload,
  })
}

export function canAccessLogicalFilePath(
  session: FileAccessSession,
  logicalPath: string,
): boolean {
  if (storagePathBelongsToUser(logicalPath, session.userId)) {
    return true
  }

  return RAW_PATH_COMPATIBILITY_ROLES.some(role => session.roles.includes(role))
}

function isSupportedLogicalPathToken(
  payload: FileAccessTokenPayload,
): payload is FileAccessTokenPayload & { logicalPath: string } {
  return Boolean(payload.logicalPath)
    && !payload.documentId
    && payload.lampiranIndex === undefined
    && !payload.archiveId
    && !payload.statusCheck
}

function isSupportedDocumentToken(
  payload: FileAccessTokenPayload,
): payload is FileAccessTokenPayload & { documentId: string; lampiranIndex: number } {
  return Boolean(payload.documentId)
    && payload.lampiranIndex !== undefined
    && payload.statusCheck === 'document'
    && !payload.logicalPath
    && !payload.archiveId
}

async function resolveDocumentTokenLogicalPath({
  payload,
  session,
}: {
  payload: FileAccessTokenPayload & { documentId: string; lampiranIndex: number }
  session: FileAccessSession
}): Promise<FileReferenceResult> {
  const { resolveDocumentLampiranAccessForToken } = await import(
    '#/lib/storage/document-file-access'
  )

  return await resolveDocumentLampiranAccessForToken({ payload, session })
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, {
    status,
    headers: secureHeaders(),
  })
}

async function readLocalLogicalPathFile({
  logicalPath,
  physicalPath,
  payload,
}: {
  logicalPath: string
  physicalPath: string
  payload: FileAccessTokenPayload
}): Promise<Response> {
  try {
    const fileStat = await stat(physicalPath)
    if (!fileStat.isFile()) {
      return jsonError('File not found', 404)
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return jsonError('File not found', 404)
    }

    return jsonError('File access failed', 500)
  }

  let fileContent: Buffer
  try {
    fileContent = await readFile(physicalPath)
  } catch {
    return jsonError('File access failed', 500)
  }

  const headers = secureHeaders()
  headers.set('Content-Type', inferContentType(logicalPath))
  headers.set('Content-Disposition', buildContentDisposition(payload, logicalPath))
  headers.set('Content-Length', String(fileContent.byteLength))

  return new Response(fileContent, {
    status: 200,
    headers,
  })
}

function secureHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
}

function inferContentType(logicalPath: string): string {
  return CONTENT_TYPE_BY_EXTENSION[path.extname(logicalPath).toLowerCase()]
    ?? 'application/octet-stream'
}

function buildContentDisposition(
  payload: FileAccessTokenPayload,
  logicalPath: string,
): string {
  const disposition = payload.contentDisposition
    ?? (payload.purpose === 'download' ? 'attachment' : 'inline')
  const filename = resolveResponseFilename(payload, logicalPath)

  return `${disposition}; filename="${filename}"`
}

function resolveResponseFilename(
  payload: FileAccessTokenPayload,
  logicalPath: string,
): string {
  const explicitFilename = payload.downloadFilename
    ? sanitizeContentDispositionFilename(payload.downloadFilename)
    : null

  if (explicitFilename) {
    return explicitFilename
  }

  const logicalLeaf = logicalPath.split('/').pop() ?? ''

  return sanitizeContentDispositionFilename(logicalLeaf) ?? FALLBACK_FILENAME
}

function sanitizeContentDispositionFilename(filename: string): string | null {
  const trimmed = filename.trim()

  if (
    !trimmed
    || trimmed === '.'
    || trimmed === '..'
    || trimmed.includes('/')
    || trimmed.includes('\\')
    || trimmed.includes('\r')
    || trimmed.includes('\n')
    || trimmed.includes('"')
    || trimmed.includes('..')
    || path.isAbsolute(trimmed)
    || WINDOWS_DRIVE_PATTERN.test(trimmed)
    || URL_LIKE_PATTERN.test(trimmed)
  ) {
    return null
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim()

  if (
    !sanitized
    || sanitized === '.'
    || sanitized === '..'
    || sanitized.includes('..')
  ) {
    return null
  }

  return sanitized
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}
