import type { DokumenRow, LampiranUrl } from './dokumen-helpers'
import { sanitizeFilename, extractExtension } from './utils/file'

export function buildFormalFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  const kelengkapanNama = lamp.nama || 'Dokumen'
  const kegiatanNama = dok.kegiatan_nama || 'TanpaKegiatan'
  const tanggal = dok.tanggal || ''

  let leafNode: string
  if (dok.is_non_material) {
    leafNode = (dok as any).nama_dokumen || 'Dokumen'
  } else {
    leafNode = (dok as any).detail_permintaan_nama
      || (dok as any).kategori_permintaan_nama
      || (dok as any).jenis_permintaan_nama
      || (dok as any).komponen_nama
      || kegiatanNama
  }

  const ext = extractExtension(lamp.url)
  return `${sanitizeFilename(kelengkapanNama)}_${sanitizeFilename(leafNode)}_${sanitizeFilename(kegiatanNama)}_${tanggal}.${ext}`
}

/**
 * D-31: ekspor ZIP laporan diunduh secara bawaan browser, sama seperti ekspor
 * berkas KSBU. Dulu ZIP diambil dengan fetch + blob; di browser dengan
 * ekstensi/pengelola unduhan (terlihat di Edge) respons lampiran ZIP direbut
 * ekstensi sehingga halaman mendapat "Failed to fetch" walau server mengirim
 * 200 lengkap. Langkah 1 (POST ?mode=ticket) tetap memvalidasi daftar dokumen
 * dan mengembalikan pesan error (400/413) seperti biasa; langkah 2 menavigasi
 * ke tautan sekali pakai sehingga browser sendiri yang mengunduh.
 */
export async function startZipDownload(endpoint: string, body: unknown): Promise<void> {
  const response = await fetch(`${endpoint}?mode=ticket`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok || typeof payload?.download_url !== 'string') {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Gagal membuat ekspor ZIP')
  }

  window.location.assign(payload.download_url)
}

export function downloadZipBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function extractContentDispositionFilename(header: string | null, fallback: string): string {
  if (!header) return fallback
  const match = header.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? fallback
}
