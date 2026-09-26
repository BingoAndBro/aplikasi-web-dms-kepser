// Dipakai server (api/laporan/kegiatan + export-zip) dan klien (Laporan
// Kegiatan, Monitoring Dokumen Tim) -- jangan impor modul server di sini.

/**
 * `final`  -> Laporan Kegiatan: hanya dokumen yang sudah final.
 * `monitoring` -> Monitoring Dokumen Tim: semua dokumen yang SUDAH DIAJUKAN, dari
 *             validasi PPK sampai selesai. DRAFT tidak pernah ikut karena
 *             belum diajukan (masih ranah pribadi pegawai).
 */
export type LaporanKegiatanScope = 'final' | 'monitoring'

export const LAPORAN_KEGIATAN_SCOPE_STATUSES = {
  final: ['COMPLETED', 'TERSIMPAN'],
  monitoring: ['IN_PPK_VALIDATION', 'IN_PPSPM_APPROVAL', 'NEED_REVISION', 'COMPLETED', 'TERSIMPAN'],
} as const satisfies Record<LaporanKegiatanScope, readonly string[]>

export function parseLaporanKegiatanScope(value: unknown): LaporanKegiatanScope {
  return value === 'monitoring' ? 'monitoring' : 'final'
}

export type PosisiDokumen =
  | 'DI_PPK'
  | 'DI_PPSPM'
  | 'REVISI_PENGAJU'
  | 'REVISI_PPK'
  | 'SELESAI'

export const POSISI_DOKUMEN_LABEL: Record<PosisiDokumen, string> = {
  DI_PPK: 'Validasi PPK',
  DI_PPSPM: 'Persetujuan PPSPM',
  REVISI_PENGAJU: 'Dikembalikan ke Pengaju',
  REVISI_PPK: 'Ditolak PPSPM, di PPK',
  SELESAI: 'Selesai',
}

/**
 * Posisi dokumen = "sedang di tangan siapa". Status saja tidak cukup untuk
 * NEED_REVISION: revision_target USER berarti pengaju yang harus memperbaiki,
 * PPK berarti PPSPM menolak dan dokumen kembali ke PPK.
 */
export function getPosisiDokumen(dok: { status: string; revision_target?: string | null }): PosisiDokumen | null {
  switch (dok.status) {
    case 'IN_PPK_VALIDATION':
      return 'DI_PPK'
    case 'IN_PPSPM_APPROVAL':
      return 'DI_PPSPM'
    case 'NEED_REVISION':
      return dok.revision_target === 'PPK' ? 'REVISI_PPK' : 'REVISI_PENGAJU'
    case 'COMPLETED':
    case 'TERSIMPAN':
      return 'SELESAI'
    default:
      return null
  }
}
