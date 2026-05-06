/**
 * ============================================================================
 * FILE HELPERS - Utility Terpusat untuk操作 Lampiran
 * ============================================================================
 *
 * Modul ini menyediakan fungsi-fungsi utility terpusat untuk:
 * - Membangun nama file formal (download/preview)
 * - Mengecek apakah file adalah PENDING atau FORMAL
 * - Mengunduh file
 * - Membuka preview file
 *
 * ARCHITECTURE: Single Source of Truth untuk semua logic terkait lampiran
 * ============================================================================
 */

import type { DokumenRow, LampiranUrl } from './dokumen-helpers'

// ============================================================================
// FUNGSI: sanitizeFilename
// ============================================================================
// Membersihkan karakter berbahaya dari nama file.
// Karakter seperti / \ * ? " < > | akan diganti dengan underscore.
// ============================================================================
function sanitizeFilename(str: string): string {
  return str.replace(/[\/\\:*?"<>|]/g, '_').replace(/_+/g, '_')
}

// ============================================================================
// FUNGSI: extractExtension
// ============================================================================
// Mengekstrak ekstensi dari nama file.
// Returns: ekstensi dalam lowercase atau string kosong jika tidak ada.
// ============================================================================
function extractExtension(filename: string): string {
  const lastDotIdx = filename.lastIndexOf('.')
  return lastDotIdx > 0 && lastDotIdx < filename.length - 1
    ? filename.slice(lastDotIdx + 1).toLowerCase()
    : ''
}

// ============================================================================
// FUNGSI: extractFilenameFromPath
// ============================================================================
// Mengekstrak nama file dari storage path.
// Handles format: [folder]/[filename.ext] atau dash-style [timestamp]-[random]-[filename]
// ============================================================================
function extractFilenameFromPath(url: string): string {
  const pathParts = url.split('/')
  const filenameWithExt = pathParts[pathParts.length - 1] || 'download'

  // Cek apakah dash-format (PENDING file): timestamp-random-filename
  const dashMatch = filenameWithExt.match(/^\d{13}-[a-zA-Z0-9]+-(.+)$/)
  if (dashMatch) {
    return dashMatch[1]
  }

  return filenameWithExt
}

// ============================================================================
// FUNGSI: isPendingFile
// ============================================================================
// Mengecek apakah file adalah PENDING atau FORMAL.
// PENDING = storage path dengan format timestamp-random-filename (dash).
// File PENDING adalah file yang baru diupload saat edit/revisi.
// File FORMAL adalah file yang sudah disubmit ke workflow.
// ============================================================================
export function isPendingFile(lampiranUrl: string): boolean {
  const pathParts = lampiranUrl.split('/')
  const filenameWithExt = pathParts[pathParts.length - 1] || 'download'
  return /^\d{13}-[a-zA-Z0-9]+-.+$/.test(filenameWithExt)
}

// ============================================================================
// FUNGSI: buildFormalFilename
// ============================================================================
// Membangun nama file formal berdasarkan metadata dokumen.
//
// FORMAT:
// - Material: [Kelengkapan]_[Detail/Kategori/Jenis_Permintaan]_[Kegiatan]_[YYYY-MM-DD].ext
// - Non-Material: [Kelengkapan]_[Jenis_Dokumen_Nama]_[Kegiatan]_[YYYY-MM-DD].ext
//
// Contoh Material: "Daftar_Nilai_Translok>8_Jam_SAKERNAS_2026-05-05.pdf"
// Contoh Non-Material: "Notulen_Rapat_Service_2026-05-05.pdf"
// ============================================================================
export function buildFormalFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  const kelengkapanNama = lamp.nama || 'Dokumen'
  const kegiatanNama = dok.kegiatan_nama || 'TanpaKegiatan'
  const tanggal = dok.tanggal || ''

  // Tentukan leaf node berdasarkan tipe dokumen
  let leafNode: string
  if (dok.is_non_material) {
    // Non-Material: gunakan jenis_dokumen_nama dari master_jenis_dokumen
    leafNode = (dok as any).jenis_dokumen_nama || 'Dokumen'
  } else {
    // Material: leaf node dari permintaan chain
    leafNode = (dok as any).detail_permintaan_nama
      || (dok as any).kategori_permintaan_nama
      || (dok as any).jenis_permintaan_nama
      || kegiatanNama
  }

  // Extract extension dari storage path
  const ext = extractExtension(lamp.url)

  return `${sanitizeFilename(kelengkapanNama)}_${sanitizeFilename(leafNode)}_${sanitizeFilename(kegiatanNama)}_${tanggal}.${ext}`
}

// ============================================================================
// FUNGSI: buildPreviewFilename
// ============================================================================
// Membangun nama file untuk preview.
// Mirip buildFormalFilename, tapi:
// - Jika file PENDING (dash-format path), kembalikan nama upload asli
// - Jika file FORMAL, kembalikan formal filename
// ============================================================================
export function buildPreviewFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  if (isPendingFile(lamp.url)) {
    // File PENDING - gunakan nama upload asli
    return extractFilenameFromPath(lamp.url)
  }

  // File FORMAL - gunakan formal filename
  return buildFormalFilename(dok, lamp)
}

// ============================================================================
// FUNGSI: downloadFile
// ============================================================================
// Mengunduh file melalui API terpusat.
// API: GET /api/dokumen/$id/download/$lampIndex
// Response: { signedUrl, filename }
//
// Params:
// - dokId: ID dokumen
// - lampIndex: index lampiran dalam array lampiran_urls
// - dok: metadata dokumen lengkap (untuk fallback filename)
// ============================================================================
export async function downloadFile(
  dokId: string,
  lampIndex: number,
  dok: DokumenRow
): Promise<void> {
  try {
    const res = await fetch(`/api/dokumen/${dokId}/download/${lampIndex}`, {
      credentials: 'include'
    })

    if (!res.ok) {
      const json = await res.json()
      alert(json.error || 'Gagal mengunduh file')
      return
    }

    const json = await res.json()

    if (json.signedUrl) {
      const a = document.createElement('a')
      a.href = json.signedUrl
      a.download = json.filename || buildFormalFilename(dok, dok.lampiran_urls[lampIndex])
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } else {
      alert('Gagal mengunduh file')
    }
  } catch (err) {
    console.error('[file-helpers] downloadFile error:', err)
    alert('Gagal mengunduh file')
  }
}

// ============================================================================
// FUNGSI: downloadPpkFile
// ============================================================================
// Mengunduh file melalui API PPK (authenticated as PPK).
// API: GET /api/ppk/dokumen/$id/download/$lampIndex
// Response: { signedUrl, filename }
//
// Params:
// - dokId: ID dokumen
// - lampIndex: index lampiran dalam array lampiran_urls
// - dok: metadata dokumen lengkap (untuk fallback filename)
// ============================================================================
export async function downloadPpkFile(
  dokId: string,
  lampIndex: number,
  dok: DokumenRow
): Promise<void> {
  try {
    const res = await fetch(`/api/ppk/dokumen/${dokId}/download/${lampIndex}`, {
      credentials: 'include'
    })

    if (!res.ok) {
      const json = await res.json()
      alert(json.error || 'Gagal mengunduh file')
      return
    }

    const json = await res.json()

    if (json.signedUrl) {
      const a = document.createElement('a')
      a.href = json.signedUrl
      a.download = json.filename || buildFormalFilename(dok, dok.lampiran_urls[lampIndex])
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } else {
      alert('Gagal mengunduh file')
    }
  } catch (err) {
    console.error('[file-helpers] downloadPpkFile error:', err)
    alert('Gagal mengunduh file')
  }
}

// ============================================================================
// FUNGSI: getPreviewData
// ============================================================================
// Mendapatkan data preview (signed URL + filename) dari API.
// API: GET /api/dokumen/$id/preview/$lampIndex
// Response: { signedUrl, filename }
//
// Params:
// - dokId: ID dokumen
// - lampIndex: index lampiran dalam array lampiran_urls
//
// Returns: { signedUrl, filename } atau null jika gagal
// ============================================================================
export async function getPreviewData(
  dokId: string,
  lampIndex: number
): Promise<{ signedUrl: string; filename: string } | null> {
  try {
    const res = await fetch(`/api/dokumen/${dokId}/preview/${lampIndex}`, {
      credentials: 'include'
    })

    if (!res.ok) {
      const json = await res.json()
      console.error('[file-helpers] getPreviewData error:', json.error)
      return null
    }

    const json = await res.json()

    if (json.signedUrl) {
      return {
        signedUrl: json.signedUrl,
        filename: json.filename || 'preview'
      }
    }

    return null
  } catch (err) {
    console.error('[file-helpers] getPreviewData error:', err)
    return null
  }
}

// ============================================================================
// FUNGSI: getPreviewPpkData
// ============================================================================
// Mendapatkan data preview (signed URL + filename) dari API PPK.
// API: GET /api/ppk/dokumen/$id/preview/$lampIndex
// Response: { signedUrl, filename }
//
// Params:
// - dokId: ID dokumen
// - lampIndex: index lampiran dalam array lampiran_urls
//
// Returns: { signedUrl, filename } atau null jika gagal
// ============================================================================
export async function getPreviewPpkData(
  dokId: string,
  lampIndex: number
): Promise<{ signedUrl: string; filename: string } | null> {
  try {
    const res = await fetch(`/api/ppk/dokumen/${dokId}/preview/${lampIndex}`, {
      credentials: 'include'
    })

    if (!res.ok) {
      const json = await res.json()
      console.error('[file-helpers] getPreviewPpkData error:', json.error)
      return null
    }

    const json = await res.json()

    if (json.signedUrl) {
      return {
        signedUrl: json.signedUrl,
        filename: json.filename || 'preview'
      }
    }

    return null
  } catch (err) {
    console.error('[file-helpers] getPreviewPpkData error:', err)
    return null
  }
}

// ============================================================================
// FUNGSI: formatDateTime
// ============================================================================
// Format tanggal untuk display di UI.
// Input: ISO date string
// Output: format Indonesia: "05 Mei 2026, 14:30"
// ============================================================================
export function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}
