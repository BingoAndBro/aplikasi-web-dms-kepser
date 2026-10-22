// Server-only module. Do not import from client components.
//
// Kerangka bersama rute Google Drive: same-origin (POST) -> sesi -> peran
// ADMIN -> konfigurasi -> Zod, dan pemetaan galat ke respons berbahasa
// Indonesia. Log hanya berisi aksi + kategori; objek galat mentah tidak pernah
// dicetak karena bisa memuat code/token/respons Google.
import type { z } from 'zod'

import { getLocalServerSession, hasLocalRole, type LocalServerSession } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'
import { AkunDriveError, type AkunDriveErrorKode } from '#/lib/google-drive/akun-repository'
import { readDriveConfig, type DriveConfig } from '#/lib/google-drive/config'
import { DriveApiError } from '#/lib/google-drive/drive-errors'
import { OAuthFlowError, type OAuthFlowErrorKode } from '#/lib/google-drive/oauth'
import { DRIVE_ALASAN_TIDAK_TERSEDIA } from '#/lib/google-drive/shared'
import { requireSameOrigin } from '#/lib/security/same-origin'

export const DRIVE_ROUTE_PESAN_UMUM = 'Gagal memproses permintaan Google Drive'
const PESAN_GOOGLE_TIDAK_TERJANGKAU = 'Google Drive tidak dapat dihubungi, coba lagi'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const NO_STORE = { 'Cache-Control': 'no-store' } as const

export function isDriveUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** Same-origin untuk metode tidak aman, lalu sesi (401) dan peran ADMIN (403). */
export async function requireDriveAdmin(request: Request): Promise<LocalServerSession | Response> {
  const sameOriginError = requireSameOrigin(request)
  if (sameOriginError) return sameOriginError

  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, ROLES.ADMIN)) {
    return Response.json({ error: 'Akses ditolak - hanya admin' }, { status: 403 })
  }
  return session
}

/** Konfigurasi env, atau 409 BELUM_DIKONFIGURASI untuk aksi yang butuh Google. */
export function requireDriveConfig(): DriveConfig | Response {
  const result = readDriveConfig()
  if (result.ok) return result.config
  return Response.json(
    { error: DRIVE_ALASAN_TIDAK_TERSEDIA.BELUM_DIKONFIGURASI, kode: 'BELUM_DIKONFIGURASI' },
    { status: 409 },
  )
}

/** Baca body JSON lalu validasi Zod; 400 bila body rusak atau tidak sah. */
export async function parseDriveBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body permintaan tidak valid' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Body permintaan tidak valid' }, { status: 400 })
  }
  return parsed.data
}

const OAUTH_409: ReadonlySet<OAuthFlowErrorKode> = new Set(['STATE_KEDALUWARSA', 'STATE_SESI_BERBEDA'])
const AKUN_STATUS: Record<AkunDriveErrorKode, number> = {
  EMAIL_BERBEDA: 409,
  AKUN_BERUBAH: 409,
  AKUN_SUDAH_DIPUTUS: 409,
  AKUN_TIDAK_DITEMUKAN: 404,
}

/** Peta galat yang dikenal ke respons; selain itu 500 dengan pesan umum. */
export function driveRouteError(error: unknown, aksi: string): Response {
  if (error instanceof OAuthFlowError) {
    return Response.json({ error: error.pesan, kode: error.kode }, { status: OAUTH_409.has(error.kode) ? 409 : 400 })
  }
  if (error instanceof AkunDriveError) {
    return Response.json({ error: error.pesan, kode: error.kode }, { status: AKUN_STATUS[error.kode] })
  }
  if (error instanceof DriveApiError) {
    if (error.kategori === 'SEMENTARA') {
      console.error(`[admin/google-drive] ${aksi} gagal`, { kategori: error.kategori })
      return Response.json({ error: PESAN_GOOGLE_TIDAK_TERJANGKAU, kode: error.kategori }, { status: 502 })
    }
    return Response.json({ error: error.pesan, kode: error.kategori }, { status: 400 })
  }
  console.error(`[admin/google-drive] ${aksi} gagal`, { kategori: 'TAK_TERDUGA' })
  return Response.json({ error: DRIVE_ROUTE_PESAN_UMUM }, { status: 500 })
}
