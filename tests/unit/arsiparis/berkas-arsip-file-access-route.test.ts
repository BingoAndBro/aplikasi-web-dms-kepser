import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const BERKAS_ID = '22222222-2222-4222-8222-222222222222'
const ITEM_ID = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  createBerkasArsipItemAttachmentFileResponse: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/lib/archive/berkas-arsip-file-access', () => ({
  createBerkasArsipItemAttachmentFileResponse: mocks.createBerkasArsipItemAttachmentFileResponse,
}))

import { Route as DownloadRoute } from '#/routes/api/arsiparis/berkas/$id/items/$itemId/download/$lampiranIndex'
import { Route as PreviewRoute } from '#/routes/api/arsiparis/berkas/$id/items/$itemId/preview/$lampiranIndex'

type RouteGetHandler = (args: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const previewGetHandler = (PreviewRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const downloadGetHandler = (DownloadRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('berkas item file access API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))
    mocks.createBerkasArsipItemAttachmentFileResponse.mockResolvedValue(new Response('file', { status: 200 }))
  })

  it('requires local dms_session before preview/download file work', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const preview = await previewGetHandler({
      request: fileRequest('preview'),
      params: validParams(),
    })
    const download = await downloadGetHandler({
      request: fileRequest('download'),
      params: validParams(),
    })

    expect(preview.status).toBe(401)
    expect(download.status).toBe(401)
    expect(await preview.json()).toEqual({ error: 'Unauthorized' })
    expect(await download.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.createBerkasArsipItemAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('rejects ADMIN-only preview/download before DB or file work', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['ADMIN']))

    const preview = await previewGetHandler({
      request: fileRequest('preview'),
      params: validParams(),
    })
    const download = await downloadGetHandler({
      request: fileRequest('download'),
      params: validParams(),
    })

    expect(preview.status).toBe(403)
    expect(download.status).toBe(403)
    expect(await preview.json()).toEqual({ error: 'Akses ditolak' })
    expect(await download.json()).toEqual({ error: 'Akses ditolak' })
    expect(mocks.createBerkasArsipItemAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('rejects malformed params without delegating', async () => {
    for (const params of [
      { ...validParams(), id: 'not-a-uuid' },
      { ...validParams(), itemId: '../secret.pdf' },
      { ...validParams(), lampiranIndex: '-1' },
      { ...validParams(), lampiranIndex: 'not-a-number' },
    ]) {
      const response = await previewGetHandler({
        request: fileRequest('preview'),
        params,
      })

      expect(response.status).toBe(404)
      expect(JSON.stringify(await response.json())).not.toContain('secret.pdf')
    }

    expect(mocks.createBerkasArsipItemAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('delegates valid preview and download requests to the helper', async () => {
    const preview = await previewGetHandler({
      request: fileRequest('preview'),
      params: validParams(),
    })
    const download = await downloadGetHandler({
      request: fileRequest('download'),
      params: validParams(),
    })

    expect(preview.status).toBe(200)
    expect(download.status).toBe(200)
    expect(mocks.createBerkasArsipItemAttachmentFileResponse).toHaveBeenNthCalledWith(1, {
      berkasId: BERKAS_ID,
      itemId: ITEM_ID,
      lampiranIndex: 0,
      purpose: 'preview',
    })
    expect(mocks.createBerkasArsipItemAttachmentFileResponse).toHaveBeenNthCalledWith(2, {
      berkasId: BERKAS_ID,
      itemId: ITEM_ID,
      lampiranIndex: 0,
      purpose: 'download',
    })
  })

  it('propagates the safe DIMUSNAHKAN response from the helper', async () => {
    mocks.createBerkasArsipItemAttachmentFileResponse.mockResolvedValueOnce(
      Response.json({ error: 'Data file sudah dimusnahkan' }, { status: 410 }),
    )

    const response = await previewGetHandler({
      request: fileRequest('preview'),
      params: validParams(),
    })

    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'Data file sudah dimusnahkan' })
  })
})

function createSession(roles: string[]) {
  return {
    user: {
      id: USER_ID,
      email: 'user@example.test',
    },
    userId: USER_ID,
    email: 'user@example.test',
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function validParams(): Record<string, string> {
  return {
    id: BERKAS_ID,
    itemId: ITEM_ID,
    lampiranIndex: '0',
  }
}

function fileRequest(purpose: 'preview' | 'download'): Request {
  return new Request(
    `http://localhost/api/arsiparis/berkas/${BERKAS_ID}/items/${ITEM_ID}/${purpose}/0`,
  )
}
