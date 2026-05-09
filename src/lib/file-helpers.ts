import type { DokumenRow, LampiranUrl } from './dokumen-helpers'
import { sanitizeFilename, extractExtension, extractFilenameFromPath, isPendingFile } from './utils/file'

export { isPendingFile } from './utils/file'

export function buildFormalFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  const kelengkapanNama = lamp.nama || 'Dokumen'
  const kegiatanNama = dok.kegiatan_nama || 'TanpaKegiatan'
  const tanggal = dok.tanggal || ''

  let leafNode: string
  if (dok.is_non_material) {
    leafNode = (dok as any).jenis_dokumen_nama || 'Dokumen'
  } else {
    leafNode = (dok as any).detail_permintaan_nama
      || (dok as any).kategori_permintaan_nama
      || (dok as any).jenis_permintaan_nama
      || kegiatanNama
  }

  const ext = extractExtension(lamp.url)
  return `${sanitizeFilename(kelengkapanNama)}_${sanitizeFilename(leafNode)}_${sanitizeFilename(kegiatanNama)}_${tanggal}.${ext}`
}

export function buildPreviewFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  if (isPendingFile(lamp.url)) {
    return extractFilenameFromPath(lamp.url)
  }
  return buildFormalFilename(dok, lamp)
}

export type RoleContext = 'pegawai' | 'ppk' | 'bendahara'

function getApiBasePath(role: RoleContext): string {
  return role === 'pegawai' ? '/api/dokumen' : `/api/${role}/dokumen`
}

export async function downloadRoleFile(
  role: RoleContext,
  dokId: string,
  lampIndex: number,
  dok: DokumenRow
): Promise<{ error?: string }> {
  try {
    const basePath = getApiBasePath(role)
    const res = await fetch(`${basePath}/${dokId}/download/${lampIndex}`, {
      credentials: 'include',
    })

    if (!res.ok) {
      const json = await res.json()
      return { error: json.error || 'Gagal mengunduh file' }
    }

    const json = await res.json()

    if (json.signedUrl) {
      const a = document.createElement('a')
      a.href = json.signedUrl
      a.download = json.filename || buildFormalFilename(dok, dok.lampiran_urls[lampIndex])
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return {}
    }

    return { error: 'Gagal mengunduh file' }
  } catch (err) {
    console.error('[file-helpers] downloadRoleFile error:', err)
    return { error: 'Gagal mengunduh file' }
  }
}

export async function getPreviewRoleData(
  role: RoleContext,
  dokId: string,
  lampIndex: number
): Promise<{ signedUrl: string; filename: string } | null> {
  try {
    const basePath = getApiBasePath(role)
    const res = await fetch(`${basePath}/${dokId}/preview/${lampIndex}`, {
      credentials: 'include',
    })

    if (!res.ok) return null

    const json = await res.json()
    if (json.signedUrl) {
      return { signedUrl: json.signedUrl, filename: json.filename || 'preview' }
    }

    return null
  } catch (err) {
    console.error('[file-helpers] getPreviewRoleData error:', err)
    return null
  }
}

// Legacy aliases for backward compatibility
export async function downloadFile(dokId: string, lampIndex: number, dok: DokumenRow): Promise<void> {
  const result = await downloadRoleFile('pegawai', dokId, lampIndex, dok)
  if (result.error) alert(result.error)
}

export async function downloadPpkFile(dokId: string, lampIndex: number, dok: DokumenRow): Promise<void> {
  const result = await downloadRoleFile('ppk', dokId, lampIndex, dok)
  if (result.error) alert(result.error)
}

export async function getPreviewData(
  dokId: string,
  lampIndex: number
): Promise<{ signedUrl: string; filename: string } | null> {
  return getPreviewRoleData('pegawai', dokId, lampIndex)
}

export async function getPreviewPpkData(
  dokId: string,
  lampIndex: number
): Promise<{ signedUrl: string; filename: string } | null> {
  return getPreviewRoleData('ppk', dokId, lampIndex)
}

export { formatDateTime } from './utils/format'
