import { beforeEach, describe, expect, it, vi } from 'vitest'

const AKUN_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  getDriveAvailability: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/lib/google-drive/availability', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/google-drive/availability')>(),
  getDriveAvailability: mocks.getDriveAvailability,
}))

import { Route } from '#/routes/api/google-drive/status'

type Handler = (args: { request: Request }) => Promise<Response>
const get = (Route as unknown as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET
const request = () => new Request('http://localhost/api/google-drive/status')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.getLocalServerSession.mockResolvedValue({
    user: { id: 'u1', username: 'budi' }, userId: 'u1', roles: ['PEGAWAI'], activeRole: 'PEGAWAI', sessionId: 's1',
  })
})

describe('GET /api/google-drive/status', () => {
  it('sesi PEGAWAI -> 200 { tersedia, alasan } tanpa akunId/email, no-store', async () => {
    mocks.getDriveAvailability.mockResolvedValue({ tersedia: true, alasan: null, akunId: AKUN_ID })
    const res = await get({ request: request() })

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const raw = await res.text()
    expect(JSON.parse(raw)).toEqual({ tersedia: true, alasan: null })
    expect(raw).not.toContain(AKUN_ID)
    expect(raw).not.toMatch(/email|akun|token/i)
  })

  it('tidak tersedia -> alasan diteruskan', async () => {
    mocks.getDriveAvailability.mockResolvedValue({ tersedia: false, alasan: 'PERLU_HUBUNG_ULANG' })
    const res = await get({ request: request() })
    expect(await res.json()).toEqual({ tersedia: false, alasan: 'PERLU_HUBUNG_ULANG' })
  })

  it('tanpa sesi -> 401 tanpa memeriksa ketersediaan', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)
    const res = await get({ request: request() })
    expect(res.status).toBe(401)
    expect(mocks.getDriveAvailability).not.toHaveBeenCalled()
  })

  it('galat tak terduga -> 500 pesan umum; log tanpa objek galat', async () => {
    mocks.getDriveAvailability.mockRejectedValue(new Error('koneksi postgres://rahasia'))
    const res = await get({ request: request() })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Gagal memproses permintaan Google Drive' })
    for (const call of vi.mocked(console.error).mock.calls) {
      expect(call.some((arg) => arg instanceof Error)).toBe(false)
      expect(JSON.stringify(call)).not.toContain('rahasia')
    }
  })
})
