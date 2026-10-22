// Server-only module. Do not import from client components.
//
// Klasifikasi galat Google Drive/OAuth ke kategori tetap (SPEC 11.2). Hanya
// status, reason, kode OAuth, dan kode jaringan yang dibaca; isi respons
// mentah Google tidak pernah disalin ke pesan galat.
import type { DriveGalatKategori } from '#/db/schema/app/drive-job'
import { TokenCryptoError } from '#/lib/google-drive/token-crypto'
import { DRIVE_PESAN_GALAT } from '#/lib/google-drive/shared'

export class DriveApiError extends Error {
  readonly kategori: DriveGalatKategori
  readonly pesan: string

  constructor(kategori: DriveGalatKategori, pesan: string = DRIVE_PESAN_GALAT[kategori]) {
    super(pesan)
    this.name = 'DriveApiError'
    this.kategori = kategori
    this.pesan = pesan
  }
}

const RATE_LIMIT_REASONS = new Set([
  'userRateLimitExceeded',
  'rateLimitExceeded',
  'sharingRateLimitExceeded',
  'dailyLimitExceeded',
])

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNABORTED',
  'EPIPE',
])

const TIMEOUT_NAMES = new Set(['AbortError', 'TimeoutError'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readStatus(error: Record<string, unknown>): number | null {
  const response = asRecord(error.response)
  const status = error.status ?? response?.status
  return typeof status === 'number' ? status : null
}

function readResponseError(error: Record<string, unknown>): { reason: string | null; oauthError: string | null } {
  const data = asRecord(asRecord(error.response)?.data)
  const dataError = data?.error
  if (typeof dataError === 'string') return { reason: null, oauthError: dataError }

  const errors = asRecord(dataError)?.errors
  const first = Array.isArray(errors) ? asRecord(errors[0]) : null
  const reason = first?.reason
  return { reason: typeof reason === 'string' ? reason : null, oauthError: null }
}

/**
 * Galat jaringan dari fetch biasanya terbungkus (GaxiosError -> TypeError
 * "fetch failed" -> galat sistem ber-`code`), jadi rantai `cause` ditelusuri
 * beberapa tingkat.
 */
function isNetworkOrTimeout(error: Record<string, unknown>): boolean {
  let current: Record<string, unknown> | null = error
  for (let depth = 0; current && depth < 4; depth += 1) {
    const { code, name } = current
    if (typeof code === 'string' && (NETWORK_CODES.has(code) || TIMEOUT_NAMES.has(code))) return true
    if (typeof name === 'string' && TIMEOUT_NAMES.has(name)) return true
    current = asRecord(current.cause) ?? asRecord(current.error)
  }
  return false
}

export function classifyDriveError(error: unknown): DriveApiError {
  if (error instanceof DriveApiError) return error
  if (error instanceof TokenCryptoError) return new DriveApiError('TOKEN_TIDAK_VALID')

  const record = asRecord(error)
  if (!record) return new DriveApiError('PERMANEN')

  const status = readStatus(record)
  const { reason, oauthError } = readResponseError(record)

  if (oauthError === 'invalid_grant' || status === 401) return new DriveApiError('TOKEN_TIDAK_VALID')
  if (status === 403 && reason === 'storageQuotaExceeded') return new DriveApiError('KUOTA_PENUH')
  if (status === 403 && reason !== null && RATE_LIMIT_REASONS.has(reason)) return new DriveApiError('SEMENTARA')
  if (status === 408 || status === 429 || (status !== null && status >= 500)) return new DriveApiError('SEMENTARA')
  if (status === 404) return new DriveApiError('TIDAK_DITEMUKAN')
  if (status === null && isNetworkOrTimeout(record)) return new DriveApiError('SEMENTARA')

  return new DriveApiError('PERMANEN')
}

export function isDriveNotFound(error: unknown): boolean {
  return classifyDriveError(error).kategori === 'TIDAK_DITEMUKAN'
}
