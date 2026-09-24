import { sanitizeFilename, extractExtension, extractFilenameFromPath, isPendingFile } from '../utils/file'
import type { DokumenRow, LampiranUrl } from './types'

/**
 * Membangun nama file formal berdasarkan metadata dokumen.
 *
 * FORMAT:
 * - Material: [Kelengkapan]_[Detail/Kategori/Jenis_Permintaan/Komponen]_[Kegiatan]_[YYYY-MM-DD].ext
 * - Non-Material: [Kelengkapan]_[Nama_Dokumen]_[Kegiatan]_[YYYY-MM-DD].ext
 *
 * Contoh Material: "Daftar_Nilai_Translok>8_Jam_SAKERNAS_2026-05-05.pdf"
 * Contoh Non-Material: "Notulen_Rapat_Service_2026-05-05.pdf"
 */
function buildDokumenFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  const kelengkapanNama = lamp.nama || 'Dokumen'
  const kegiatanNama = dok.kegiatan_nama || 'TanpaKegiatan'
  const tanggal = dok.tanggal || ''

  // Tentukan leaf node berdasarkan tipe dokumen
  let leafNode: string
  if (dok.is_non_material) {
    // Non-Material: gunakan nama_dokumen bebas yang diketik pegawai
    leafNode = dok.nama_dokumen || 'Dokumen'
  } else {
    // Material: leaf node dari permintaan chain
    leafNode = dok.detail_permintaan_nama
      || dok.kategori_permintaan_nama
      || dok.jenis_permintaan_nama
      || dok.komponen_nama
      || kegiatanNama
  }

  const ext = extractExtension(lamp.url)

  return `${sanitizeFilename(kelengkapanNama)}_${sanitizeFilename(leafNode)}_${sanitizeFilename(kegiatanNama)}_${tanggal}.${ext}`
}

/**
 * Membangun nama file untuk storage/display.
 * - Jika file PENDING (dash-format path), kembalikan nama upload asli
 * - Jika file FORMAL, kembalikan formal filename
 */
export function buildStorageFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  if (isPendingFile(lamp.url)) {
    return extractFilenameFromPath(lamp.url)
  }

  // File FORMAL - gunakan formal filename
  return buildDokumenFilename(dok, lamp)
}
