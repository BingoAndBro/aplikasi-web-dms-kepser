import path from 'node:path'
import { createHmac } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ROLES, type RoleName } from '#/lib/constants/roles'
import {
  authorizeRawLogicalPathAccess,
  canAccessLogicalFilePath,
  getFileTokenSecret,
  handleInternalFileAccessRequest,
  type RawLogicalPathAccessContext,
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

function documentPayload(
  overrides: Partial<FileAccessTokenPayload> = {},
): FileAccessTokenPayload {
  return {
    version: 1,
    purpose: 'preview',
    expiresAt: FUTURE,
    issuedAt: NOW,
    documentId: '11111111-1111-4111-8111-111111111111',
    lampiranIndex: 0,
    subjectUserId: 'owner-user',
    sessionId: 'unit-test-session',
    statusCheck: 'document',
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
  return { userId, roles, sessionId: 'unit-test-session' }
}

function rawContext(
  overrides: Partial<RawLogicalPathAccessContext> = {},
): RawLogicalPathAccessContext {
  return {
    documents: [],
    folders: [],
    ...overrides,
  }
}

function rawContextResolver(context: RawLogicalPathAccessContext = rawContext()) {
  return vi.fn(async () => context)
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
      rawLogicalPathAccessContextResolver: rawContextResolver(),
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
      rawLogicalPathAccessContextResolver: rawContextResolver(),
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
      rawLogicalPathAccessContextResolver: rawContextResolver(),
    })

    expect(response.status).toBe(403)
    expect(await json(response)).toEqual({ error: 'Akses ditolak' })
  })

  it('allows raw-path compatibility roles to stream local files', async () => {
    await writeTestFile('owner-user/document-id/file.pdf', PDF_CONTENT)

    const compatibleRoleCases: Array<{
      role: RoleName
      status: string
      revisionTarget?: string | null
    }> = [
      { role: ROLES.PPK, status: 'IN_PPK_VALIDATION' },
      { role: ROLES.BENDAHARA, status: 'IN_BENDAHARA_APPROVAL' },
      { role: ROLES.KEPALA_SUB_BAGIAN_UMUM, status: 'COMPLETED' },
    ]

    for (const { role, status, revisionTarget = null } of compatibleRoleCases) {
      const response = await handleInternalFileAccessRequest({
        request: requestWithToken(signedToken(logicalPathPayload())),
        session: session('other-user', [role]),
        secret: TEST_SECRET,
        root: TEST_ROOT,
        rawLogicalPathAccessContextResolver: rawContextResolver(rawContext({
          documents: [{
            id: 'document-id',
            createdBy: 'owner-user',
            status,
            revisionTarget,
            lampiranDibersihkanAt: null,
          }],
        })),
      })

      expect(response.status).toBe(200)
      expect(await response.text()).toBe(PDF_CONTENT)
    }
  })

  it('keeps archive token access unsupported in this raw access foundation', async () => {
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

    expect(archiveResponse.status).toBe(501)
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
      rawLogicalPathAccessContextResolver: rawContextResolver(),
    })
    const bodyText = JSON.stringify(await json(response))

    expect(response.status).toBe(404)
    expect(bodyText).toBe('{"error":"File not found"}')
    expect(bodyText).not.toContain('owner-user')
    expect(bodyText).not.toContain('file.pdf')
    expect(bodyText).not.toContain(TEST_ROOT)
  })

  it('keeps document-token missing files as generic 404 when the document is not in a DIMUSNAHKAN berkas', async () => {
    const response = await handleDocumentTokenRequestWithMockedContext({
      document: {
        id: '11111111-1111-4111-8111-111111111111',
        createdBy: 'owner-user',
        status: 'COMPLETED',
        revisionTarget: null,
        lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
      },
      destroyedBerkasMembership: false,
    })
    const bodyText = JSON.stringify(await json(response))

    expect(response.status).toBe(404)
    expect(bodyText).toBe('{"error":"File not found"}')
    expectNoSensitiveFileAccessLeak(bodyText)
  })

  it('returns destroyed-file copy for document-token files whose folder-first berkas is DIMUSNAHKAN', async () => {
    const response = await handleDocumentTokenRequestWithMockedContext({
      document: {
        id: '11111111-1111-4111-8111-111111111111',
        createdBy: 'owner-user',
        status: 'COMPLETED',
        revisionTarget: null,
        lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
      },
      destroyedBerkasMembership: true,
    })
    const bodyText = JSON.stringify(await json(response))

    expect(response.status).toBe(410)
    expect(bodyText).toBe('{"error":"Data file sudah dimusnahkan"}')
    expectNoSensitiveFileAccessLeak(bodyText)
  })

  it('rejects unauthorized non-owner PEGAWAI before checking file existence', async () => {
    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('other-user', [ROLES.PEGAWAI]),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(),
    })

    expect(response.status).toBe(403)
    expect(await json(response)).toEqual({ error: 'Akses ditolak' })
  })

  it('rejects ADMIN-only raw governed access even when ADMIN appears to be the document owner', async () => {
    await writeTestFile('admin-user/document-id/file.pdf', PDF_CONTENT)

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload({
        logicalPath: 'admin-user/document-id/file.pdf',
      }))),
      session: session('admin-user', [ROLES.ADMIN]),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(rawContext({
        documents: [{
          id: 'document-id',
          createdBy: 'admin-user',
          status: 'COMPLETED',
          revisionTarget: null,
          lampiranDibersihkanAt: null,
        }],
      })),
    })

    expect(response.status).toBe(403)
    expect(await json(response)).toEqual({ error: 'Akses ditolak' })
  })

  it('rejects ADMIN-only raw owner-prefix fallback for ungoverned logical paths', async () => {
    await writeTestFile('admin-user/document-id/file.pdf', PDF_CONTENT)

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload({
        logicalPath: 'admin-user/document-id/file.pdf',
      }))),
      session: session('admin-user', [ROLES.ADMIN]),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(),
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
    expect(canAccessLogicalFilePath(session('admin-user', [ROLES.ADMIN]), 'admin-user/file.pdf')).toBe(false)
  })

  it('blocks raw token access when current archive state is DIMUSNAHKAN', async () => {
    await writeTestFile('owner-user/document-id/file.pdf', PDF_CONTENT)

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(rawContext({
        documents: [{
          id: 'document-id',
          createdBy: 'owner-user',
          status: 'ARCHIVED',
          revisionTarget: null,
          lampiranDibersihkanAt: null,
        }],
        folders: [{
          id: 'berkas-id',
          statusBerkas: 'CLOSED',
          statusArsip: 'DIMUSNAHKAN',
        }],
      })),
    })

    expect(response.status).toBe(410)
    expect(await json(response)).toEqual({
      error: 'Data file sudah dimusnahkan',
    })
  })

  it('blocks raw token access when the document\'s lampiran has been cleaned (non-material pembersihan)', async () => {
    await writeTestFile('owner-user/document-id/file.pdf', PDF_CONTENT)

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload())),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(rawContext({
        documents: [{
          id: 'document-id',
          createdBy: 'owner-user',
          status: 'TERSIMPAN',
          revisionTarget: null,
          lampiranDibersihkanAt: '2026-01-01T00:00:00.000Z',
        }],
      })),
    })

    expect(response.status).toBe(410)
    expect(await json(response)).toEqual({
      error: 'Data file sudah dibersihkan',
    })
  })

  it('rejects stale raw tokens after archive status changes to DIMUSNAHKAN', async () => {
    await writeTestFile('owner-user/document-id/file.pdf', PDF_CONTENT)
    const staleToken = signedToken(logicalPathPayload({
      issuedAt: NOW - 60_000,
      expiresAt: FUTURE,
    }))

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(staleToken),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(rawContext({
        documents: [{
          id: 'document-id',
          createdBy: 'owner-user',
          status: 'ARCHIVED',
          revisionTarget: null,
          lampiranDibersihkanAt: null,
        }],
        folders: [{
          id: 'berkas-id',
          statusBerkas: 'CLOSED',
          statusArsip: 'DIMUSNAHKAN',
        }],
      })),
    })

    expect(response.status).toBe(410)
  })

  it('keeps pending raw paths strictly owner-scoped', async () => {
    const pendingPath = 'owner-user/1777964598700-random-report.pdf'
    await writeTestFile(pendingPath, PDF_CONTENT)

    const ownerResponse = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload({ logicalPath: pendingPath }))),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(),
    })
    const roleResponse = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload({ logicalPath: pendingPath }))),
      session: session('other-user', [ROLES.PPK]),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(),
    })

    expect(ownerResponse.status).toBe(200)
    expect(roleResponse.status).toBe(403)
    expect(await json(roleResponse)).toEqual({ error: 'Akses ditolak' })
  })

  it('rejects ADMIN-only pending raw paths even when the path belongs to ADMIN', async () => {
    const pendingPath = 'admin-user/1777964598700-random-report.pdf'
    await writeTestFile(pendingPath, PDF_CONTENT)

    const response = await handleInternalFileAccessRequest({
      request: requestWithToken(signedToken(logicalPathPayload({ logicalPath: pendingPath }))),
      session: session('admin-user', [ROLES.ADMIN]),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: rawContextResolver(),
    })

    expect(response.status).toBe(403)
    expect(await json(response)).toEqual({ error: 'Akses ditolak' })
  })

  it('authorizes raw governed paths from current document state instead of path prefix alone', async () => {
    const decision = await authorizeRawLogicalPathAccess({
      session: session('ppk-user', [ROLES.PPK]),
      logicalPath: 'owner-user/document-id/file.pdf',
      resolver: rawContextResolver(rawContext({
        documents: [{
          id: 'document-id',
          createdBy: 'owner-user',
          status: 'IN_PPK_VALIDATION',
          revisionTarget: null,
          lampiranDibersihkanAt: null,
        }],
      })),
    })

    expect(decision).toEqual({ ok: true })
  })

  it('rejects ADMIN-only document-token access even when ADMIN appears to be document owner', async () => {
    const result = await resolveDocumentTokenWithMockedContext({
      document: {
        id: '11111111-1111-4111-8111-111111111111',
        createdBy: 'admin-user',
        status: 'COMPLETED',
        revisionTarget: null,
        lampiranUrls: [{ url: 'admin-user/document-id/file.pdf' }],
      },
      session: session('admin-user', [ROLES.ADMIN]),
    })

    expect(result).toEqual({ ok: false, status: 403, message: 'Akses ditolak' })
  })

  it('allows operational document-token access for completed documents', async () => {
    const result = await resolveDocumentTokenWithMockedContext({
      document: {
        id: '11111111-1111-4111-8111-111111111111',
        createdBy: 'owner-user',
        status: 'COMPLETED',
        revisionTarget: null,
        lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
      },
      session: session('kasubag-user', [ROLES.KEPALA_SUB_BAGIAN_UMUM]),
    })

    expect(result).toEqual({ ok: true, logicalPath: 'owner-user/document-id/file.pdf' })
  })

  it('does not require old canonical archive snapshots for document-token access', async () => {
    const result = await resolveDocumentTokenWithMockedContext({
      document: {
        id: '11111111-1111-4111-8111-111111111111',
        createdBy: 'owner-user',
        status: 'ARCHIVED',
        revisionTarget: null,
        lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
      },
      session: session('owner-user', [ROLES.PEGAWAI]),
    })

    expect(result).toEqual({ ok: true, logicalPath: 'owner-user/document-id/file.pdf' })
  })

  it('blocks document-token access when folder-first berkas membership is DIMUSNAHKAN', async () => {
    const result = await resolveDocumentTokenWithMockedContext({
      document: {
        id: '11111111-1111-4111-8111-111111111111',
        createdBy: 'owner-user',
        status: 'COMPLETED',
        revisionTarget: null,
        lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
      },
      destroyedBerkasMembership: true,
      session: session('owner-user', [ROLES.PEGAWAI]),
    })

    expect(result).toEqual({
      ok: false,
      status: 410,
      message: 'Data file sudah dimusnahkan',
    })
  })

  it('does not reveal destroyed berkas membership to unauthorized document-token users', async () => {
    const result = await resolveDocumentTokenWithMockedContext({
      document: {
        id: '11111111-1111-4111-8111-111111111111',
        createdBy: 'owner-user',
        status: 'COMPLETED',
        revisionTarget: null,
        lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
      },
      destroyedBerkasMembership: true,
      session: session('other-user', [ROLES.PEGAWAI]),
    })

    expect(result).toEqual({ ok: false, status: 403, message: 'Akses ditolak' })
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
      rawLogicalPathAccessContextResolver: rawContextResolver(),
    })
  } finally {
    vi.doUnmock('#/lib/storage/file-access-token')
    vi.resetModules()
  }
}

async function handleDocumentTokenRequestWithMockedContext({
  document,
  destroyedBerkasMembership = false,
}: {
  document: MockDocumentAccessDocument
  destroyedBerkasMembership?: boolean
}): Promise<Response> {
  vi.resetModules()
  vi.doMock('#/db/client', () => ({
    db: createDocumentAccessDbMock(document, destroyedBerkasMembership),
  }))

  try {
    const { handleInternalFileAccessRequest: mockedHandler } = await import(
      '#/lib/storage/internal-file-access'
    )

    return await mockedHandler({
      request: requestWithToken(signedToken(documentPayload({
        documentId: document.id,
      }))),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
    })
  } finally {
    vi.doUnmock('#/db/client')
    vi.resetModules()
  }
}

type MockDocumentAccessDocument = {
  id: string
  createdBy: string
  status: string
  revisionTarget: string | null
  lampiranUrls: unknown
  lampiranDibersihkanAt?: string | Date | null
}

async function resolveDocumentTokenWithMockedContext({
  document,
  destroyedBerkasMembership = false,
  session: testSession,
}: {
  document: MockDocumentAccessDocument
  destroyedBerkasMembership?: boolean
  session: ReturnType<typeof session>
}) {
  vi.resetModules()
  vi.doMock('#/db/client', () => ({
    db: createDocumentAccessDbMock(document, destroyedBerkasMembership),
  }))

  try {
    const { resolveDocumentLampiranAccessForToken } = await import(
      '#/lib/storage/document-file-access'
    )

    return await resolveDocumentLampiranAccessForToken({
      payload: {
        version: 1,
        purpose: 'preview',
        documentId: document.id,
        lampiranIndex: 0,
        subjectUserId: testSession.userId,
        sessionId: testSession.sessionId,
        statusCheck: 'document',
        contentDisposition: 'inline',
        issuedAt: NOW,
        expiresAt: FUTURE,
      },
      session: testSession,
    })
  } finally {
    vi.doUnmock('#/db/client')
    vi.resetModules()
  }
}

function createDocumentAccessDbMock(
  document: MockDocumentAccessDocument,
  destroyedBerkasMembership = false,
  ketuaTimAssignment = false,
) {
  const documentRow = {
    lampiranDibersihkanAt: null,
    kegiatanJenisId: 'kegiatan-id',
    ...document,
  }
  const select = vi.fn()
    .mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [documentRow]),
        })),
      })),
    })
    .mockReturnValueOnce({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => destroyedBerkasMembership
              ? [{ id: '22222222-2222-4222-8222-222222222222' }]
              : []),
          })),
        })),
      })),
    })
    // Panggilan berikutnya: lookup ketua_tim_assignments -- hanya tercapai
    // kalau pemilik & seluruh cabang peran tidak memberi izin.
    .mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => ketuaTimAssignment ? [{ id: 'assignment-id' }] : []),
        })),
      })),
    })

  return { select }
}

function expectNoSensitiveFileAccessLeak(value: string): void {
  expect(value).not.toContain('owner-user')
  expect(value).not.toContain('document-id')
  expect(value).not.toContain('file.pdf')
  expect(value).not.toContain(TEST_ROOT)
  expect(value).not.toContain('logicalPath')
  expect(value).not.toContain('logical_path')
  expect(value).not.toContain('physical')
  expect(value).not.toContain('storage')
  expect(value).not.toContain('token')
  expect(value).not.toContain('secret')
  expect(value).not.toContain('session')
  expect(value).not.toContain('cookie')
  expect(value).not.toContain('DATABASE_URL')
  expect(value).not.toContain('DMS_LOCAL_STORAGE_ROOT')
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
