import { beforeEach, describe, expect, it, vi } from 'vitest'

const ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const ATTACHMENT_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  createUnifiedArchiveAttachmentFileResponse: vi.fn(),
  getUnifiedArchiveDetail: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/lib/archive/unified-archive-file-actions', () => ({
  createUnifiedArchiveAttachmentFileResponse: mocks.createUnifiedArchiveAttachmentFileResponse,
}))

vi.mock('#/lib/archive/unified-archive-detail', () => ({
  getUnifiedArchiveDetail: mocks.getUnifiedArchiveDetail,
}))

import { Route } from '#/routes/api/arsiparis/arsip/$id'

type RouteGetHandler = (args: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const getHandler = (Route as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('unified archive file action API branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createUnifiedArchiveAttachmentFileResponse.mockResolvedValue(new Response('file', { status: 200 }))
    mocks.getUnifiedArchiveDetail.mockResolvedValue({ status: 'not_found' })
  })

  it('requires an authenticated local session before file action access', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await getHandler({
      request: actionRequest('preview', 'workflow-1'),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.createUnifiedArchiveAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('rejects ADMIN-only file action access before DB/file work', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['ADMIN']))

    const response = await getHandler({
      request: actionRequest('download', 'workflow-1'),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    expect(mocks.createUnifiedArchiveAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('rejects non-Kasubag file action access before DB/file work', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['PEGAWAI']))

    const response = await getHandler({
      request: actionRequest('preview', 'workflow-1'),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    expect(mocks.createUnifiedArchiveAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('rejects malformed file action refs without delegating', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))

    const response = await getHandler({
      request: actionRequest('preview', '../secret.pdf'),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Lampiran arsip tidak ditemukan' })
    expect(mocks.createUnifiedArchiveAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('rejects malformed manual refs without delegating', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))

    for (const attachmentRef of [
      'manual-not-a-uuid',
      'manual-22222222-2222-2222-2222',
      'manual-22222222-2222-6222-8222-222222222222',
      'manual-22222222-2222-4222-7222-222222222222',
    ]) {
      const response = await getHandler({
        request: actionRequest('preview', attachmentRef),
        params: { id: ARCHIVE_ID },
      })

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'Lampiran arsip tidak ditemukan' })
    }

    expect(mocks.createUnifiedArchiveAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('rejects path-like and traversal manual refs without delegating', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))

    for (const attachmentRef of [
      'manual-../secret.pdf',
      'manual-..\\secret.pdf',
      'manual-/storage/secret.pdf',
      'manual-C:\\storage\\secret.pdf',
      'manual-https://example.test/file.pdf',
      'manual-token-22222222-2222-4222-8222-222222222222',
    ]) {
      const response = await getHandler({
        request: actionRequest('download', attachmentRef),
        params: { id: ARCHIVE_ID },
      })

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'Lampiran arsip tidak ditemukan' })
    }

    expect(mocks.createUnifiedArchiveAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('delegates valid action refs to the unified file responder', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))
    mocks.createUnifiedArchiveAttachmentFileResponse.mockResolvedValue(new Response('file', {
      status: 200,
      headers: { 'Content-Disposition': 'inline; filename="safe.pdf"' },
    }))

    const response = await getHandler({
      request: actionRequest('preview', 'workflow-1'),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('file')
    expect(mocks.createUnifiedArchiveAttachmentFileResponse).toHaveBeenCalledWith({
      archiveId: ARCHIVE_ID,
      attachmentRef: 'workflow-1',
      purpose: 'preview',
    })
  })

  it('delegates valid manual UUID action refs to the unified file responder', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))

    const response = await getHandler({
      request: actionRequest('download', `manual-${ATTACHMENT_ID}`),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('file')
    expect(mocks.createUnifiedArchiveAttachmentFileResponse).toHaveBeenCalledWith({
      archiveId: ARCHIVE_ID,
      attachmentRef: `manual-${ATTACHMENT_ID}`,
      purpose: 'download',
    })
  })

  it('propagates safe missing archive/file responses from the responder', async () => {
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))
    mocks.createUnifiedArchiveAttachmentFileResponse.mockResolvedValue(Response.json(
      { error: 'Arsip tidak ditemukan' },
      { status: 404 },
    ))

    const response = await getHandler({
      request: actionRequest('download', 'workflow-1'),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Arsip tidak ditemukan' })
  })
})

function actionRequest(action: string, attachmentRef: string): Request {
  const params = new URLSearchParams({ action, attachmentRef })

  return new Request(`http://localhost/api/arsiparis/arsip/${ARCHIVE_ID}?${params.toString()}`)
}

function createSession(roles: string[]) {
  return {
    userId: 'user-id',
    sessionId: 'session-id',
    roles,
    activeRole: roles[0],
    user: { id: 'user-id', email: 'user@example.test' },
    email: 'user@example.test',
  }
}
