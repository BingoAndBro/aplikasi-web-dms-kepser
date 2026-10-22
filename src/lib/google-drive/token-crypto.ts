// Server-only module. Do not import from client components.
//
// Enkripsi refresh token Google (K9): AES-256-GCM, kunci 32 byte dari env
// DMS_DRIVE_TOKEN_KEY. Format tersimpan `v1:<iv>:<tag>:<data>`, semua bagian
// base64url. Pesan galat sengaja umum: tidak pernah memuat ciphertext, kunci,
// atau token.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/

export type TokenCryptoErrorKode = 'FORMAT_TIDAK_DIKENAL' | 'DEKRIPSI_GAGAL'

const PESAN: Record<TokenCryptoErrorKode, string> = {
  FORMAT_TIDAK_DIKENAL: 'Format token terenkripsi tidak dikenal',
  DEKRIPSI_GAGAL: 'Token terenkripsi gagal didekripsi',
}

export class TokenCryptoError extends Error {
  readonly kode: TokenCryptoErrorKode

  constructor(kode: TokenCryptoErrorKode) {
    super(PESAN[kode])
    this.name = 'TokenCryptoError'
    this.kode = kode
  }
}

export function encryptRefreshToken(plain: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error('Kunci enkripsi token harus 32 byte')
  }
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join(':')
}

export function decryptRefreshToken(enc: string, key: Buffer): string {
  const parts = enc.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new TokenCryptoError('FORMAT_TIDAK_DIKENAL')
  }
  const [, ivPart, tagPart, dataPart] = parts
  if (![ivPart, tagPart, dataPart].every((part) => BASE64URL_PATTERN.test(part))) {
    throw new TokenCryptoError('FORMAT_TIDAK_DIKENAL')
  }
  const iv = Buffer.from(ivPart, 'base64url')
  const tag = Buffer.from(tagPart, 'base64url')
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new TokenCryptoError('FORMAT_TIDAK_DIKENAL')
  }
  if (key.length !== KEY_BYTES) {
    throw new TokenCryptoError('DEKRIPSI_GAGAL')
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    // Galat asli (tag tidak cocok, dsb.) tidak diteruskan sebagai cause.
    throw new TokenCryptoError('DEKRIPSI_GAGAL')
  }
}
