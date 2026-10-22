// Server-only module. Do not import from client components.
//
// Ketersediaan pilihan akses Google Drive (SPEC 7.3, 8.1). Dipakai
// GET /api/google-drive/status dan pembuatan tautan DRIVE supaya keduanya
// memakai logika yang sama. akunId hanya untuk server; toStatusResponse
// membuangnya sebelum dikirim ke klien.
import { muatAkunAktif, type AkunAktif } from '#/lib/google-drive/akun-repository'
import { isDriveConfigured } from '#/lib/google-drive/config'
import type { DriveAlasan, GoogleDriveStatusResponse } from '#/lib/google-drive/shared'

export type DriveAvailability =
  | { tersedia: true; alasan: null; akunId: string }
  | { tersedia: false; alasan: DriveAlasan }

export async function getDriveAvailability({
  env = process.env,
  loadAkunAktif = () => muatAkunAktif(),
}: {
  env?: NodeJS.ProcessEnv
  loadAkunAktif?: () => Promise<Pick<AkunAktif, 'id' | 'refreshTokenEnc' | 'perluHubungUlangSejak'> | null>
} = {}): Promise<DriveAvailability> {
  if (!isDriveConfigured(env)) return { tersedia: false, alasan: 'BELUM_DIKONFIGURASI' }

  const akun = await loadAkunAktif()
  if (!akun) return { tersedia: false, alasan: 'BELUM_ADA_AKUN' }
  if (akun.perluHubungUlangSejak !== null || !akun.refreshTokenEnc) {
    return { tersedia: false, alasan: 'PERLU_HUBUNG_ULANG' }
  }
  return { tersedia: true, alasan: null, akunId: akun.id }
}

export function toStatusResponse(availability: DriveAvailability): GoogleDriveStatusResponse {
  return { tersedia: availability.tersedia, alasan: availability.alasan }
}
