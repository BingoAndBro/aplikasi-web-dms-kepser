import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DOC_A = '33333333-3333-4333-8333-333333333333'
const TAUTAN_ID = '99999999-9999-4999-8999-999999999999'
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  createTautanForSession: vi.fn(),
  requireTautanViewer: vi.fn(),
  buildTautanDetail: vi.fn(),
  recordTautanAccess: vi.fn(),
  revokeTautanByCreator: vi.fn(),
  listTautanByCreator: vi.fn(),
  loadDriveRingkasanByTautanIds: vi.fn(),
  toTautanListItemArgs: [] as unknown[][],
  triggerDriveRunner: vi.fn(),
}))

vi.mock('#/lib/google-drive/runner', () => ({ triggerDriveRunner: mocks.triggerDriveRunner }))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/lib/laporan/tautan', () => ({
  createTautanForSession: mocks.createTautanForSession,
  requireTautanViewer: mocks.requireTautanViewer,
  buildTautanDetail: mocks.buildTautanDetail,
  getTautanPublicBaseUrl: () => null,
  toTautanListItem: (
    row: { id: string; token: string; akses: string; dokumenIds: string[]; manualArsipIds: string[]; driveStatus?: string },
    ...rest: unknown[]
  ) => {
    mocks.toTautanListItemArgs.push([row, ...rest])
    return {
      id: row.id,
      akses: row.akses,
      path: row.akses === 'DRIVE' ? null : `/tautan/${row.token}`,
      jumlah_dokumen: row.dokumenIds.length + row.manualArsipIds.length,
      drive_status: row.driveStatus,
    }
  },
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
}))

vi.mock('#/lib/laporan/tautan-repository', () => ({
  recordTautanAccess: mocks.recordTautanAccess,
  revokeTautanByCreator: mocks.revokeTautanByCreator,
  listTautanByCreator: mocks.listTautanByCreator,
  loadDriveRingkasanByTautanIds: mocks.loadDriveRingkasanByTautanIds,
}))

import { Route as TautanRoute } from '#/routes/api/laporan/tautan'
import { Route as RevokeRoute } from '#/routes/api/laporan/tautan.$id.revoke'
import { Route as ViewerRoute } from '#/routes/api/tautan.$token'

type Handler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>

function handler(route: unknown, method: 'GET' | 'POST'): Handler {
  return (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[method]
}

function postRequest(url: string, body: unknown, origin = 'http://localhost'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
}

const session = {
  user: { id: USER_ID, username: 'budi' },
  userId: USER_ID,
  roles: ['PEGAWAI'],
  activeRole: 'PEGAWAI',
  sessionId: 'session-1',
}

const validBody = {
  sumber: 'LAPORAN_SAYA',
  judul: '  Laporan Saya - Oktober 2026  ',
  keterangan: 'Periode: Oktober 2026',
  dokumen_ids: [DOC_A],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.toTautanListItemArgs.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  mocks.getLocalServerSession.mockResolvedValue(session)
})

describe('POST /api/laporan/tautan', () => {
  const post = handler(TautanRoute, 'POST')

  it('rejects cross-origin requests', async () => {
    const response = await post({ request: postRequest('http://localhost/api/laporan/tautan', validBody, 'https://evil.example') })

    expect(response.status).toBe(403)
    expect(mocks.createTautanForSession).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await post({ request: postRequest('http://localhost/api/laporan/tautan', validBody) })

    expect(response.status).toBe(401)
  })

  it.each([
    [{ ...validBody, judul: '   ' }],
    [{ ...validBody, dokumen_ids: [] }],
    [{ ...validBody, dokumen_ids: ['not-a-uuid'] }],
    [{ ...validBody, sumber: 'LAPORAN_LAIN' }],
    [{ ...validBody, akses: 'SEMUA_ORANG' }],
    [{ ...validBody, manual_arsip_ids: [DOC_A] }], // Laporan Saya tidak punya dokumen KSBU
    [{ ...validBody, extra: true }],
  ])('rejects an invalid body %#', async (body) => {
    const response = await post({ request: postRequest('http://localhost/api/laporan/tautan', body) })

    expect(response.status).toBe(400)
    expect(mocks.createTautanForSession).not.toHaveBeenCalled()
  })

  it('creates the tautan from the trimmed request and returns its page path', async () => {
    mocks.createTautanForSession.mockResolvedValue({
      ok: true,
      tautan: { id: TAUTAN_ID, token: TOKEN, sumber: 'LAPORAN_SAYA', akses: 'PUBLIK', dokumenIds: [DOC_A], manualArsipIds: [] },
      jumlahDiabaikan: 0,
    })

    const response = await post({ request: postRequest('http://localhost/api/laporan/tautan', { ...validBody, akses: 'PUBLIK' }) })

    expect(response.status).toBe(201)
    expect(mocks.createTautanForSession).toHaveBeenCalledWith(session, expect.objectContaining({
      akses: 'PUBLIK',
      judul: 'Laporan Saya - Oktober 2026',
      dokumen_ids: [DOC_A],
      manual_arsip_ids: [],
    }))
    await expect(response.json()).resolves.toEqual({
      id: TAUTAN_ID,
      akses: 'PUBLIK',
      path: `/tautan/${TOKEN}`,
      public_base_url: null,
      jumlah_dokumen: 1,
      jumlah_diabaikan: 0,
    })
  })

  it('defaults to a login-only tautan when akses is omitted', async () => {
    mocks.createTautanForSession.mockResolvedValue({
      ok: true,
      tautan: { id: TAUTAN_ID, token: TOKEN, sumber: 'LAPORAN_SAYA', akses: 'LOGIN', dokumenIds: [DOC_A], manualArsipIds: [] },
      jumlahDiabaikan: 0,
    })

    await post({ request: postRequest('http://localhost/api/laporan/tautan', validBody) })

    expect(mocks.createTautanForSession).toHaveBeenCalledWith(session, expect.objectContaining({ akses: 'LOGIN' }))
  })

  it('passes scoping failures through with their status', async () => {
    mocks.createTautanForSession.mockResolvedValue({ ok: false, status: 403, error: 'Hanya PJ Kinerja' })

    const response = await post({ request: postRequest('http://localhost/api/laporan/tautan', { ...validBody, sumber: 'LAPORAN_KINERJA' }) })

    expect(response.status).toBe(403)
  })
})

describe('POST /api/laporan/tautan — akses DRIVE', () => {
  const post = handler(TautanRoute, 'POST')

  it('creates a DRIVE tautan: 201 without a DMS path, drive_status MENUNGGU, runner triggered', async () => {
    mocks.createTautanForSession.mockResolvedValue({
      ok: true,
      tautan: { id: TAUTAN_ID, token: TOKEN, sumber: 'LAPORAN_SAYA', akses: 'DRIVE', driveStatus: 'MENUNGGU', dokumenIds: [DOC_A], manualArsipIds: [] },
      jumlahDiabaikan: 0,
    })

    const response = await post({ request: postRequest('http://localhost/api/laporan/tautan', { ...validBody, akses: 'DRIVE' }) })

    expect(response.status).toBe(201)
    expect(mocks.createTautanForSession).toHaveBeenCalledWith(session, expect.objectContaining({ akses: 'DRIVE' }))
    const body = await response.json()
    expect(body).toEqual({
      id: TAUTAN_ID,
      akses: 'DRIVE',
      path: null,
      drive_status: 'MENUNGGU',
      public_base_url: null,
      jumlah_dokumen: 1,
      jumlah_diabaikan: 0,
    })
    expect(JSON.stringify(body)).not.toContain(TOKEN)
    expect(mocks.triggerDriveRunner).toHaveBeenCalledTimes(1)
  })

  it('does not trigger the runner for LOGIN / PUBLIK tautan', async () => {
    mocks.createTautanForSession.mockResolvedValue({
      ok: true,
      tautan: { id: TAUTAN_ID, token: TOKEN, sumber: 'LAPORAN_SAYA', akses: 'LOGIN', dokumenIds: [DOC_A], manualArsipIds: [] },
      jumlahDiabaikan: 0,
    })

    await post({ request: postRequest('http://localhost/api/laporan/tautan', validBody) })

    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })

  it('maps Drive unavailability to 409 with the reason code, without triggering the runner', async () => {
    mocks.createTautanForSession.mockResolvedValue({
      ok: false, status: 409, error: 'Belum ada akun Google Drive terhubung — hubungi Admin', kode: 'BELUM_ADA_AKUN',
    })

    const response = await post({ request: postRequest('http://localhost/api/laporan/tautan', { ...validBody, akses: 'DRIVE' }) })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Belum ada akun Google Drive terhubung — hubungi Admin',
      kode: 'BELUM_ADA_AKUN',
    })
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })

  it('logs only ids, sumber, akses, and count — never the token', async () => {
    mocks.createTautanForSession.mockResolvedValue({
      ok: true,
      tautan: { id: TAUTAN_ID, token: TOKEN, sumber: 'LAPORAN_SAYA', akses: 'DRIVE', driveStatus: 'MENUNGGU', dokumenIds: [DOC_A], manualArsipIds: [] },
      jumlahDiabaikan: 0,
    })

    await post({ request: postRequest('http://localhost/api/laporan/tautan', { ...validBody, akses: 'DRIVE' }) })

    const logged = JSON.stringify(vi.mocked(console.info).mock.calls)
    expect(logged).toContain('DRIVE')
    expect(logged).not.toContain(TOKEN)
  })

  it('500 does not leak the error and does not trigger the runner', async () => {
    mocks.createTautanForSession.mockRejectedValue(new Error(`boom ${TOKEN}`))

    const response = await post({ request: postRequest('http://localhost/api/laporan/tautan', { ...validBody, akses: 'DRIVE' }) })

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain(TOKEN)
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })
})

describe('GET /api/laporan/tautan — riwayat dengan status Drive', () => {
  const get = handler(TautanRoute, 'GET')
  const DRIVE_ID = '88888888-8888-4888-8888-888888888888'

  it('requires a session', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await get({ request: new Request('http://localhost/api/laporan/tautan') })

    expect(response.status).toBe(401)
    expect(mocks.listTautanByCreator).not.toHaveBeenCalled()
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })

  it('rejects an invalid sumber with 400', async () => {
    const response = await get({ request: new Request('http://localhost/api/laporan/tautan?sumber=SEMUA') })

    expect(response.status).toBe(400)
    expect(mocks.listTautanByCreator).not.toHaveBeenCalled()
  })

  it('loads the Drive summary only for DRIVE rows, passes it per row, and triggers the runner', async () => {
    const login = { id: TAUTAN_ID, token: TOKEN, akses: 'LOGIN', dokumenIds: [DOC_A], manualArsipIds: [] }
    const drive = { id: DRIVE_ID, token: 'ZyXwVuTsRqPoNmLkJiHgFeDcBa987654', akses: 'DRIVE', driveStatus: 'MENGUNGGAH', dokumenIds: [DOC_A], manualArsipIds: [] }
    const ringkasan = { selesai: 1, total: 3, galat: null, akunPerluHubungUlang: true }
    mocks.listTautanByCreator.mockResolvedValue([login, drive])
    mocks.loadDriveRingkasanByTautanIds.mockResolvedValue(new Map([[DRIVE_ID, ringkasan]]))

    const response = await get({ request: new Request('http://localhost/api/laporan/tautan?sumber=LAPORAN_SAYA') })

    expect(response.status).toBe(200)
    expect(mocks.listTautanByCreator).toHaveBeenCalledWith(USER_ID, 'LAPORAN_SAYA')
    expect(mocks.loadDriveRingkasanByTautanIds).toHaveBeenCalledWith([DRIVE_ID])
    expect(mocks.toTautanListItemArgs).toEqual([[login, undefined], [drive, ringkasan]])
    const body = await response.json()
    expect(body.tautan.map((item: { path: string | null }) => item.path)).toEqual([`/tautan/${TOKEN}`, null])
    expect(mocks.triggerDriveRunner).toHaveBeenCalledTimes(1)
  })

  it('skips the Drive summary query when there are no DRIVE rows', async () => {
    mocks.listTautanByCreator.mockResolvedValue([{ id: TAUTAN_ID, token: TOKEN, akses: 'PUBLIK', dokumenIds: [DOC_A], manualArsipIds: [] }])

    const response = await get({ request: new Request('http://localhost/api/laporan/tautan') })

    expect(response.status).toBe(200)
    expect(mocks.loadDriveRingkasanByTautanIds).not.toHaveBeenCalled()
  })

  it('500 when the summary fails, without leaking details', async () => {
    mocks.listTautanByCreator.mockResolvedValue([{ id: DRIVE_ID, token: TOKEN, akses: 'DRIVE', dokumenIds: [], manualArsipIds: [] }])
    mocks.loadDriveRingkasanByTautanIds.mockRejectedValue(new Error('relation app.drive_job does not exist'))

    const response = await get({ request: new Request('http://localhost/api/laporan/tautan') })

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('drive_job')
  })
})

describe('POST /api/laporan/tautan/$id/revoke', () => {
  const post = handler(RevokeRoute, 'POST')

  it('only revokes the caller\'s own tautan', async () => {
    mocks.revokeTautanByCreator.mockResolvedValue('not_found')

    const response = await post({
      request: postRequest(`http://localhost/api/laporan/tautan/${TAUTAN_ID}/revoke`, {}),
      params: { id: TAUTAN_ID },
    })

    expect(mocks.revokeTautanByCreator).toHaveBeenCalledWith(TAUTAN_ID, USER_ID)
    expect(response.status).toBe(404)
  })

  it('succeeds for a revoked or already-revoked tautan', async () => {
    mocks.revokeTautanByCreator.mockResolvedValue('already_revoked')

    const response = await post({
      request: postRequest(`http://localhost/api/laporan/tautan/${TAUTAN_ID}/revoke`, {}),
      params: { id: TAUTAN_ID },
    })

    expect(response.status).toBe(200)
  })
})

describe('GET /api/tautan/$token', () => {
  const get = handler(ViewerRoute, 'GET')

  it('returns the viewer guard response as-is (401 / 404 / 410)', async () => {
    mocks.requireTautanViewer.mockResolvedValue(Response.json({ error: 'Tautan ini sudah dicabut oleh pembuatnya.' }, { status: 410 }))

    const response = await get({ request: new Request(`http://localhost/api/tautan/${TOKEN}`), params: { token: TOKEN } })

    expect(response.status).toBe(410)
    expect(mocks.buildTautanDetail).not.toHaveBeenCalled()
    expect(mocks.recordTautanAccess).not.toHaveBeenCalled()
  })

  it('returns the detail and counts the access', async () => {
    const tautan = { id: TAUTAN_ID }
    mocks.requireTautanViewer.mockResolvedValue({ session, tautan })
    mocks.buildTautanDetail.mockResolvedValue({ judul: 'X', dokumen: [] })

    const response = await get({ request: new Request(`http://localhost/api/tautan/${TOKEN}`), params: { token: TOKEN } })

    expect(response.status).toBe(200)
    expect(mocks.recordTautanAccess).toHaveBeenCalledWith(TAUTAN_ID)
    await expect(response.json()).resolves.toEqual({ judul: 'X', dokumen: [] })
  })

  it('still opens the tautan when the access counter fails', async () => {
    mocks.requireTautanViewer.mockResolvedValue({ session, tautan: { id: TAUTAN_ID } })
    mocks.buildTautanDetail.mockResolvedValue({ judul: 'X', dokumen: [] })
    mocks.recordTautanAccess.mockRejectedValue(new Error('db down'))

    const response = await get({ request: new Request(`http://localhost/api/tautan/${TOKEN}`), params: { token: TOKEN } })

    expect(response.status).toBe(200)
  })
})
