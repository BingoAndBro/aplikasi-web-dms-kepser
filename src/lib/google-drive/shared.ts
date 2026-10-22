// Dipakai server dan klien -- jangan impor modul server di sini.
import type { DriveGalatKategori } from '#/db/schema/app/drive-job'
import type { GoogleDriveAkunStatus } from '#/db/schema/app/google-drive-akun'

export type { DriveGalatKategori, GoogleDriveAkunStatus }

/** Alasan kartu "Google Drive" di dialog Bagikan Tautan nonaktif (SPEC 10.1). */
export const DRIVE_ALASAN_TIDAK_TERSEDIA = {
  BELUM_DIKONFIGURASI: 'Fitur Google Drive belum dikonfigurasi',
  BELUM_ADA_AKUN: 'Belum ada akun Google Drive terhubung — hubungi Admin',
  PERLU_HUBUNG_ULANG: 'Akun Google Drive perlu dihubungkan ulang — hubungi Admin',
} as const

export type DriveAlasan = keyof typeof DRIVE_ALASAN_TIDAK_TERSEDIA

/** Peringatan kuning saat akses Google Drive dipilih (SPEC 10.1). */
export const DRIVE_PERINGATAN_PUBLIK =
  'Siapa saja yang memegang link Google Drive dapat melihat dan mengunduh dokumen tanpa login. '
  + 'Salinan dihapus dari Drive saat tautan dicabut atau berkas dimusnahkan.'

/** Pesan pendek per kategori galat; disimpan di drive_job.galat_pesan dan ditampilkan ke pengguna. */
export const DRIVE_PESAN_GALAT: Record<DriveGalatKategori, string> = {
  SEMENTARA: 'Gangguan sementara saat menghubungi Google Drive',
  TOKEN_TIDAK_VALID: 'Akun Google Drive perlu dihubungkan ulang',
  KUOTA_PENUH: 'Kuota Google Drive penuh',
  TIDAK_DITEMUKAN: 'Folder di Drive tidak ditemukan — cabut lalu buat tautan baru',
  PERMANEN: 'Google Drive menolak permintaan',
  AKUN_DIPUTUS: 'Akun Google Drive diputus — hapus manual di Drive',
}

/** Respons GET /api/google-drive/status. */
export type GoogleDriveStatusResponse = {
  tersedia: boolean
  alasan: DriveAlasan | null
}

export type GoogleDriveAkunSummary = {
  id: string
  email: string
  status: GoogleDriveAkunStatus
  perlu_hubung_ulang: boolean
  jumlah_tautan_aktif: number
  jumlah_job_gagal: number
}

/** Job hapus yang GAGAL; ADMIN menghapus foldernya sendiri di Drive. */
export type PerluHapusManualItem = {
  job_id: string
  judul_tautan: string
  nama_folder: string
  email_akun: string
  kategori: DriveGalatKategori | null
  /** Jumlah file MENGHAPUS untuk job HAPUS_FILE; null untuk HAPUS_TAUTAN (seluruh folder). */
  jumlah_file: number | null
}

/** Respons GET /api/admin/google-drive. */
export type GoogleDriveAdminResponse = {
  dikonfigurasi: boolean
  akun_aktif: GoogleDriveAkunSummary | null
  akun_lain: GoogleDriveAkunSummary[]
  perlu_hapus_manual: PerluHapusManualItem[]
}

export type MulaiHubungMode = 'HUBUNGKAN' | 'GANTI' | 'HUBUNGKAN_ULANG'

const FOLDER_JUDUL_MAX_LENGTH = 150
const FOLDER_JUDUL_BAWAAN = 'Tautan Laporan'
// Karakter yang bermasalah di nama folder saat diunduh/disinkron ke Windows.
const FOLDER_KARAKTER_TERLARANG = /[/\\:*?"<>|\u0000-\u001f\u007f]/g

const tanggalJakarta = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Nama folder tautan di Drive: `<judul> (<YYYY-MM-DD>)`, tanggal zona Asia/Jakarta. */
export function buildDriveFolderName(judul: string, createdAt: Date): string {
  const bersih = judul.replace(FOLDER_KARAKTER_TERLARANG, '-').replace(/\s+/g, ' ').trim()
  // Array.from memotong per code point supaya tidak membelah emoji/surrogate.
  const dipotong = Array.from(bersih).slice(0, FOLDER_JUDUL_MAX_LENGTH).join('').trim()
  return `${dipotong || FOLDER_JUDUL_BAWAAN} (${tanggalJakarta.format(createdAt)})`
}
