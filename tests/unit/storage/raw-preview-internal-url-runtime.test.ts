import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/api/dokumen/preview-url'
import { ROLES, type RoleName } from '#/lib/constants/roles'
import { handleInternalFileAccessRequest } from '#/lib/storage/internal-file-access'
import { INTERNAL_FILE_ACCESS_PATH } from '#/lib/storage/internal-file-access-url'

const TEST_SECRET = 'unit-test-raw-preview-runtime-secret'
const TEST_ROOT = path.resolve('.tmp', 'raw-preview-internal-url-runtime-root')
const LOGICAL_PATH = 'owner-user/document-id/1777964598700-random-report.pdf'
const LOCAL_FILE_CONTENT = '%PDF-1.4 runtime preview content'

const mocks = vi.hoisted(() => {
  const getLocalServerSession = vi.fn()
  const authorizeRawLogicalPathAccess = vi.fn()

  return {
    authorizeRawLogicalPathAccess,
    getLocalServerSession,
  }
})

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/lib/storage/internal-file-access', async importOriginal => {
  const actual = await importOriginal<typeof import('#/lib/storage/internal-file-access')>()

  return {
    ...actual,
    authorizeRawLogicalPathAccess: mocks.authorizeRawLogicalPathAccess,
  }
})

type PreviewHandler = (args: { request: Request }) => Promise<Response>

const previewHandler = (Route as unknown as {
  options: { server: { handlers: { GET: PreviewHandler } } }
}).options.server.handlers.GET

function previewRequest(query: string): Request {
  return new Request(`http://localhost/api/dokumen/preview-url${query}`)
}

function accessRequest(token: string): Request {
  return new Request(
    `http://localhost${INTERNAL_FILE_ACCESS_PATH}?token=${encodeURIComponent(token)}`,
  )
}

function session(userId = 'owner-user', roles: RoleName[] = [ROLES.PEGAWAI]) {
  return {
    user: { id: userId, email: `${userId}@example.test` },
    userId,
    email: `${userId}@example.test`,
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

async function writeLocalFile(logicalPath: string, content: string): Promise<void> {
  const targetPath = path.join(TEST_ROOT, ...logicalPath.split('/'))

  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)
}

async function createInternalPreviewToken(logicalPath = LOGICAL_PATH): Promise<string> {
  const response = await previewHandler({
    request: previewRequest(`?url=${encodeURIComponent(logicalPath)}&useInternal=true`),
  })
  const body = await responseJson(response)

  expect(response.status).toBe(200)
  expect(body).toMatchObject({ filename: 'report.pdf' })
  expect(typeof body.signedUrl).toBe('string')
  expect((body.signedUrl as string).startsWith(`${INTERNAL_FILE_ACCESS_PATH}?token=`)).toBe(true)

  return extractToken(body.signedUrl as string)
}

describe('raw preview internal URL runtime verification', () => {
  const previousSecret = process.env.DMS_FILE_TOKEN_SECRET

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.DMS_FILE_TOKEN_SECRET = TEST_SECRET
    await rm(TEST_ROOT, { force: true, recursive: true })

    mocks.getLocalServerSession.mockResolvedValue(session())
    mocks.authorizeRawLogicalPathAccess.mockResolvedValue({ ok: true })
  })

  afterEach(async () => {
    if (previousSecret === undefined) {
      delete process.env.DMS_FILE_TOKEN_SECRET
    } else {
      process.env.DMS_FILE_TOKEN_SECRET = previousSecret
    }

    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('verifies the opt-in raw preview flow through internal local file access', async () => {
    await writeLocalFile(LOGICAL_PATH, LOCAL_FILE_CONTENT)

    const token = await createInternalPreviewToken()
    const fileResponse = await handleInternalFileAccessRequest({
      request: accessRequest(token),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: async () => ({ documents: [], folders: [] }),
    })

    expect(fileResponse.status).toBe(200)
    expect(fileResponse.headers.get('Cache-Control')).toBe('no-store')
    expect(fileResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(fileResponse.headers.get('Content-Type')).toBe('application/pdf')
    expect(fileResponse.headers.get('Content-Disposition')).toBe(
      'inline; filename="1777964598700-random-report.pdf"',
    )
    expect(await fileResponse.text()).toBe(LOCAL_FILE_CONTENT)
  })

  it('returns an internal raw preview URL without Supabase fallback', async () => {
    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}`),
    })
    const body = await responseJson(response)

    expect(response.status).toBe(200)
    expect(body.filename).toBe('report.pdf')
    expect(typeof body.signedUrl).toBe('string')
    expect((body.signedUrl as string).startsWith(`${INTERNAL_FILE_ACCESS_PATH}?token=`)).toBe(true)
  })

  it('generates the opt-in URL but rejects final access without a local session', async () => {
    const token = await createInternalPreviewToken()
    const response = await handleInternalFileAccessRequest({
      request: accessRequest(token),
      session: null,
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: async () => ({ documents: [], folders: [] }),
    })

    expect(response.status).toBe(401)
    expect(await responseJson(response)).toEqual({ error: 'Unauthorized' })
  })

  it('generates the opt-in URL but returns a generic 404 when the local file is missing', async () => {
    const token = await createInternalPreviewToken()
    const response = await handleInternalFileAccessRequest({
      request: accessRequest(token),
      session: session('owner-user'),
      secret: TEST_SECRET,
      root: TEST_ROOT,
      rawLogicalPathAccessContextResolver: async () => ({ documents: [], folders: [] }),
    })

    expect(response.status).toBe(404)
    expect(await responseJson(response)).toEqual({ error: 'File not found' })
  })

  it('does not generate an internal token before raw preview session authorization passes', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}&useInternal=true`),
    })

    expect(response.status).toBe(401)
    expect(await responseJson(response)).toEqual({ error: 'Unauthorized' })
  })

  it('does not generate an internal token before raw preview path authorization passes', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session('other-user'))
    mocks.authorizeRawLogicalPathAccess.mockResolvedValue({
      ok: false,
      status: 403,
      message: 'Anda tidak memiliki akses',
    })

    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}&useInternal=true`),
    })

    expect(response.status).toBe(403)
    expect(await responseJson(response)).toEqual({ error: 'Anda tidak memiliki akses' })
  })
})
