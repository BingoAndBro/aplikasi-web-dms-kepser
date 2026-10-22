import { describe, expect, it } from 'vitest'

import { DriveApiError, classifyDriveError, isDriveNotFound } from '#/lib/google-drive/drive-errors'
import { TokenCryptoError } from '#/lib/google-drive/token-crypto'

/** Tiruan bentuk GaxiosError: status di error dan di response, isi respons di response.data. */
function gaxiosError(status: number, data?: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    status,
    response: { status, data },
  })
}

function driveReason(status: number, reason: string) {
  return gaxiosError(status, { error: { code: status, message: 'x', errors: [{ reason, message: 'x' }] } })
}

describe('classifyDriveError', () => {
  it('403 storageQuotaExceeded -> KUOTA_PENUH "Kuota Google Drive penuh"', () => {
    const error = classifyDriveError(driveReason(403, 'storageQuotaExceeded'))
    expect(error).toBeInstanceOf(DriveApiError)
    expect(error.kategori).toBe('KUOTA_PENUH')
    expect(error.pesan).toBe('Kuota Google Drive penuh')
    expect(error.message).toBe('Kuota Google Drive penuh')
  })

  it.each([
    ['403 userRateLimitExceeded', driveReason(403, 'userRateLimitExceeded')],
    ['403 rateLimitExceeded', driveReason(403, 'rateLimitExceeded')],
    ['403 sharingRateLimitExceeded', driveReason(403, 'sharingRateLimitExceeded')],
    ['403 dailyLimitExceeded', driveReason(403, 'dailyLimitExceeded')],
    ['408', gaxiosError(408)],
    ['429', gaxiosError(429)],
    ['500', gaxiosError(500)],
    ['503', gaxiosError(503)],
  ])('%s -> SEMENTARA', (_label, input) => {
    expect(classifyDriveError(input).kategori).toBe('SEMENTARA')
  })

  it('404 -> TIDAK_DITEMUKAN; status hanya di response juga terbaca', () => {
    expect(classifyDriveError(gaxiosError(404)).kategori).toBe('TIDAK_DITEMUKAN')
    expect(classifyDriveError({ response: { status: 404 } }).kategori).toBe('TIDAK_DITEMUKAN')
    expect(isDriveNotFound(gaxiosError(404))).toBe(true)
    expect(isDriveNotFound(gaxiosError(500))).toBe(false)
  })

  it('invalid_grant (400) dan 401 -> TOKEN_TIDAK_VALID', () => {
    expect(classifyDriveError(gaxiosError(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })).kategori)
      .toBe('TOKEN_TIDAK_VALID')
    expect(classifyDriveError(gaxiosError(401)).kategori).toBe('TOKEN_TIDAK_VALID')
  })

  it.each(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE'])(
    'galat jaringan %s -> SEMENTARA (langsung maupun terbungkus cause)',
    (code) => {
      expect(classifyDriveError(Object.assign(new Error('net'), { code })).kategori).toBe('SEMENTARA')
      const wrapped = new Error('request failed', {
        cause: new TypeError('fetch failed', { cause: Object.assign(new Error('socket'), { code }) }),
      })
      expect(classifyDriveError(wrapped).kategori).toBe('SEMENTARA')
    },
  )

  it('timeout/abort -> SEMENTARA', () => {
    expect(classifyDriveError(Object.assign(new Error('aborted'), { name: 'AbortError' })).kategori).toBe('SEMENTARA')
    expect(classifyDriveError(Object.assign(new Error('timeout'), { code: 'TimeoutError' })).kategori).toBe('SEMENTARA')
  })

  it('TokenCryptoError -> TOKEN_TIDAK_VALID', () => {
    expect(classifyDriveError(new TokenCryptoError('DEKRIPSI_GAGAL')).kategori).toBe('TOKEN_TIDAK_VALID')
    expect(classifyDriveError(new TokenCryptoError('FORMAT_TIDAK_DIKENAL')).kategori).toBe('TOKEN_TIDAK_VALID')
  })

  it('DriveApiError dikembalikan apa adanya', () => {
    const original = new DriveApiError('KUOTA_PENUH')
    expect(classifyDriveError(original)).toBe(original)
  })

  it.each([
    ['403 reason tak dikenal', driveReason(403, 'insufficientFilePermissions')],
    ['403 tanpa reason', gaxiosError(403)],
    ['400 lain', driveReason(400, 'badRequest')],
    ['undefined', undefined],
    ['string', 'gagal'],
    ['null', null],
    ['Error tanpa status', new Error('aneh')],
  ])('%s -> PERMANEN dengan pesan umum', (_label, input) => {
    const error = classifyDriveError(input)
    expect(error.kategori).toBe('PERMANEN')
    expect(error.message).toBe('Google Drive menolak permintaan')
  })

  it('pesan galat tidak memuat isi response.data', () => {
    const secret = 'ya29.TOKEN-PALSU-RAHASIA'
    for (const input of [
      gaxiosError(400, { error: 'invalid_grant', error_description: secret }),
      gaxiosError(403, { error: { message: secret, errors: [{ reason: 'storageQuotaExceeded', message: secret }] } }),
      gaxiosError(500, secret),
      gaxiosError(418, { access_token: secret }),
    ]) {
      const error = classifyDriveError(input)
      expect(`${error.message} ${error.pesan} ${JSON.stringify(error)}`).not.toContain(secret)
      expect(error.cause).toBeUndefined()
    }
  })
})
