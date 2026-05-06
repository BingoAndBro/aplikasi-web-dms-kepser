/**
 * ============================================================================
 * STORAGE CLIENT - Helper untuk Operasi Storage
 * ============================================================================
 *
 * Modul ini menyediakan fungsi-fungsi helper untuk:
 * - Mendapatkan signed URL dari storage
 * - Download file dengan signed URL
 * - Format tanggal Indonesia
 *
 * NOTE: Untuk filename building, gunakan dokumen-helpers:
 * - isStoragePathPending(url) - cek apakah PENDING file
 * - buildDokumenFilename(dok, lamp) - build formal filename
 * - buildStorageFilename(dok, lamp) - build filename berdasarkan storage path type
 * ============================================================================
 */

// ============================================================================
// FUNGSI: getSignedUrlDirect
// ============================================================================
// Mendapatkan signed URL langsung dari storage path.
// API: GET /api/dokumen/preview-url?url=...
// ============================================================================
export async function getSignedUrlDirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/dokumen/preview-url?url=${encodeURIComponent(url)}`, {
      credentials: 'include'
    })
    const json = await res.json()
    return json.signedUrl || null
  } catch {
    return null
  }
}

// ============================================================================
// FUNGSI: getSignedUrlFromApi
// ============================================================================
// Mendapatkan signed URL dari API endpoint.
// Params:
// - apiPath: path API (contoh: '/api/dokumen/123/preview/0')
// ============================================================================
async function getSignedUrlFromApi(apiPath: string): Promise<string | null> {
  try {
    const res = await fetch(apiPath, { credentials: 'include' })
    const json = await res.json()
    return json.signedUrl || null
  } catch {
    return null
  }
}

// ============================================================================
// FUNGSI: getSignedUrl
// ============================================================================
// Alias untuk getSignedUrlDirect untuk backward compatibility.
// ============================================================================
export const getSignedUrl = getSignedUrlDirect

// ============================================================================
// FUNGSI: downloadFromApi
// ============================================================================
// Download file melalui API endpoint.
// Params:
// - apiPath: path API untuk download
// - signedUrl: signed URL dari response (optional, akan di-fetch jika null)
// - filename: nama file untuk download
// ============================================================================
export async function downloadFromApi(
  apiPath: string,
  filename: string
): Promise<void> {
  try {
    const signedUrl = await getSignedUrlFromApi(apiPath)
    if (!signedUrl) {
      alert('Gagal mengunduh file')
      return
    }
    downloadWithSignedUrl(signedUrl, filename)
  } catch {
    alert('Gagal mengunduh file')
  }
}

// ============================================================================
// FUNGSI: downloadWithSignedUrl
// ============================================================================
// Download file dengan signed URL.
// Params:
// - signedUrl: signed URL dari storage
// - filename: nama file untuk download
//
// NOTE: Karena signedUrl dari Supabase pointing ke external domain,
// kita perlu fetch sebagai blob agar attribute `download` berfungsi.
// ============================================================================
export async function downloadWithSignedUrl(signedUrl: string, filename: string): Promise<void> {
  try {
    const response = await fetch(signedUrl)
    if (!response.ok) throw new Error('Failed to fetch file')

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Cleanup blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch (err) {
    console.error('[storage-client] downloadWithSignedUrl error:', err)
    alert('Gagal mengunduh file')
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
