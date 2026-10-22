import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { TokenCryptoError, decryptRefreshToken, encryptRefreshToken } from '#/lib/google-drive/token-crypto'

const KEY = randomBytes(32)
const TOKEN = '1//0gRahasiaRefreshTokenUjiCobaSaja-abcdefghijklmnop'
const BASE64URL = /^[A-Za-z0-9_-]+$/

function catchError(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('diharapkan melempar')
}

function expectKode(run: () => unknown, kode: TokenCryptoError['kode']) {
  const error = catchError(run)
  expect(error).toBeInstanceOf(TokenCryptoError)
  expect((error as TokenCryptoError).kode).toBe(kode)
  return error as TokenCryptoError
}

/** Ganti satu karakter base64url di bagian ke-`part` (1 = iv, 2 = tag, 3 = data). */
function tamper(enc: string, part: number): string {
  const parts = enc.split(':')
  const target = parts[part]
  const first = target[0] === 'A' ? 'B' : 'A'
  parts[part] = first + target.slice(1)
  return parts.join(':')
}

describe('encryptRefreshToken / decryptRefreshToken', () => {
  it('roundtrip mengembalikan token semula dalam format v1:<iv>:<tag>:<data> base64url', () => {
    const enc = encryptRefreshToken(TOKEN, KEY)
    const parts = enc.split(':')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('v1')
    for (const part of parts.slice(1)) expect(part).toMatch(BASE64URL)
    expect(Buffer.from(parts[1], 'base64url')).toHaveLength(12)
    expect(Buffer.from(parts[2], 'base64url')).toHaveLength(16)
    expect(enc).not.toContain(TOKEN)
    expect(decryptRefreshToken(enc, KEY)).toBe(TOKEN)
  })

  it('dua enkripsi token yang sama menghasilkan ciphertext berbeda (IV acak)', () => {
    const a = encryptRefreshToken(TOKEN, KEY)
    const b = encryptRefreshToken(TOKEN, KEY)
    expect(a).not.toBe(b)
    expect(a.split(':')[1]).not.toBe(b.split(':')[1])
  })

  it('token panjang dengan karakter / + = roundtrip benar', () => {
    const long = `${'ab/+='.repeat(120)}Zz9/+==`
    expect(long.length).toBeGreaterThanOrEqual(512)
    expect(decryptRefreshToken(encryptRefreshToken(long, KEY), KEY)).toBe(long)
  })

  it.each([
    ['data', 3],
    ['tag', 2],
    ['iv', 1],
  ])('%s diubah -> DEKRIPSI_GAGAL', (_label, part) => {
    expectKode(() => decryptRefreshToken(tamper(encryptRefreshToken(TOKEN, KEY), part), KEY), 'DEKRIPSI_GAGAL')
  })

  it('kunci berbeda atau kunci bukan 32 byte -> DEKRIPSI_GAGAL', () => {
    const enc = encryptRefreshToken(TOKEN, KEY)
    expectKode(() => decryptRefreshToken(enc, randomBytes(32)), 'DEKRIPSI_GAGAL')
    expectKode(() => decryptRefreshToken(enc, randomBytes(16)), 'DEKRIPSI_GAGAL')
  })

  it.each([
    ['awalan v2', (enc: string) => enc.replace(/^v1:/, 'v2:')],
    ['tanpa awalan', (enc: string) => enc.split(':').slice(1).join(':')],
    ['bagian berlebih', (enc: string) => `${enc}:extra`],
    ['bukan base64url', (enc: string) => enc.replace(/:([^:]+)$/, ':ab+/=')],
    ['IV bukan 12 byte', (enc: string) => {
      const parts = enc.split(':')
      parts[1] = randomBytes(8).toString('base64url')
      return parts.join(':')
    }],
    ['tag bukan 16 byte', (enc: string) => {
      const parts = enc.split(':')
      parts[2] = randomBytes(12).toString('base64url')
      return parts.join(':')
    }],
    ['string kosong', () => ''],
  ])('%s -> FORMAT_TIDAK_DIKENAL', (_label, mutate) => {
    expectKode(() => decryptRefreshToken(mutate(encryptRefreshToken(TOKEN, KEY)), KEY), 'FORMAT_TIDAK_DIKENAL')
  })

  it('pesan galat tidak memuat ciphertext, kunci, maupun token', () => {
    const enc = encryptRefreshToken(TOKEN, KEY)
    const errors = [
      expectKode(() => decryptRefreshToken(tamper(enc, 3), KEY), 'DEKRIPSI_GAGAL'),
      expectKode(() => decryptRefreshToken(`v9:${enc.slice(3)}`, KEY), 'FORMAT_TIDAK_DIKENAL'),
    ]
    for (const error of errors) {
      const text = `${error.message} ${String(error.stack)} ${JSON.stringify(error)}`
      for (const secret of [TOKEN, KEY.toString('base64'), KEY.toString('base64url'), ...enc.split(':').slice(1)]) {
        expect(text).not.toContain(secret)
      }
      expect(error.cause).toBeUndefined()
    }
  })
})
