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
const SUPABASE_REFERENCE_OUTPUT = 'reference-preview-output'

const mocks = vi.hoisted(() => {
  const createSignedUrl = vi.fn()
  const storageFrom = vi.fn(() => ({ createSignedUrl }))
  const createAdminClient = vi.fn(() => ({
    storage: { from: storageFrom },
  }))
  const createServerSupabaseClient = vi.fn(() => ({ client: 'supabase' }))
  const getServerSession = vi.fn()
  const canAccessStoragePath = vi.fn()

  return {
    canAccessStoragePath,
    createAdminClient,
    createServerSupabaseClient,
    createSignedUrl,
    getServerSession,
    storageFrom,
  }
})

vi.mock('#/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}))

vi.mock('#/lib/supabase-admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('#/lib/auth', () => ({
  getServerSession: mocks.getServerSession,
}))

vi.mock('#/lib/dokumen-helpers', () => ({
  canAccessStoragePath: mocks.canAccessStoragePath,
}))

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
  return { userId, roles }
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

    mocks.getServerSession.mockResolvedValue({
      user: { id: 'owner-user' },
    })
    mocks.canAccessStoragePath.mockResolvedValue(true)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: SUPABASE_REFERENCE_OUTPUT },
      error: null,
    })
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
    })

    expect(fileResponse.status).toBe(200)
    expect(fileResponse.headers.get('Cache-Control')).toBe('no-store')
    expect(fileResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(fileResponse.headers.get('Content-Type')).toBe('application/pdf')
    expect(fileResponse.headers.get('Content-Disposition')).toBe(
      'inline; filename="1777964598700-random-report.pdf"',
    )
    expect(await fileResponse.text()).toBe(LOCAL_FILE_CONTENT)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('preserves the default raw preview behavior as Supabase-backed', async () => {
    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}`),
    })
    const body = await responseJson(response)

    expect(response.status).toBe(200)
    expect(body).toEqual({
      signedUrl: SUPABASE_REFERENCE_OUTPUT,
      filename: 'report.pdf',
    })
    expect((body.signedUrl as string).startsWith(`${INTERNAL_FILE_ACCESS_PATH}?token=`)).toBe(false)
    expect(mocks.storageFrom).toHaveBeenCalledWith('dokumen-lampiran')
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(LOGICAL_PATH, 900)
  })

  it('generates the opt-in URL but rejects final access without a local session', async () => {
    const token = await createInternalPreviewToken()
    const response = await handleInternalFileAccessRequest({
      request: accessRequest(token),
      session: null,
      secret: TEST_SECRET,
      root: TEST_ROOT,
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
    })

    expect(response.status).toBe(404)
    expect(await responseJson(response)).toEqual({ error: 'File not found' })
  })

  it('does not generate an internal token before raw preview session authorization passes', async () => {
    mocks.getServerSession.mockResolvedValue(null)

    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}&useInternal=true`),
    })

    expect(response.status).toBe(401)
    expect(await responseJson(response)).toEqual({ error: 'Unauthorized' })
    expect(mocks.canAccessStoragePath).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('does not generate an internal token before raw preview path authorization passes', async () => {
    mocks.canAccessStoragePath.mockResolvedValue(false)

    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}&useInternal=true`),
    })

    expect(response.status).toBe(403)
    expect(await responseJson(response)).toEqual({ error: 'Anda tidak memiliki akses' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })
})
