// Server-only module. Do not import from client components.
//
// Konfigurasi fitur Google Drive dari env. Env tidak lengkap atau tidak valid
// berarti fitur mati rapi (BELUM_DIKONFIGURASI); modul ini tidak pernah
// melempar dan tidak pernah mencetak nilai env.
import { DOCUMENT_UPLOAD_MAX_BYTES } from '#/lib/upload/document-upload-policy'

export type DriveConfig = {
  clientId: string
  clientSecret: string
  /** Kunci AES-256-GCM untuk refresh token (tepat 32 byte). */
  tokenKey: Buffer
}

export type DriveConfigResult = { ok: true; config: DriveConfig } | { ok: false }

// Alur OAuth "Desktop app" salin-tempel: Google mengalihkan ke loopback yang
// sengaja tidak didengarkan, lalu ADMIN menempel alamat dari tab yang gagal dimuat.
export const GOOGLE_OAUTH_REDIRECT_URI = 'http://127.0.0.1:53682/'
export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_OAUTH_SCOPES = [GOOGLE_DRIVE_FILE_SCOPE, 'openid', 'email'] as const

export const DRIVE_ROOT_FOLDER_NAME = 'DMS Kepser'
export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
export const DRIVE_HTTP_TIMEOUT_MS = 60_000
export const DRIVE_MAX_FILE_BYTES = DOCUMENT_UPLOAD_MAX_BYTES

const TOKEN_KEY_BYTES = 32
// Base64 standar (dengan/tanpa padding) atau base64url. Buffer.from() diam-diam
// mengabaikan karakter liar, jadi bentuknya diperiksa dulu.
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]+={0,2}|[A-Za-z0-9_-]+={0,2})$/

function readNonEmpty(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim()
  return value ? value : null
}

function decodeTokenKey(value: string): Buffer | null {
  if (!BASE64_PATTERN.test(value)) return null
  const key = Buffer.from(value, value.includes('-') || value.includes('_') ? 'base64url' : 'base64')
  return key.length === TOKEN_KEY_BYTES ? key : null
}

export function readDriveConfig(env: NodeJS.ProcessEnv = process.env): DriveConfigResult {
  const clientId = readNonEmpty(env, 'GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = readNonEmpty(env, 'GOOGLE_OAUTH_CLIENT_SECRET')
  const rawKey = readNonEmpty(env, 'DMS_DRIVE_TOKEN_KEY')
  if (!clientId || !clientSecret || !rawKey) return { ok: false }

  const tokenKey = decodeTokenKey(rawKey)
  if (!tokenKey) return { ok: false }

  return { ok: true, config: { clientId, clientSecret, tokenKey } }
}

export function isDriveConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readDriveConfig(env).ok
}
