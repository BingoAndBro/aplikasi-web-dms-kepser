import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { ROLES, type RoleName } from '#/lib/constants/roles'
import {
  canAccessLogicalFilePath,
  getFileTokenSecret,
  handleInternalFileAccessRequest,
} from '#/lib/storage/internal-file-access'
import {
  signFileAccessToken,
  type FileAccessTokenPayload,
} from '#/lib/storage/file-access-token'

const TEST_SECRET = 'unit-test-internal-file-access-secret'
const NOW = Date.now()
const FUTURE = NOW + 15 * 60 * 1000
const TEST_ROOT = path.resolve('.tmp', 'internal-file-access-root')

function logicalPathPayload(
  overrides: Partial<FileAccessTokenPayload> = {},
): FileAccessTokenPayload {
  return {
    version: 1,
    purpose: 'preview',
    expiresAt: FUTURE,
    issuedAt: NOW,
    logicalPath: 'owner-user/document-id/file.pdf',
    contentDisposition: 'inline',
    ...overrides,
  }
}

function signedToken(payload: FileAccessTokenPayload): string {
  return signFileAccessToken(payload, TEST_SECRET)
}

function requestWithToken(token?: string): Request {
  const url = token
    ? `http://localhost/api/files/access?token=${encodeURIComponent(token)}`
    : 'http://localhost/api/files/access'

  return new Request(url)
}

function session(userId = 'owner-user', roles: RoleName[] = [ROLES.PEGAWAI]) {
  return { userId, roles }
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json()
}

describe('internal file access foundation', () => {
  it('rejects requests without a token query parameter', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(),
      session: session(),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(400)
    expect(await json(response)).toEqual({ error: 'Token parameter required' })
  })

  it('rejects invalid tokens before session authorization', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken('not-a-token'),
      session: null,
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(401)
    expect(await json(response)).toEqual({ error: 'Invalid or expired token' })
  })

  it('rejects a valid token when the local session is missing', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: null,
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(401)
    expect(await json(response)).toEqual({ error: 'Unauthorized' })
  })

  it('allows owner logical-path access through validation but does not stream yet', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(501)
    expect(await json(response)).toEqual({
      error: 'Local file streaming is not implemented yet',
    })
  })

  it('rejects non-owner logical-path access without a compatibility role', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('other-user', [ROLES.PEGAWAI]),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(403)
    expect(await json(response)).toEqual({ error: 'Akses ditolak' })
  })

  it('allows raw-path compatibility roles through validation but does not stream yet', async () => {
    for (const role of [ROLES.PPK, ROLES.BENDAHARA, ROLES.ARSIPARIS]) {
      const response = await handleInternalFileAccessRequest({
        request: requestWithToken(signedToken(logicalPathPayload())),
        session: session('other-user', [role]),
        secret: TEST_SECRET,
        root: TEST_ROOT,
      })

      expect(response.status).toBe(501)
      expect(await json(response)).toEqual({
        error: 'Local file streaming is not implemented yet',
      })
    }
  })

  it('keeps document and archive token access unsupported in this phase', async () => {
    const documentResponse = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload({
        logicalPath: undefined,
        documentId: 'document-123',
        lampiranIndex: 0,
        statusCheck: 'document',
      }))),
      session: session(),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    const archiveResponse = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload({
        logicalPath: undefined,
        archiveId: 'archive-123',
        statusCheck: 'archive',
      }))),
      session: session(),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(documentResponse.status).toBe(501)
    expect(archiveResponse.status).toBe(501)
    expect(await json(documentResponse)).toEqual({
      error: 'Token type is not supported by this access route foundation yet',
    })
    expect(await json(archiveResponse)).toEqual({
      error: 'Token type is not supported by this access route foundation yet',
    })
  })

  it('does not expose the resolved root in error responses', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(JSON.stringify(await json(response))).not.toContain(TEST_ROOT)
  })

  it('checks owner and role policy as pure helper logic', () => {
    expect(canAccessLogicalFilePath(session('owner-user'), 'owner-user/file.pdf')).toBe(true)
    expect(canAccessLogicalFilePath(session('other-user'), 'owner-user/file.pdf')).toBe(false)
    expect(canAccessLogicalFilePath(session('other-user', [ROLES.PPK]), 'owner-user/file.pdf')).toBe(true)
  })

  it('reads the file token secret lazily without fallback defaults', () => {
    expect(getFileTokenSecret({ DMS_FILE_TOKEN_SECRET: ' configured-secret ' })).toBe('configured-secret')
    expect(() => getFileTokenSecret({})).toThrow('not configured')
  })
})
