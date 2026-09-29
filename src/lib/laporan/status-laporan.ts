// Dipakai klien (Laporan Saya, Laporan Kegiatan, Laporan Kinerja) — jangan
// impor modul server di sini.

/**
 * D-30: di halaman laporan, status final dokumen ditampilkan sebagai jenisnya.
 * Dokumen final selalu salah satu dari dua ini: dokumen material berakhir
 * "Selesai" (COMPLETED) setelah disetujui PPSPM — termasuk dokumen tambahan
 * KSBU — dan dokumen non-material berakhir "Tersimpan" (TERSIMPAN). Halaman alur
 * kerja (inbox PPK/PPSPM, dsb.) tetap memakai label status biasa.
 */
export const LAPORAN_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Material',
  TERSIMPAN: 'Non-Material',
}

export type LaporanStatus = 'COMPLETED' | 'TERSIMPAN'

/** Opsi filter "Status" (tanpa opsi "Semua Status", yang ditambahkan oleh field). */
export const LAPORAN_STATUS_FILTER_OPTIONS: ReadonlyArray<{ id: LaporanStatus; nama: string }> = [
  { id: 'COMPLETED', nama: LAPORAN_STATUS_LABEL.COMPLETED },
  { id: 'TERSIMPAN', nama: LAPORAN_STATUS_LABEL.TERSIMPAN },
]

export function laporanStatusLabel(status: string): string {
  return LAPORAN_STATUS_LABEL[status] ?? status
}

/** `undefined` = semua status. */
export function matchesLaporanStatus(status: string, filter: LaporanStatus | undefined): boolean {
  return filter === undefined || status === filter
}
