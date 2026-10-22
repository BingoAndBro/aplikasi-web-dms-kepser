import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hubungkanDariAlamat, type AkunConnectRepo } from '#/lib/google-drive/akun-connect'
import { AkunDriveError } from '#/lib/google-drive/akun-repository'
import { GOOGLE_DRIVE_FILE_SCOPE, type DriveConfig } from '#/lib/google-drive/config'
import { DriveApiError } from '#/lib/google-drive/drive-errors'
import { OAuthFlowError, mulaiHubung, resetOAuthStoreForTest, type OAuthClientLike } from '#/lib/google-drive/oauth'
import type { MulaiHubungMode } from '#/lib/google-drive/shared'
import { decryptRefreshToken } from '#/lib/google-drive/token-crypto'

import { FakeDrive } from './helpers/fake-drive'

const NOW = new Date('2026-10-22T03:00:00.000Z')
const config: DriveConfig = { clientId: 'client-uji', clientSecret: 'rahasia', tokenKey: Buffer.alloc(32, 9) }
const session = { sessionId: 'sesi-admin', userId: 'user-admin' }
const REFRESH = '1//refresh-baru'
const AKUN_ID = '22222222-2222-4222-8222-222222222222'

function oauthClient(email = 'admin@example.test') {
  let state = ''
  const client: OAuthClientLike = {
    generateCodeVerifierAsync: async () => ({ codeVerifier: 'verifier', codeChallenge: 'challenge' }),
    generateAuthUrl: (opts) => {
      state = opts.state
      return 'https://accounts.google.com/o/oauth2/v2/auth'
    },
    getToken: vi.fn(async () => ({ tokens: { refresh_token: REFRESH, id_token: 'idt', scope: `openid ${GOOGLE_DRIVE_FILE_SCOPE}` } })),
    verifyIdToken: async () => ({ getPayload: () => ({ email, email_verified: true }) }),
  }
  return { client, getState: () => state }
}

function fakeRepo(overrides: Partial<Pick<AkunConnectRepo, 'cariAkunBelumDiputus' | 'muatAkunUntukJob'>> = {}) {
  return {
    cariAkunBelumDiputus: vi.fn<AkunConnectRepo['cariAkunBelumDiputus']>(async () => null),
    muatAkunUntukJob: vi.fn<AkunConnectRepo['muatAkunUntukJob']>(async () => null),
    simpanAkunTerhubung: vi.fn<AkunConnectRepo['simpanAkunTerhubung']>(async (input) => ({
      id: input.akunIdTarget ?? AKUN_ID, email: input.email, status: 'AKTIF',
    })),
    ...overrides,
  }
}

async function siapkan(mode: MulaiHubungMode = 'HUBUNGKAN', email?: string, akunId?: string) {
  const { client, getState } = oauthClient(email)
  await mulaiHubung({ sessionId: session.sessionId, mode, akunId, now: NOW, deps: { config, createOAuthClient: () => client } })
  return { client, alamat: `http://127.0.0.1:53682/?state=${getState()}&code=kode-otorisasi&scope=x` }
}

beforeEach(() => {
  resetOAuthStoreForTest()
})

describe('hubungkanDariAlamat', () => {
  it('hubungkan pertama: membuat folder akar DMS Kepser lalu menyimpan token terenkripsi', async () => {
    const { client, alamat } = await siapkan()
    const drive = new FakeDrive()
    const repo = fakeRepo()
    const driveClientForToken = vi.fn(() => drive)

    const result = await hubungkanDariAlamat({
      alamat, session, now: NOW, deps: { config, createOAuthClient: () => client, driveClientForToken, repo },
    })

    expect(result).toEqual({ id: AKUN_ID, email: 'admin@example.test', status: 'AKTIF' })
    expect(driveClientForToken).toHaveBeenCalledWith(REFRESH)
    const folders = [...drive.objects.values()]
    expect(folders).toHaveLength(1)
    expect(folders[0]).toMatchObject({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' }, parents: [] })

    const saved = repo.simpanAkunTerhubung.mock.calls[0][0]
    expect(saved).toMatchObject({
      email: 'admin@example.test', rootFolderId: folders[0].id, mode: 'HUBUNGKAN', akunIdTarget: null,
      actorUserId: session.userId, now: NOW,
    })
    expect(saved.refreshTokenEnc).not.toContain(REFRESH)
    expect(decryptRefreshToken(saved.refreshTokenEnc, config.tokenKey)).toBe(REFRESH)
  })

  it('akun email sama yang dipakai ulang: root lama masih ada -> dipakai ulang tanpa folder baru', async () => {
    const { client, alamat } = await siapkan('GANTI')
    const drive = new FakeDrive()
    const { id: rootLama } = await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })
    const repo = fakeRepo({
      cariAkunBelumDiputus: vi.fn(async () => ({ id: AKUN_ID, email: 'admin@example.test', status: 'NONAKTIF' as const, rootFolderId: rootLama })),
    })

    await hubungkanDariAlamat({ alamat, session, now: NOW, deps: { config, createOAuthClient: () => client, driveClientForToken: () => drive, repo } })

    expect(drive.objects.size).toBe(1)
    expect(repo.simpanAkunTerhubung.mock.calls[0][0]).toMatchObject({ rootFolderId: rootLama, mode: 'GANTI' })
  })

  it('root lama sudah dihapus (404) -> folder akar baru dibuat', async () => {
    const { client, alamat } = await siapkan()
    const drive = new FakeDrive()
    const repo = fakeRepo({
      cariAkunBelumDiputus: vi.fn(async () => ({ id: AKUN_ID, email: 'admin@example.test', status: 'AKTIF' as const, rootFolderId: 'root-hilang' })),
    })

    await hubungkanDariAlamat({ alamat, session, now: NOW, deps: { config, createOAuthClient: () => client, driveClientForToken: () => drive, repo } })

    const [baru] = [...drive.objects.values()]
    expect(baru.name).toBe('DMS Kepser')
    expect(repo.simpanAkunTerhubung.mock.calls[0][0].rootFolderId).toBe(baru.id)
  })

  it('HUBUNGKAN_ULANG: memakai akun target dari state; email berbeda -> EMAIL_BERBEDA sebelum menyentuh Drive', async () => {
    const { client, alamat } = await siapkan('HUBUNGKAN_ULANG', 'orang-lain@example.test', AKUN_ID)
    const drive = new FakeDrive()
    const repo = fakeRepo({
      muatAkunUntukJob: vi.fn(async () => ({
        id: AKUN_ID, email: 'admin@example.test', status: 'AKTIF' as const, refreshTokenEnc: 'x', rootFolderId: 'r', perluHubungUlang: true,
      })),
    })

    await expect(hubungkanDariAlamat({
      alamat, session, now: NOW, deps: { config, createOAuthClient: () => client, driveClientForToken: () => drive, repo },
    })).rejects.toMatchObject({ kode: 'EMAIL_BERBEDA' })
    expect(drive.calls).toHaveLength(0)
    expect(repo.simpanAkunTerhubung).not.toHaveBeenCalled()
  })

  it('HUBUNGKAN_ULANG email sama -> simpan dengan akunIdTarget dan mode dari state', async () => {
    const { client, alamat } = await siapkan('HUBUNGKAN_ULANG', 'Admin@Example.test', AKUN_ID)
    const drive = new FakeDrive()
    const { id: root } = await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })
    const akun = { id: AKUN_ID, email: 'admin@example.test', status: 'NONAKTIF' as const, rootFolderId: root }
    const repo = fakeRepo({
      muatAkunUntukJob: vi.fn(async () => ({ ...akun, refreshTokenEnc: null, perluHubungUlang: true })),
      cariAkunBelumDiputus: vi.fn(async () => akun),
    })

    await hubungkanDariAlamat({ alamat, session, now: NOW, deps: { config, createOAuthClient: () => client, driveClientForToken: () => drive, repo } })
    expect(repo.simpanAkunTerhubung.mock.calls[0][0]).toMatchObject({
      mode: 'HUBUNGKAN_ULANG', akunIdTarget: AKUN_ID, email: 'admin@example.test', rootFolderId: root,
    })
  })

  it('HUBUNGKAN_ULANG akun target sudah tidak ada atau DIPUTUS -> AKUN_BERUBAH', async () => {
    for (const akun of [null, { id: AKUN_ID, email: 'admin@example.test', status: 'DIPUTUS' as const, refreshTokenEnc: null, rootFolderId: null, perluHubungUlang: false }]) {
      resetOAuthStoreForTest()
      const { client, alamat } = await siapkan('HUBUNGKAN_ULANG', 'admin@example.test', AKUN_ID)
      const repo = fakeRepo({ muatAkunUntukJob: vi.fn(async () => akun) })
      const error = await hubungkanDariAlamat({
        alamat, session, now: NOW, deps: { config, createOAuthClient: () => client, driveClientForToken: () => new FakeDrive(), repo },
      }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(AkunDriveError)
      expect((error as AkunDriveError).kode).toBe('AKUN_BERUBAH')
    }
  })

  it('alamat error=access_denied -> IZIN_DITOLAK dan state ikut habis', async () => {
    const { client, alamat } = await siapkan()
    const ditolak = alamat.replace('code=kode-otorisasi', 'error=access_denied')
    const deps = { config, createOAuthClient: () => client, driveClientForToken: () => new FakeDrive(), repo: fakeRepo() }

    await expect(hubungkanDariAlamat({ alamat: ditolak, session, now: NOW, deps })).rejects.toMatchObject({ kode: 'IZIN_DITOLAK' })
    expect(client.getToken).not.toHaveBeenCalled()
    await expect(hubungkanDariAlamat({ alamat, session, now: NOW, deps })).rejects.toMatchObject({ kode: 'STATE_KEDALUWARSA' })
  })

  it('state sesi lain / alamat rusak -> OAuthFlowError tanpa menukar code', async () => {
    const { client, alamat } = await siapkan()
    const deps = { config, createOAuthClient: () => client, driveClientForToken: () => new FakeDrive(), repo: fakeRepo() }
    await expect(hubungkanDariAlamat({ alamat, session: { ...session, sessionId: 'lain' }, now: NOW, deps }))
      .rejects.toMatchObject({ kode: 'STATE_SESI_BERBEDA' })
    await expect(hubungkanDariAlamat({ alamat: 'bukan alamat', session, now: NOW, deps }))
      .rejects.toBeInstanceOf(OAuthFlowError)
    expect(client.getToken).not.toHaveBeenCalled()
  })

  it('galat Drive saat membuat folder akar dilempar sebagai DriveApiError dan akun tidak disimpan', async () => {
    const { client, alamat } = await siapkan()
    const drive = new FakeDrive()
    drive.failNext('createFolder', 'SEMENTARA')
    const repo = fakeRepo()
    await expect(hubungkanDariAlamat({
      alamat, session, now: NOW, deps: { config, createOAuthClient: () => client, driveClientForToken: () => drive, repo },
    })).rejects.toBeInstanceOf(DriveApiError)
    expect(repo.simpanAkunTerhubung).not.toHaveBeenCalled()
  })
})
