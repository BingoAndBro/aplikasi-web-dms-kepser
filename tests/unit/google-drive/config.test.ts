import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  DRIVE_MAX_FILE_BYTES,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_OAUTH_SCOPES,
  isDriveConfigured,
  readDriveConfig,
} from '#/lib/google-drive/config'
import { DOCUMENT_UPLOAD_MAX_BYTES } from '#/lib/upload/document-upload-policy'

const KEY = randomBytes(32)

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'rahasia-klien',
    DMS_DRIVE_TOKEN_KEY: KEY.toString('base64'),
    ...overrides,
  }
}

describe('readDriveConfig', () => {
  it('menerima tiga env valid dengan kunci base64 32 byte', () => {
    const result = readDriveConfig(env())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.clientId).toBe('client-id.apps.googleusercontent.com')
    expect(result.config.clientSecret).toBe('rahasia-klien')
    expect(result.config.tokenKey).toHaveLength(32)
    expect(result.config.tokenKey.equals(KEY)).toBe(true)
    expect(isDriveConfigured(env())).toBe(true)
  })

  it('menerima kunci base64url tanpa padding', () => {
    const result = readDriveConfig(env({ DMS_DRIVE_TOKEN_KEY: KEY.toString('base64url') }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.config.tokenKey.equals(KEY)).toBe(true)
  })

  it('men-trim spasi di sekitar nilai env', () => {
    const result = readDriveConfig(env({
      GOOGLE_OAUTH_CLIENT_ID: '  client-id  ',
      GOOGLE_OAUTH_CLIENT_SECRET: '\trahasia\n',
      DMS_DRIVE_TOKEN_KEY: `  ${KEY.toString('base64')}  `,
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.clientId).toBe('client-id')
    expect(result.config.clientSecret).toBe('rahasia')
  })

  it.each([31, 33, 16, 64])('menolak kunci yang terdekode %i byte', (length) => {
    expect(readDriveConfig(env({ DMS_DRIVE_TOKEN_KEY: randomBytes(length).toString('base64') })).ok).toBe(false)
  })

  it('menolak kunci yang bukan base64 (karakter liar tidak diabaikan diam-diam)', () => {
    const base = KEY.toString('base64')
    expect(readDriveConfig(env({ DMS_DRIVE_TOKEN_KEY: `${base.slice(0, 20)}!!${base.slice(20)}` })).ok).toBe(false)
    expect(readDriveConfig(env({ DMS_DRIVE_TOKEN_KEY: 'x'.repeat(10) })).ok).toBe(false)
  })

  it.each(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'DMS_DRIVE_TOKEN_KEY'])(
    'env %s kosong atau tidak ada -> ok: false tanpa melempar',
    (name) => {
      expect(() => readDriveConfig(env({ [name]: undefined }))).not.toThrow()
      expect(readDriveConfig(env({ [name]: undefined }))).toEqual({ ok: false })
      expect(readDriveConfig(env({ [name]: '   ' }))).toEqual({ ok: false })
      expect(isDriveConfigured(env({ [name]: '' }))).toBe(false)
    },
  )

  it('env kosong sama sekali -> ok: false', () => {
    expect(readDriveConfig({})).toEqual({ ok: false })
    expect(isDriveConfigured({})).toBe(false)
  })
})

describe('konstanta OAuth dan Drive', () => {
  it('memakai redirect loopback tetap dan scope minimal (drive.file, openid, email)', () => {
    expect(GOOGLE_OAUTH_REDIRECT_URI).toBe('http://127.0.0.1:53682/')
    expect(GOOGLE_DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file')
    expect([...GOOGLE_OAUTH_SCOPES]).toEqual([GOOGLE_DRIVE_FILE_SCOPE, 'openid', 'email'])
  })

  it('batas ukuran file Drive sama dengan batas unggah dokumen', () => {
    expect(DRIVE_MAX_FILE_BYTES).toBe(DOCUMENT_UPLOAD_MAX_BYTES)
  })
})
