import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AkunDriveError } from '#/lib/google-drive/akun-repository'
import { DriveApiError } from '#/lib/google-drive/drive-errors'
import { OAuthFlowError } from '#/lib/google-drive/oauth'
import { encryptRefreshToken } from '#/lib/google-drive/token-crypto'

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const AKUN_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN_KEY = Buffer.alloc(32, 3)
const ORIGIN = 'http://localhost'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  muatRingkasanAdmin: vi.fn(),
  muatAkunUntukJob: vi.fn(),
  putuskanAkun: vi.fn(),
  mulaiHubung: vi.fn(),
  hubungkanDariAlamat: vi.fn(),
  resetFailedDeletionJobs: vi.fn(),
  createGoogleDriveClient: vi.fn(),
  revokeToken: vi.fn(),
  triggerDriveRunner: vi.fn(),
}))

vi.mock('#/lib/google-drive/runner', () => ({ triggerDriveRunner: mocks.triggerDriveRunner }))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/lib/google-drive/akun-repository', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/google-drive/akun-repository')>(),
  muatRingkasanAdmin: mocks.muatRingkasanAdmin,
  muatAkunUntukJob: mocks.muatAkunUntukJob,
  putuskanAkun: mocks.putuskanAkun,
}))

vi.mock('#/lib/google-drive/oauth', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/google-drive/oauth')>(),
  mulaiHubung: mocks.mulaiHubung,
}))

vi.mock('#/lib/google-drive/akun-connect', () => ({ hubungkanDariAlamat: mocks.hubungkanDariAlamat }))

vi.mock('#/lib/google-drive/jobs', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/google-drive/jobs')>(),
  resetFailedDeletionJobs: mocks.resetFailedDeletionJobs,
}))

vi.mock('#/lib/google-drive/drive-client', () => ({ createGoogleDriveClient: mocks.createGoogleDriveClient }))

import { Route as IndexRoute } from '#/routes/api/admin/google-drive/index'
import { Route as MulaiHubungRoute } from '#/routes/api/admin/google-drive/mulai-hubung'
import { Route as HubungkanRoute } from '#/routes/api/admin/google-drive/hubungkan'
import { Route as PutuskanRoute } from '#/routes/api/admin/google-drive/$id.putuskan'
import { Route as CobaLagiRoute } from '#/routes/api/admin/google-drive/coba-lagi-penghapusan'

type Handler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>
function handler(route: unknown, method: 'GET' | 'POST'): Handler {
  return (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[method]
}

const adminSession = {
  user: { id: ADMIN_ID, username: 'admin' }, userId: ADMIN_ID, roles: ['ADMIN'], activeRole: 'ADMIN', sessionId: 'sesi-admin',
}
const sessionFor = (role: string) => ({ ...adminSession, roles: [role], activeRole: role })

function post(path: string, body?: unknown, origin = ORIGIN): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const getReq = () => new Request('http://localhost/api/admin/google-drive')

type PostCase = { name: string; route: unknown; path: string; body?: unknown; params?: Record<string, string> }
const POSTS: PostCase[] = [
  { name: 'mulai-hubung', route: MulaiHubungRoute, path: '/api/admin/google-drive/mulai-hubung', body: { mode: 'HUBUNGKAN' } },
  { name: 'hubungkan', route: HubungkanRoute, path: '/api/admin/google-drive/hubungkan', body: { alamat: 'http://127.0.0.1:53682/?state=s&code=c' } },
  { name: 'putuskan', route: PutuskanRoute, path: `/api/admin/google-drive/${AKUN_ID}/putuskan`, body: { konfirmasi: true }, params: { id: AKUN_ID } },
  { name: 'coba-lagi-penghapusan', route: CobaLagiRoute, path: '/api/admin/google-drive/coba-lagi-penghapusan', body: {} },
]
const callPost = (c: PostCase, origin?: string, body = c.body) => handler(c.route, 'POST')({ request: post(c.path, body, origin), params: c.params })

const akunSummary = {
  id: AKUN_ID, email: 'admin@example.test', status: 'AKTIF', perlu_hubung_ulang: false, jumlah_tautan_aktif: 2, jumlah_job_gagal: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client.apps.googleusercontent.com')
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'rahasia-client')
  vi.stubEnv('DMS_DRIVE_TOKEN_KEY', TOKEN_KEY.toString('base64'))
  mocks.getLocalServerSession.mockResolvedValue(adminSession)
  mocks.muatRingkasanAdmin.mockResolvedValue({ akun_aktif: akunSummary, akun_lain: [], perlu_hapus_manual: [] })
  mocks.muatAkunUntukJob.mockResolvedValue({
    id: AKUN_ID, email: 'admin@example.test', status: 'AKTIF',
    refreshTokenEnc: encryptRefreshToken('1//refresh', TOKEN_KEY), rootFolderId: 'root', perluHubungUlang: true,
  })
  mocks.mulaiHubung.mockResolvedValue({ authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' })
  mocks.hubungkanDariAlamat.mockResolvedValue({ id: AKUN_ID, email: 'admin@example.test', status: 'AKTIF' })
  mocks.putuskanAkun.mockResolvedValue({ id: AKUN_ID, email: 'admin@example.test', jumlah_tautan_aktif: 2 })
  mocks.resetFailedDeletionJobs.mockResolvedValue(3)
  mocks.revokeToken.mockResolvedValue(undefined)
  mocks.createGoogleDriveClient.mockReturnValue({ revokeToken: mocks.revokeToken })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/admin/google-drive', () => {
  it('ADMIN -> ringkasan akun + perlu hapus manual, dikonfigurasi true, no-store', async () => {
    const res = await handler(IndexRoute, 'GET')({ request: getReq() })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ dikonfigurasi: true, akun_aktif: akunSummary, akun_lain: [], perlu_hapus_manual: [] })
  })

  it('env tidak lengkap -> tetap 200 dengan dikonfigurasi false', async () => {
    vi.stubEnv('DMS_DRIVE_TOKEN_KEY', '')
    const res = await handler(IndexRoute, 'GET')({ request: getReq() })
    expect(res.status).toBe(200)
    expect((await res.json()).dikonfigurasi).toBe(false)
  })

  it('tanpa sesi -> 401; PEGAWAI dan KEPALA_SUB_BAGIAN_UMUM -> 403', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(null)
    expect((await handler(IndexRoute, 'GET')({ request: getReq() })).status).toBe(401)
    for (const role of ['PEGAWAI', 'KEPALA_SUB_BAGIAN_UMUM']) {
      mocks.getLocalServerSession.mockResolvedValueOnce(sessionFor(role))
      const res = await handler(IndexRoute, 'GET')({ request: getReq() })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'Akses ditolak - hanya admin' })
    }
    expect(mocks.muatRingkasanAdmin).not.toHaveBeenCalled()
  })
})

describe.each(POSTS)('POST $name: pola keamanan', (c) => {
  it('Origin beda -> 403 sebelum sesi dibaca', async () => {
    const res = await callPost(c, 'http://evil.example')
    expect(res.status).toBe(403)
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
  })

  it('tanpa sesi -> 401; PEGAWAI / KEPALA_SUB_BAGIAN_UMUM -> 403', async () => {
    mocks.getLocalServerSession.mockResolvedValueOnce(null)
    expect((await callPost(c)).status).toBe(401)
    for (const role of ['PEGAWAI', 'KEPALA_SUB_BAGIAN_UMUM']) {
      mocks.getLocalServerSession.mockResolvedValueOnce(sessionFor(role))
      expect((await callPost(c)).status).toBe(403)
    }
  })

  it('env tidak lengkap -> 409 BELUM_DIKONFIGURASI', async () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '')
    const res = await callPost(c)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Fitur Google Drive belum dikonfigurasi', kode: 'BELUM_DIKONFIGURASI' })
  })
})

describe('POST mulai-hubung', () => {
  const c = POSTS[0]

  it('ADMIN -> { auth_url } dengan sessionId sesi ADMIN', async () => {
    const res = await callPost(c)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ auth_url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' })
    expect(mocks.mulaiHubung).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'sesi-admin', mode: 'HUBUNGKAN', akunId: null, loginHint: undefined,
    }))
  })

  it('HUBUNGKAN_ULANG -> login_hint email akun target; akun tidak ada / DIPUTUS -> 404', async () => {
    await callPost(c, ORIGIN, { mode: 'HUBUNGKAN_ULANG', akun_id: AKUN_ID })
    expect(mocks.mulaiHubung).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'HUBUNGKAN_ULANG', akunId: AKUN_ID, loginHint: 'admin@example.test',
    }))

    mocks.muatAkunUntukJob.mockResolvedValueOnce(null)
    expect((await callPost(c, ORIGIN, { mode: 'HUBUNGKAN_ULANG', akun_id: AKUN_ID })).status).toBe(404)
    mocks.muatAkunUntukJob.mockResolvedValueOnce({ id: AKUN_ID, email: 'a@b.test', status: 'DIPUTUS' })
    expect((await callPost(c, ORIGIN, { mode: 'HUBUNGKAN_ULANG', akun_id: AKUN_ID })).status).toBe(404)
  })

  it.each([
    ['mode salah', { mode: 'HAPUS' }],
    ['field asing', { mode: 'HUBUNGKAN', ekstra: 1 }],
    ['akun_id bukan uuid', { mode: 'GANTI', akun_id: '123' }],
    ['HUBUNGKAN_ULANG tanpa akun_id', { mode: 'HUBUNGKAN_ULANG' }],
  ])('%s -> 400', async (_label, body) => {
    expect((await callPost(c, ORIGIN, body)).status).toBe(400)
    expect(mocks.mulaiHubung).not.toHaveBeenCalled()
  })
})

describe('POST hubungkan', () => {
  const c = POSTS[1]

  it('ADMIN -> ringkasan akun', async () => {
    const res = await callPost(c)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ akun: { id: AKUN_ID, email: 'admin@example.test', status: 'AKTIF' } })
    expect(mocks.hubungkanDariAlamat).toHaveBeenCalledWith(expect.objectContaining({
      alamat: 'http://127.0.0.1:53682/?state=s&code=c',
      session: expect.objectContaining({ sessionId: 'sesi-admin', userId: ADMIN_ID }),
    }))
  })

  it.each([['alamat kosong', { alamat: '   ' }], ['field asing', { alamat: 'x', a: 1 }], ['tanpa body', undefined]])(
    '%s -> 400',
    async (_label, body) => {
      const res = await handler(HubungkanRoute, 'POST')({ request: post(c.path, body) })
      expect(res.status).toBe(400)
      expect(mocks.hubungkanDariAlamat).not.toHaveBeenCalled()
    },
  )

  it.each([
    [new OAuthFlowError('ALAMAT_TIDAK_VALID'), 400],
    [new OAuthFlowError('IZIN_DITOLAK'), 400],
    [new OAuthFlowError('IZIN_DRIVE_TIDAK_DIBERIKAN'), 400],
    [new OAuthFlowError('TANPA_REFRESH_TOKEN'), 400],
    [new OAuthFlowError('EMAIL_TIDAK_TERVERIFIKASI'), 400],
    [new OAuthFlowError('PENUKARAN_GAGAL'), 400],
    [new OAuthFlowError('STATE_KEDALUWARSA'), 409],
    [new OAuthFlowError('STATE_SESI_BERBEDA'), 409],
    [new AkunDriveError('EMAIL_BERBEDA'), 409],
    [new AkunDriveError('AKUN_BERUBAH'), 409],
    [new DriveApiError('SEMENTARA'), 502],
    [new DriveApiError('KUOTA_PENUH'), 400],
  ])('%s -> %i dengan pesan Indonesia', async (error, status) => {
    mocks.hubungkanDariAlamat.mockRejectedValueOnce(error)
    const res = await callPost(c)
    expect(res.status).toBe(status)
    const body = await res.json()
    expect(body.error).toBe(status === 502 ? 'Google Drive tidak dapat dihubungi, coba lagi' : (error as { pesan: string }).pesan)
  })

  it('galat tak terduga -> 500 pesan umum; console.error tanpa objek galat mentah', async () => {
    mocks.hubungkanDariAlamat.mockRejectedValueOnce(new Error('token 1//bocor'))
    const res = await callPost(c)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Gagal memproses permintaan Google Drive' })
    expect(console.error).toHaveBeenCalledWith('[admin/google-drive] hubungkan gagal', { kategori: 'TAK_TERDUGA' })
    for (const call of vi.mocked(console.error).mock.calls) {
      expect(call.some((arg) => arg instanceof Error)).toBe(false)
      expect(JSON.stringify(call)).not.toContain('bocor')
    }
  })
})

describe('POST putuskan', () => {
  const c = POSTS[2]

  it('ADMIN -> 200 dengan jumlah tautan aktif; revoke memakai token terdekripsi', async () => {
    const res = await callPost(c)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, jumlah_tautan_aktif: 2 })

    const args = mocks.putuskanAkun.mock.calls[0][0]
    expect(args).toMatchObject({ akunId: AKUN_ID, actorUserId: ADMIN_ID })
    await args.revoke()
    expect(mocks.createGoogleDriveClient).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: '1//refresh' }))
    expect(mocks.revokeToken).toHaveBeenCalledTimes(1)
  })

  it('akun tanpa token -> revoke null', async () => {
    mocks.muatAkunUntukJob.mockResolvedValueOnce({ id: AKUN_ID, email: 'a@b.test', status: 'NONAKTIF', refreshTokenEnc: null })
    await callPost(c)
    expect(mocks.putuskanAkun.mock.calls[0][0].revoke).toBeNull()
  })

  it('$id bukan uuid -> 404; akun tidak ditemukan -> 404; sudah diputus -> 409', async () => {
    const bad = await handler(PutuskanRoute, 'POST')({ request: post('/api/admin/google-drive/x/putuskan', { konfirmasi: true }), params: { id: 'x' } })
    expect(bad.status).toBe(404)

    mocks.muatAkunUntukJob.mockResolvedValueOnce(null)
    expect((await callPost(c)).status).toBe(404)

    mocks.putuskanAkun.mockRejectedValueOnce(new AkunDriveError('AKUN_SUDAH_DIPUTUS'))
    expect((await callPost(c)).status).toBe(409)
  })

  it('konfirmasi bukan true -> 400', async () => {
    expect((await callPost(c, ORIGIN, { konfirmasi: false })).status).toBe(400)
    expect((await callPost(c, ORIGIN, {})).status).toBe(400)
    expect(mocks.putuskanAkun).not.toHaveBeenCalled()
  })
})

describe('POST coba-lagi-penghapusan', () => {
  it('ADMIN -> { jumlah }', async () => {
    const res = await callPost(POSTS[3])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ jumlah: 3 })
    expect(mocks.resetFailedDeletionJobs).toHaveBeenCalledWith({ now: expect.any(Date) })
  })

  it('galat DB -> 500 pesan umum', async () => {
    mocks.resetFailedDeletionJobs.mockRejectedValueOnce(new Error('db'))
    const res = await callPost(POSTS[3])
    expect(res.status).toBe(500)
    expect(console.error).toHaveBeenCalledWith('[admin/google-drive] coba-lagi-penghapusan gagal', { kategori: 'TAK_TERDUGA' })
  })
})

describe('pemicu runner (section 08)', () => {
  it('GET ringkasan ADMIN memicu runner; 401/403 tidak', async () => {
    await handler(IndexRoute, 'GET')({ request: getReq() })
    expect(mocks.triggerDriveRunner).toHaveBeenCalledTimes(1)

    mocks.triggerDriveRunner.mockClear()
    mocks.getLocalServerSession.mockResolvedValueOnce(null)
    await handler(IndexRoute, 'GET')({ request: getReq() })
    mocks.getLocalServerSession.mockResolvedValueOnce(sessionFor('PEGAWAI'))
    await handler(IndexRoute, 'GET')({ request: getReq() })
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })

  it('hubungkan sukses memicu runner (job tertunda akun dijadwalkan ulang); gagal tidak', async () => {
    await callPost(POSTS[1])
    expect(mocks.triggerDriveRunner).toHaveBeenCalledTimes(1)

    mocks.triggerDriveRunner.mockClear()
    mocks.hubungkanDariAlamat.mockRejectedValueOnce(new OAuthFlowError('STATE_KEDALUWARSA'))
    expect((await callPost(POSTS[1])).status).toBe(409)
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })

  it('coba-lagi-penghapusan sukses memicu runner; galat tidak', async () => {
    await callPost(POSTS[3])
    expect(mocks.triggerDriveRunner).toHaveBeenCalledTimes(1)

    mocks.triggerDriveRunner.mockClear()
    mocks.resetFailedDeletionJobs.mockRejectedValueOnce(new Error('db'))
    await callPost(POSTS[3])
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })

  it.each(POSTS)('$name: Origin beda / tanpa sesi / non-ADMIN tidak memicu runner', async (c) => {
    await callPost(c, 'http://evil.example')
    mocks.getLocalServerSession.mockResolvedValueOnce(null)
    await callPost(c)
    for (const role of ['PEGAWAI', 'PPK', 'PPSPM', 'KEPALA_SUB_BAGIAN_UMUM', 'PENANGGUNG_JAWAB_KINERJA']) {
      mocks.getLocalServerSession.mockResolvedValueOnce(sessionFor(role))
      expect((await callPost(c)).status).toBe(403)
    }
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })
})
