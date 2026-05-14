// Server-only module. Do not import from client components.
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

type FileAccessSession = Pick<LocalServerSession, 'userId' | 'roles'>

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

  if (!isSupportedLogicalPathToken(payload)) {
    return jsonError('Token type is not supported by this access route foundation yet', 501)
  }

  let logicalPath: string
  try {
    logicalPath = assertSafeLogicalStoragePath(payload.logicalPath)
    resolvePhysicalStoragePath(root ?? getLocalStorageRoot(), logicalPath)
  } catch {
    return jsonError('File access path is not available', 500)
  }

  if (!canAccessLogicalFilePath(session, logicalPath)) {
    return jsonError('Akses ditolak', 403)
  }

  return jsonError('Local file streaming is not implemented yet', 501)
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

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
