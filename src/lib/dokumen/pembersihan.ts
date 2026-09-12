// Konstanta & helper murni untuk fitur "Pembersihan Dokumen" (non-material,
// oleh ketua tim). Lihat docs/planning/pembersihan-non-material/rencana.md.

/**
 * Ambang umur (hari, berbasis `dokumen.tanggal`) untuk menandai dokumen
 * non-material sebagai "lama" pada alert ketua tim. Satu triwulan -- cukup
 * longgar untuk laporan bulanan maupun laporan kegiatan triwulanan. Bukan
 * master setting -- ubah di sini bila terbukti perlu beda di lapangan.
 */
export const NON_MATERIAL_STALE_DAYS = 90

/**
 * Frasa konfirmasi tunggal, dipakai UI (ConfirmDialog requireTyped) DAN
 * literal Zod di route -- satu sumber, hindari dualisme string seperti
 * 'BERSIHKAN FILE BERKAS' (server) vs 'HAPUS FILE FISIK ARSIP' (klien) di
 * modul arsip.
 */
export const PEMBERSIHAN_DOKUMEN_CONFIRMATION_PHRASE = 'BERSIHKAN'

/** Batas jumlah dokumen per request bulk cleanup. */
export const PEMBERSIHAN_BATCH_LIMIT = 200

/**
 * Umur dokumen (hari, date-only) dihitung dari `tanggal` (tanggal kejadian
 * dokumen, BUKAN `created_at`) sampai `now`. Perbandingan date-only untuk
 * menghindari off-by-one akibat zona waktu, meniru `computeBerkasAging`
 * (`src/lib/archive/retention.ts`).
 */
export function computeDokumenAging(input: {
  tanggal: string | Date | null | undefined
  now?: Date
  staleDays?: number
}): { umurHari: number | null; isStale: boolean } {
  const staleDays = input.staleDays ?? NON_MATERIAL_STALE_DAYS
  const nowDateOnly = toDateOnly(input.now ?? new Date()) as string
  const tanggalDateOnly = toDateOnly(input.tanggal)

  if (!tanggalDateOnly) {
    return { umurHari: null, isStale: false }
  }

  const umurHari = Math.max(0, diffCalendarDays(tanggalDateOnly, nowDateOnly))

  return { umurHari, isStale: umurHari > staleDays }
}

function toDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) {
    return [
      String(value.getUTCFullYear()).padStart(4, '0'),
      String(value.getUTCMonth() + 1).padStart(2, '0'),
      String(value.getUTCDate()).padStart(2, '0'),
    ].join('-')
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match ? match[1] : null
}

function diffCalendarDays(fromDateOnly: string, toDateOnlyValue: string): number {
  const from = Date.UTC(
    Number(fromDateOnly.slice(0, 4)),
    Number(fromDateOnly.slice(5, 7)) - 1,
    Number(fromDateOnly.slice(8, 10)),
  )
  const to = Date.UTC(
    Number(toDateOnlyValue.slice(0, 4)),
    Number(toDateOnlyValue.slice(5, 7)) - 1,
    Number(toDateOnlyValue.slice(8, 10)),
  )

  return Math.round((to - from) / 86_400_000)
}
