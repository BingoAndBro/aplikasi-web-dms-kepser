// Menjalankan satu putaran antrean Google Drive (unggah/hapus salinan tautan laporan).
// Server sudah menjalankan runner otomatis saat dipicu (buat tautan, riwayat, coba lagi,
// cabut, pemusnahan, dst.); skrip ini untuk penjadwal (mis. Windows Task Scheduler) atau
// dijalankan manual, misalnya untuk memproses antrean saat server aplikasi mati.
//
//   pnpm drive:sync
import { isDriveConfigured } from '../lib/google-drive/config'
import { runDriveRunnerOnce } from '../lib/google-drive/runner'

async function main() {
  if (!isDriveConfigured()) {
    console.log('Google Drive belum dikonfigurasi; tidak ada yang diproses.')
    return
  }

  const ringkasan = await runDriveRunnerOnce()
  console.log(
    `Job diproses: ${ringkasan.diproses}. Selesai: ${ringkasan.selesai}. Gagal: ${ringkasan.gagal}. Dijeda: ${ringkasan.dijeda}.`
      + (ringkasan.anggaranHabis ? ' Batas waktu putaran tercapai; sisa antrean diproses putaran berikutnya.' : ''),
  )
}

/**
 * Pesan pendek tanpa objek mentah: galat kueri Drizzle memuat SQL + parameter,
 * jadi yang dicetak hanya penyebabnya (mis. koneksi DB ditolak).
 */
function ringkasGalat(galat: unknown): string {
  if (!(galat instanceof Error)) return 'galat tidak dikenal'
  if (galat.cause instanceof Error && galat.cause.message) return galat.cause.message
  return galat.message.split('\n')[0] ?? 'galat tidak dikenal'
}

main()
  .catch((galat) => {
    console.error('Sinkron Google Drive gagal:', ringkasGalat(galat))
    process.exitCode = 1
  })
  .finally(async () => {
    // Tutup pool pg supaya proses bisa keluar (dilewati bila belum pernah terhubung).
    try {
      const { pool } = await import('../db/client')
      await pool.end()
    } catch {
      // DATABASE_URL tidak ada: galat di atas sudah dilaporkan.
    }
  })
