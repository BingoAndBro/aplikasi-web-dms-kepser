import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const ARCHIVE_ID = '33333333-3333-4333-8333-333333333333'
const MANUAL_SOURCE_ID = '44444444-4444-4444-8444-444444444444'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
  txUpdate: vi.fn(),
  txUpdateSet: vi.fn(),
  txWhere: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
    transaction: mocks.dbTransaction,
  },
}))

import { Route } from '#/routes/api/arsiparis/arsip/$id/lifecycle'

type RoutePostHandler = (args: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const postHandler = (Route as unknown as {
  options: { server: { handlers: { POST: RoutePostHandler } } }
}).options.server.handlers.POST

describe('unified archive lifecycle route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))
  })

  it('rejects cross-origin requests before auth or DB work', async () => {
    const response = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }, 'https://evil.example'),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated requests', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('returns 403 for ADMIN-only and non-Kasubag users', async () => {
    for (const roles of [['ADMIN'], ['PEGAWAI']]) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValueOnce(createSession(roles, roles[0] === 'ADMIN' ? ADMIN_ID : USER_ID))

      const response = await postHandler({
        request: lifecycleRequest({ action: 'mark_inactive' }),
        params: { id: ARCHIVE_ID },
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
      expect(mocks.dbSelect).not.toHaveBeenCalled()
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    }
  })

  it('returns 400 for malformed bodies and unsupported actions', async () => {
    const cases = [
      malformedJsonRequest(),
      lifecycleRequest({ action: 'restore_active' }),
      lifecycleRequest({ action: 'mark_inactive', extra: true }),
    ]

    for (const request of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))

      const response = await postHandler({
        request,
        params: { id: ARCHIVE_ID },
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Aksi lifecycle arsip tidak valid.' })
      expect(mocks.dbSelect).not.toHaveBeenCalled()
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    }
  })

  it('rejects approve_destruction without confirmation before DB work', async () => {
    const response = await postHandler({
      request: lifecycleRequest({
        action: 'approve_destruction',
        reason: 'Retensi selesai',
      }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Aksi lifecycle arsip tidak valid.' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects approve_destruction with wrong confirmation before DB work', async () => {
    const response = await postHandler({
      request: lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'setuju',
        reason: 'Retensi selesai',
      }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Aksi lifecycle arsip tidak valid.' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects approve_destruction without a non-empty reason before DB work', async () => {
    const cases = [
      lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'SETUJUI PEMUSNAHAN ARSIP',
      }),
      lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'SETUJUI PEMUSNAHAN ARSIP',
        reason: '   ',
      }),
    ]

    for (const request of cases) {
      vi.clearAllMocks()
      mocks.getLocalServerSession.mockResolvedValueOnce(createSession(['KEPALA_SUB_BAGIAN_UMUM'], USER_ID))

      const response = await postHandler({
        request,
        params: { id: ARCHIVE_ID },
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Aksi lifecycle arsip tidak valid.' })
      expect(mocks.dbSelect).not.toHaveBeenCalled()
      expect(mocks.dbTransaction).not.toHaveBeenCalled()
    }
  })

  it('returns 404 for invalid or missing canonical archive ids', async () => {
    const invalid = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: 'not-a-uuid' },
    })

    expect(invalid.status).toBe(404)
    expect(await invalid.json()).toEqual({ error: 'Arsip tidak ditemukan' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()

    queueSelectResults([])

    const missing = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: ARCHIVE_ID },
    })

    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Arsip tidak ditemukan' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('updates WORKFLOW AKTIF to INAKTIF through mark_inactive', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'AKTIF')])
    queueTransactionUpdates([{ id: ARCHIVE_ID }])

    const response = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: ARCHIVE_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      archiveId: ARCHIVE_ID,
      fromStatus: 'AKTIF',
      toStatus: 'INAKTIF',
      sourceType: 'WORKFLOW',
    })
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.txUpdateSet).toHaveBeenCalledTimes(1)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith({ statusArsip: 'INAKTIF' })
    expectNoSensitiveOutput(body)
  })

  it('updates WORKFLOW INAKTIF to USUL_MUSNAH through propose_destruction', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'INAKTIF')])
    queueTransactionUpdates([{ id: ARCHIVE_ID }])

    const response = await postHandler({
      request: lifecycleRequest({ action: 'propose_destruction', reason: 'Retensi habis' }),
      params: { id: ARCHIVE_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      archiveId: ARCHIVE_ID,
      fromStatus: 'INAKTIF',
      toStatus: 'USUL_MUSNAH',
      sourceType: 'WORKFLOW',
    })
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.txUpdateSet).toHaveBeenCalledTimes(1)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith({ statusArsip: 'USUL_MUSNAH' })
    expectNoSensitiveOutput(body)
  })

  it('updates WORKFLOW USUL_MUSNAH to DIMUSNAHKAN through approve_destruction', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'USUL_MUSNAH')])
    queueTransactionUpdates([{ id: ARCHIVE_ID }])

    const response = await postHandler({
      request: lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'SETUJUI PEMUSNAHAN ARSIP',
        reason: 'Retensi selesai dan disetujui untuk dimusnahkan',
      }),
      params: { id: ARCHIVE_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      archiveId: ARCHIVE_ID,
      fromStatus: 'USUL_MUSNAH',
      toStatus: 'DIMUSNAHKAN',
      sourceType: 'WORKFLOW',
    })
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.txUpdateSet).toHaveBeenCalledTimes(1)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith({ statusArsip: 'DIMUSNAHKAN' })
    expectNoSensitiveOutput(body)
  })

  it('returns 409 for invalid direct WORKFLOW transitions', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'AKTIF')])

    const response = await postHandler({
      request: lifecycleRequest({ action: 'propose_destruction' }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Perubahan status arsip tidak diizinkan.' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('returns 409 for WORKFLOW approve_destruction when status is not USUL_MUSNAH', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'INAKTIF')])

    const response = await postHandler({
      request: lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'SETUJUI PEMUSNAHAN ARSIP',
        reason: 'Retensi selesai',
      }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Perubahan status arsip tidak diizinkan.' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('returns 409 for WORKFLOW approve_destruction when archive is already DIMUSNAHKAN', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'DIMUSNAHKAN')])

    const response = await postHandler({
      request: lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'SETUJUI PEMUSNAHAN ARSIP',
        reason: 'Retensi selesai',
      }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Arsip yang sudah dimusnahkan tidak dapat diubah statusnya.',
    })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('updates linked MANUAL canonical and source statuses in one transaction', async () => {
    queueSelectResults(
      [canonicalArchiveRow('MANUAL', 'AKTIF')],
      [manualSourceRow('AKTIF')],
    )
    queueTransactionUpdates([{ id: ARCHIVE_ID }], [{ id: MANUAL_SOURCE_ID }])

    const response = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: ARCHIVE_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      archiveId: ARCHIVE_ID,
      fromStatus: 'AKTIF',
      toStatus: 'INAKTIF',
      sourceType: 'MANUAL',
    })
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.txUpdateSet).toHaveBeenCalledTimes(2)
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(1, { statusArsip: 'INAKTIF' })
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(2, { statusArsip: 'INAKTIF' })
    expectNoSensitiveOutput(body)
  })

  it('updates linked MANUAL canonical and source statuses to DIMUSNAHKAN in one transaction', async () => {
    queueSelectResults(
      [canonicalArchiveRow('MANUAL', 'USUL_MUSNAH')],
      [manualSourceRow('USUL_MUSNAH')],
    )
    queueTransactionUpdates([{ id: ARCHIVE_ID }], [{ id: MANUAL_SOURCE_ID }])

    const response = await postHandler({
      request: lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'SETUJUI PEMUSNAHAN ARSIP',
        reason: 'Retensi selesai dan disetujui untuk dimusnahkan',
      }),
      params: { id: ARCHIVE_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      archiveId: ARCHIVE_ID,
      fromStatus: 'USUL_MUSNAH',
      toStatus: 'DIMUSNAHKAN',
      sourceType: 'MANUAL',
    })
    expect(mocks.dbTransaction).toHaveBeenCalledOnce()
    expect(mocks.txUpdateSet).toHaveBeenCalledTimes(2)
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(1, { statusArsip: 'DIMUSNAHKAN' })
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(2, { statusArsip: 'DIMUSNAHKAN' })
    expectNoSensitiveOutput(body)
  })

  it('returns 409 for MANUAL status drift without updates', async () => {
    queueSelectResults(
      [canonicalArchiveRow('MANUAL', 'AKTIF')],
      [manualSourceRow('INAKTIF')],
    )

    const response = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Status Arsip Manual tidak selaras dengan status arsip canonical.',
    })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('returns 409 for MANUAL approve_destruction drift without updates', async () => {
    queueSelectResults(
      [canonicalArchiveRow('MANUAL', 'USUL_MUSNAH')],
      [manualSourceRow('INAKTIF')],
    )

    const response = await postHandler({
      request: lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'SETUJUI PEMUSNAHAN ARSIP',
        reason: 'Retensi selesai',
      }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Status Arsip Manual tidak selaras dengan status arsip canonical.',
    })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('returns 409 for missing MANUAL source without updates', async () => {
    queueSelectResults(
      [canonicalArchiveRow('MANUAL', 'AKTIF')],
      [],
    )

    const response = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Sumber Arsip Manual terkait tidak ditemukan.' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('returns 409 for guarded update failures', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'AKTIF')])
    queueTransactionUpdates([])

    const response = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Status arsip berubah. Muat ulang data dan coba lagi.',
    })
  })

  it('returns 409 for approve_destruction guarded update failures', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'USUL_MUSNAH')])
    queueTransactionUpdates([])

    const response = await postHandler({
      request: lifecycleRequest({
        action: 'approve_destruction',
        confirmation: 'SETUJUI PEMUSNAHAN ARSIP',
        reason: 'Retensi selesai',
      }),
      params: { id: ARCHIVE_ID },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'Status arsip berubah. Muat ulang data dan coba lagi.',
    })
  })

  it('does not import storage, file deletion, proposal, audit-log, or canonicalization helpers', () => {
    const source = readFileSync('src/routes/api/arsiparis/arsip/$id/lifecycle.ts', 'utf8')

    expect(source).not.toContain('#/lib/storage')
    expect(source).not.toContain('#/lib/archive/unified-archive-file-actions')
    expect(source).not.toContain('storage-client')
    expect(source).not.toContain('createUnifiedArchiveAttachmentFileResponse')
    expect(source).not.toContain('deleteFile')
    expect(source).not.toContain('unlink')
    expect(source).not.toContain('rm(')
    expect(source).not.toContain('arsipUsulMusnah')
    expect(source).not.toContain('arsip_usul_musnah')
    expect(source).not.toContain('logAktivitas')
    expect(source).not.toContain('log_aktivitas')
    expect(source).not.toContain('manual-archive-canonicalization')
  })

  it('keeps responses free of paths, tokens, storage roots, SQL, env, secrets, and raw rows', async () => {
    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'AKTIF')])

    const conflict = await postHandler({
      request: lifecycleRequest({ action: 'propose_destruction' }),
      params: { id: ARCHIVE_ID },
    })

    expectNoSensitiveOutput(await conflict.json())

    queueSelectResults([canonicalArchiveRow('WORKFLOW', 'AKTIF')])
    queueTransactionUpdates([{ id: ARCHIVE_ID }])

    const success = await postHandler({
      request: lifecycleRequest({ action: 'mark_inactive' }),
      params: { id: ARCHIVE_ID },
    })

    expectNoSensitiveOutput(await success.json())
  })
})

function lifecycleRequest(body: Record<string, unknown>, origin = 'http://localhost'): Request {
  return new Request(`http://localhost/api/arsiparis/arsip/${ARCHIVE_ID}/lifecycle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  })
}

function malformedJsonRequest(): Request {
  return new Request(`http://localhost/api/arsiparis/arsip/${ARCHIVE_ID}/lifecycle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: '{"action":',
  })
}

function createSession(roles: string[], userId: string) {
  return {
    user: {
      id: userId,
      email: 'user@example.test',
    },
    userId,
    email: 'user@example.test',
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function canonicalArchiveRow(sourceType: string, statusArsip: string) {
  return {
    id: ARCHIVE_ID,
    sourceType,
    statusArsip,
  }
}

function manualSourceRow(statusArsip: string) {
  return {
    id: MANUAL_SOURCE_ID,
    statusArsip,
  }
}

function queueSelectResults(...results: unknown[][]): void {
  const queue = [...results]
  mocks.dbSelect.mockImplementation(() => createSelectBuilder(queue.shift() ?? []))
}

function createSelectBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}

  query.from = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn(async () => result)

  return query
}

function queueTransactionUpdates(...results: unknown[][]): void {
  const queue = [...results]

  mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      update: mocks.txUpdate.mockImplementation(() => ({
        set: mocks.txUpdateSet.mockImplementation(() => ({
          where: mocks.txWhere.mockImplementation(() => ({
            returning: vi.fn(async () => queue.shift() ?? []),
          })),
        })),
      })),
    }

    return operation(tx)
  })
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('raw')
}
