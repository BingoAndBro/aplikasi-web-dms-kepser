import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/api/dokumen/download-url'
import { ROLES, type RoleName } from '#/lib/constants/roles'
import { verifyFileAccessToken } from '#/lib/storage/file-access-token'
import { INTERNAL_FILE_ACCESS_PATH } from '#/lib/storage/internal-file-access-url'

const TEST_SECRET = 'unit-test-raw-download-url-hardening-secret'
const NOW = new Date('2026-05-21T10:00:00.000Z')
const LOGICAL_PATH = 'owner-user/document-id/1777964598700-random-report.pdf'

const mocks = vi.hoisted(() => {
  const authorizeRawLogicalPathAccess = vi.fn()
  const getFileTokenSecret = vi.fn()
  const getLocalServerSession = vi.fn()

  return {
    authorizeRawLogicalPathAccess,
    getFileTokenSecret,
    getLocalServerSession,
  }
})

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/lib/storage/internal-file-access', () => ({
  authorizeRawLogicalPathAccess: mocks.authorizeRawLogicalPathAccess,
  getFileTokenSecret: mocks.getFileTokenSecret,
}))

type DownloadHandler = (args: { request: Request }) => Promise<Response>

const downloadHandler = (Route as unknown as {
  options: { server: { handlers: { GET: DownloadHandler } } }
}).options.server.handlers.GET

function downloadRequest(query: string): Request {
  return new Request(`http://localhost/api/dokumen/download-url${query}`)
}

function validDownloadQuery(logicalPath = LOGICAL_PATH): string {
  const params = new URLSearchParams({
    url: logicalPath,
    docId: 'document-id-for-name',
    docDate: '2026-05-21',
    lampName: 'Laporan',
  })

  return `?${params.toString()}`
}

function session(userId = 'owner-user', roles: RoleName[] = [ROLES.PEGAWAI]) {
  return {
    user: { id: userId, username: userId },
    userId,
    roles,
    activeRole: roles[0],
    sessionId: 'unit-test-session',
  }
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json()
}

function extractToken(internalUrl: string): string {
  const token = new URL(internalUrl, 'http://localhost').searchParams.get('token')
  expect(token).toBeTruthy()
  return token ?? ''
}

describe('raw download URL hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()

    mocks.getLocalServerSession.mockResolvedValue(session())
    mocks.getFileTokenSecret.mockReturnValue(TEST_SECRET)
    mocks.authorizeRawLogicalPathAccess.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('preserves signedUrl compatibility for authorized non-DIMUSNAHKAN raw downloads', async () => {
    const response = await downloadHandler({
      request: downloadRequest(validDownloadQuery()),
    })
    const body = await responseJson(response)

    expect(response.status).toBe(200)
    expect(typeof body.signedUrl).toBe('string')
    expect((body.signedUrl as string).startsWith(`${INTERNAL_FILE_ACCESS_PATH}?token=`)).toBe(true)

    const payload = verifyFileAccessToken(
      extractToken(body.signedUrl as string),
      TEST_SECRET,
      NOW,
    )

    expect(payload).toMatchObject({
      version: 1,
      purpose: 'download',
      logicalPath: LOGICAL_PATH,
      contentDisposition: 'attachment',
      issuedAt: NOW.getTime(),
      expiresAt: NOW.getTime() + 3600 * 1000,
    })
    expect(mocks.authorizeRawLogicalPathAccess).toHaveBeenCalledWith({
      session: expect.objectContaining({ userId: 'owner-user' }),
      logicalPath: LOGICAL_PATH,
    })
  })

  it('does not issue a raw download token for a DIMUSNAHKAN archive-governed file', async () => {
    mocks.authorizeRawLogicalPathAccess.mockResolvedValue({
      ok: false,
      status: 410,
      message: 'File asli tidak tersedia - arsip telah dimusnahkan',
    })

    const response = await downloadHandler({
      request: downloadRequest(validDownloadQuery()),
    })

    expect(response.status).toBe(410)
    expect(await responseJson(response)).toEqual({
      error: 'File asli tidak tersedia - arsip telah dimusnahkan',
    })
    expect(mocks.getFileTokenSecret).not.toHaveBeenCalled()
  })

  it('preserves raw pending owner-compatible download token issuance', async () => {
    const pendingPath = 'owner-user/1777964598700-random-report.pdf'

    const response = await downloadHandler({
      request: downloadRequest(validDownloadQuery(pendingPath)),
    })
    const body = await responseJson(response)

    expect(response.status).toBe(200)
    expect(typeof body.signedUrl).toBe('string')
    expect(mocks.authorizeRawLogicalPathAccess).toHaveBeenCalledWith({
      session: expect.objectContaining({ userId: 'owner-user' }),
      logicalPath: pendingPath,
    })
  })
})
