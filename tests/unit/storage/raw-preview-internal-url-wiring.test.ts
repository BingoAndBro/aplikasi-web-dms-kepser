import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/api/dokumen/preview-url'
import { verifyFileAccessToken } from '#/lib/storage/file-access-token'
import { INTERNAL_FILE_ACCESS_PATH } from '#/lib/storage/internal-file-access-url'

const TEST_SECRET = 'unit-test-raw-preview-internal-url-secret'
const NOW = new Date('2026-05-15T10:00:00.000Z')
const LOGICAL_PATH = 'owner-user/document-id/1777964598700-random-report.pdf'

const mocks = vi.hoisted(() => {
  const createSignedUrl = vi.fn()
  const storageFrom = vi.fn(() => ({ createSignedUrl }))
  const createAdminClient = vi.fn(() => ({
    storage: { from: storageFrom },
  }))
  const createServerSupabaseClient = vi.fn(() => ({ client: 'supabase' }))
  const getServerSession = vi.fn()
  const canAccessStoragePath = vi.fn()
  const getFileTokenSecret = vi.fn()

  return {
    canAccessStoragePath,
    createAdminClient,
    createServerSupabaseClient,
    createSignedUrl,
    getFileTokenSecret,
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

vi.mock('#/lib/storage/internal-file-access', () => ({
  getFileTokenSecret: mocks.getFileTokenSecret,
}))

type PreviewHandler = (args: { request: Request }) => Promise<Response>

const previewHandler = (Route as unknown as {
  options: { server: { handlers: { GET: PreviewHandler } } }
}).options.server.handlers.GET

function previewRequest(query: string): Request {
  return new Request(`http://localhost/api/dokumen/preview-url${query}`)
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json()
}

function extractToken(internalUrl: string): string {
  const token = new URL(internalUrl, 'http://localhost').searchParams.get('token')
  expect(token).toBeTruthy()
  return token ?? ''
}

describe('raw preview internal URL wiring', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()

    mocks.getServerSession.mockResolvedValue({
      user: { id: 'owner-user' },
    })
    mocks.canAccessStoragePath.mockResolvedValue(true)
    mocks.getFileTokenSecret.mockReturnValue(TEST_SECRET)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'reference-preview-output' },
      error: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the default request path Supabase-backed', async () => {
    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}`),
    })

    expect(response.status).toBe(200)
    expect(await responseJson(response)).toEqual({
      signedUrl: 'reference-preview-output',
      filename: 'report.pdf',
    })
    expect(mocks.canAccessStoragePath).toHaveBeenCalledWith(
      expect.anything(),
      'owner-user',
      LOGICAL_PATH,
    )
    expect(mocks.storageFrom).toHaveBeenCalledWith('dokumen-lampiran')
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(LOGICAL_PATH, 900)
    expect(mocks.getFileTokenSecret).not.toHaveBeenCalled()
  })

  it('returns a compatible internal preview URL when useInternal=true', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}&useInternal=true`),
    })
    const body = await responseJson(response)

    expect(response.status).toBe(200)
    expect(body.filename).toBe('report.pdf')
    expect(typeof body.signedUrl).toBe('string')
    expect((body.signedUrl as string).startsWith(`${INTERNAL_FILE_ACCESS_PATH}?token=`)).toBe(true)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()

    const payload = verifyFileAccessToken(
      extractToken(body.signedUrl as string),
      TEST_SECRET,
      NOW,
    )

    expect(payload).toEqual({
      version: 1,
      purpose: 'preview',
      logicalPath: LOGICAL_PATH,
      contentDisposition: 'inline',
      issuedAt: NOW.getTime(),
      expiresAt: NOW.getTime() + 900 * 1000,
    })
  })

  it('does not create an internal URL before session authorization passes', async () => {
    mocks.getServerSession.mockResolvedValue(null)

    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}&useInternal=true`),
    })

    expect(response.status).toBe(401)
    expect(await responseJson(response)).toEqual({ error: 'Unauthorized' })
    expect(mocks.canAccessStoragePath).not.toHaveBeenCalled()
    expect(mocks.getFileTokenSecret).not.toHaveBeenCalled()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('does not create an internal URL before storage path authorization passes', async () => {
    mocks.canAccessStoragePath.mockResolvedValue(false)

    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}&useInternal=true`),
    })

    expect(response.status).toBe(403)
    expect(await responseJson(response)).toEqual({ error: 'Anda tidak memiliki akses' })
    expect(mocks.getFileTokenSecret).not.toHaveBeenCalled()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('returns a generic 500 without Supabase fallback when internal URL creation fails', async () => {
    mocks.getFileTokenSecret.mockImplementation(() => {
      throw new Error('test configuration failure')
    })

    const response = await previewHandler({
      request: previewRequest(`?url=${encodeURIComponent(LOGICAL_PATH)}&useInternal=true`),
    })

    expect(response.status).toBe(500)
    expect(await responseJson(response)).toEqual({ error: 'Gagal membuat URL preview' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })
})
