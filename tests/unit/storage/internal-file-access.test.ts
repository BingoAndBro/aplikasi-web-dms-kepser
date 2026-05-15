import path from 'node:path'
import { createHmac } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const PDF_CONTENT = '%PDF-1.4 local test file'

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

function manuallySignedToken(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', TEST_SECRET)
    .update(`v1.${encodedPayload}`)
    .digest('base64url')

  return `v1.${encodedPayload}.${signature}`
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
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

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

  it('streams local PDF file content for an owner raw preview token', async () => {
    await writeTestFile('owner-user/document-id/file.pdf', PDF_CONTENT)

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="file.pdf"')
    expect(await response.text()).toBe(PDF_CONTENT)
  })

  it('uses attachment disposition and a safe download filename for raw download tokens', async () => {
    await writeTestFile('owner-user/document-id/file.pdf', PDF_CONTENT)

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload({
        purpose: 'download',
        contentDisposition: 'attachment',
        downloadFilename: 'safe-report.pdf',
      }))),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="safe-report.pdf"',
    )
    expect(await response.text()).toBe(PDF_CONTENT)
  })

  it('does not reflect CR, LF, or quote injection from an unsafe download filename', async () => {
    const response = await responseWithMockedVerifiedDownloadFilename(
      'unsafe"\r\nContent-Type: text/html.pdf',
    )
    const contentDisposition = response.headers.get('Content-Disposition')
    const filename = expectSafeAttachmentFilename(contentDisposition)

    expect(response.status).toBe(200)
    expect(filename).toBe('file.pdf')
    expect(contentDisposition).not.toContain('unsafe')
    expect(contentDisposition).not.toContain('Content-Type')
  })

  it('falls back for unsafe path-like, traversal, Windows, and URL-like download filenames', async () => {
    for (const unsafeFilename of [
      'folder/report.pdf',
      '..\\report.pdf',
      'C:\\storage\\report.pdf',
      'https://example.test/report.pdf',
    ]) {
      const response = await responseWithMockedVerifiedDownloadFilename(unsafeFilename)
      const filename = expectSafeAttachmentFilename(response.headers.get('Content-Disposition'))

      expect(response.status).toBe(200)
      expect(filename).toBe('file.pdf')
    }
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

  it('allows raw-path compatibility roles to stream local files', async () => {
    await writeTestFile('owner-user/document-id/file.pdf', PDF_CONTENT)

    for (const role of [ROLES.PPK, ROLES.BENDAHARA, ROLES.ARSIPARIS]) {
      const response = await handleInternalFileAccessRequest({
        request: requestWithToken(signedToken(logicalPathPayload())),
        session: session('other-user', [role]),
        secret: TEST_SECRET,
        root: TEST_ROOT,
      })

      expect(response.status).toBe(200)
      expect(await response.text()).toBe(PDF_CONTENT)
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

  it('returns a generic 404 for missing local files without path details', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })
    const bodyText = JSON.stringify(await json(response))

    expect(response.status).toBe(404)
    expect(bodyText).toBe('{"error":"File not found"}')
    expect(bodyText).not.toContain('owner-user')
    expect(bodyText).not.toContain('file.pdf')
    expect(bodyText).not.toContain(TEST_ROOT)
  })

  it('rejects unauthorized non-owner PEGAWAI before checking file existence', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('other-user', [ROLES.PEGAWAI]),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(403)
    expect(await json(response)).toEqual({ error: 'Akses ditolak' })
  })

  it('rejects traversal logical paths before file access', async () => {
    const token = manuallySignedToken({
      version: 1,
      purpose: 'preview',
      expiresAt: FUTURE,
      issuedAt: NOW,
      logicalPath: 'owner-user/../file.pdf',
      contentDisposition: 'inline',
    })

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(token),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })

    expect(response.status).toBe(401)
    expect(await json(response)).toEqual({ error: 'Invalid or expired token' })
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

async function writeTestFile(logicalPath: string, content: string): Promise<void> {
  const targetPath = path.join(TEST_ROOT, ...logicalPath.split('/'))

  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)
}

async function responseWithMockedVerifiedDownloadFilename(
  downloadFilename: string,
): Promise<Response> {
  await writeTestFile('owner-user/document-id/file.pdf', PDF_CONTENT)
  vi.resetModules()
  vi.doMock('#/lib/storage/file-access-token', async importOriginal => {
    const actual = await importOriginal<typeof import('#/lib/storage/file-access-token')>()

    return {
      ...actual,
      verifyFileAccessToken: vi.fn(() => logicalPathPayload({
        purpose: 'download',
        contentDisposition: 'attachment',
        downloadFilename,
      })),
    }
  })

  try {
    const { handleInternalFileAccessRequest: mockedHandler } = await import(
      '#/lib/storage/internal-file-access'
    )

    return await mockedHandler({
      request: requestWithToken('opaque-test-token'),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })
  } finally {
    vi.doUnmock('#/lib/storage/file-access-token')
    vi.resetModules()
  }
}

function expectSafeAttachmentFilename(contentDisposition: string | null): string {
  expect(contentDisposition).toMatch(/^attachment; filename="[^"]+"$/)

  const filename = contentDisposition?.match(/^attachment; filename="([^"]+)"$/)?.[1] ?? ''

  expect(filename).not.toContain('\r')
  expect(filename).not.toContain('\n')
  expect(filename).not.toContain('"')
  expect(filename).not.toContain('/')
  expect(filename).not.toContain('\\')
  expect(filename).not.toContain('..')
  expect(filename).not.toContain(TEST_ROOT)
  expect(filename).not.toMatch(/^[a-z][a-z0-9+.-]*:/i)
  expect(filename).not.toMatch(/^[a-z]:[\\/]/i)
  expect(path.isAbsolute(filename)).toBe(false)

  return filename
}
