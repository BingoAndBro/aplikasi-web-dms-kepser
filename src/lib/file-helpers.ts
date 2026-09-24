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
