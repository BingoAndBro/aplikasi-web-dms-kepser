import { describe, expect, it, vi } from 'vitest'

import { getDriveAvailability, toStatusResponse } from '#/lib/google-drive/availability'

const ENV_LENGKAP = {
  GOOGLE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'rahasia',
  DMS_DRIVE_TOKEN_KEY: Buffer.alloc(32, 1).toString('base64'),
} as NodeJS.ProcessEnv

const AKUN_ID = '11111111-1111-4111-8111-111111111111'
const sehat = { id: AKUN_ID, email: 'admin@example.test', refreshTokenEnc: 'v1:a:b:c', perluHubungUlangSejak: null }

describe('getDriveAvailability', () => {
  it('env lengkap + akun aktif sehat -> tersedia dengan akunId', async () => {
    const av = await getDriveAvailability({ env: ENV_LENGKAP, loadAkunAktif: async () => sehat })
    expect(av).toEqual({ tersedia: true, alasan: null, akunId: AKUN_ID })
  })

  it('env tidak lengkap -> BELUM_DIKONFIGURASI tanpa menyentuh DB', async () => {
    const loadAkunAktif = vi.fn(async () => sehat)
    const env = { ...ENV_LENGKAP, DMS_DRIVE_TOKEN_KEY: 'pendek' }
    expect(await getDriveAvailability({ env, loadAkunAktif })).toEqual({ tersedia: false, alasan: 'BELUM_DIKONFIGURASI' })
    expect(await getDriveAvailability({ env: {}, loadAkunAktif })).toEqual({ tersedia: false, alasan: 'BELUM_DIKONFIGURASI' })
    expect(loadAkunAktif).not.toHaveBeenCalled()
  })

  it('tanpa akun AKTIF -> BELUM_ADA_AKUN', async () => {
    expect(await getDriveAvailability({ env: ENV_LENGKAP, loadAkunAktif: async () => null }))
      .toEqual({ tersedia: false, alasan: 'BELUM_ADA_AKUN' })
  })

  it('akun aktif perlu hubung ulang atau token kosong -> PERLU_HUBUNG_ULANG', async () => {
    for (const akun of [
      { ...sehat, perluHubungUlangSejak: new Date('2026-10-22T00:00:00Z') },
      { ...sehat, refreshTokenEnc: null },
    ]) {
      expect(await getDriveAvailability({ env: ENV_LENGKAP, loadAkunAktif: async () => akun }))
        .toEqual({ tersedia: false, alasan: 'PERLU_HUBUNG_ULANG' })
    }
  })
})

describe('toStatusResponse', () => {
  it('membuang akunId (tidak pernah dikirim ke klien)', () => {
    const json = JSON.stringify(toStatusResponse({ tersedia: true, alasan: null, akunId: AKUN_ID }))
    expect(JSON.parse(json)).toEqual({ tersedia: true, alasan: null })
    expect(json).not.toContain(AKUN_ID)
    expect(toStatusResponse({ tersedia: false, alasan: 'BELUM_ADA_AKUN' })).toEqual({ tersedia: false, alasan: 'BELUM_ADA_AKUN' })
  })
})
