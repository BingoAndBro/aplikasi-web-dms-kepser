import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeFilename, extractExtension, extractFilenameFromPath, isPendingFile } from '../utils/file'
import type { DokumenRow, LampiranUrl } from './types'

export { isPendingFile as isStoragePathPending } from '../utils/file'

export function storagePathBelongsToUser(path: string, userId: string): boolean {
  const ownerId = path.split('/').filter(Boolean)[0]
  return ownerId === userId
}

export async function canAccessStoragePath(
  supabase: SupabaseClient,
  userId: string,
  path: string
): Promise<boolean> {
  if (!path) return false
  if (storagePathBelongsToUser(path, userId)) return true

  const { data, error } = await supabase
    .from('user_roles')
    .select('role:roles(nama)')
    .eq('user_id', userId)

  if (error || !data) return false

  const roleNames = data
    .map((r: any) => r.role?.nama as string | undefined)
    .filter(Boolean)

  return ['PPK', 'BENDAHARA', 'ARSIPARIS'].some(role => roleNames.includes(role))
}

/**
 * Membangun nama file formal berdasarkan metadata dokumen.
 *
 * FORMAT:
 * - Material: [Kelengkapan]_[Detail/Kategori/Jenis_Permintaan]_[Kegiatan]_[YYYY-MM-DD].ext
 * - Non-Material: [Kelengkapan]_[Jenis_Dokumen_Nama]_[Kegiatan]_[YYYY-MM-DD].ext
 *
 * Contoh Material: "Daftar_Nilai_Translok>8_Jam_SAKERNAS_2026-05-05.pdf"
 * Contoh Non-Material: "Notulen_Rapat_Service_2026-05-05.pdf"
 */
export function buildDokumenFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  const kelengkapanNama = lamp.nama || 'Dokumen'
  const kegiatanNama = dok.kegiatan_nama || 'TanpaKegiatan'
  const tanggal = dok.tanggal || ''

  // Tentukan leaf node berdasarkan tipe dokumen
  let leafNode: string
  if (dok.is_non_material) {
    // Non-Material: gunakan jenis_dokumen_nama dari master_jenis_dokumen
    leafNode = dok.jenis_dokumen_nama || 'Dokumen'
  } else {
    // Material: leaf node dari permintaan chain
    leafNode = dok.detail_permintaan_nama
      || dok.kategori_permintaan_nama
      || dok.jenis_permintaan_nama
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

/**
 * Membangun storage path formal untuk file yang sudah disubmit.
 * Format: {user_id}/{dok_id}/{uuid}.{ext}
 *
 * Storage path flat dan tidak mengandung info metadata (agar tidak perlu
 * update path saat metadata berubah). Display filename tetap mengikuti
 * format formal di buildDokumenFilename().
 */
export function buildFormalStoragePath(
  userId: string,
  dokId: string,
  lamp: LampiranUrl
): string {
  const ext = extractExtension(lamp.url)
  const uuid = crypto.randomUUID()
  return `${userId}/${dokId}/${uuid}.${ext}`
}

/**
 * =============================================================================
 * SYNC DOCUMENT ATTACHMENTS - Centralized Storage Management
 * =============================================================================
 *
 * Fungsi ini menangani seluruh alur manajemen lampiran saat submit/update:
 * 1. Mendeteksi file PENDING (upload baru di edit session)
 * 2. Memindahkan (move) file PENDING ke path formal
 * 3. Mendeteksi file lama yang digantikan atau dihapus
 * 4. Menghapus (remove) file lama dari storage
 *
 * Parameters:
 * - supabaseAdmin: Supabase client dengan akses admin (bypass RLS)
 * - userId: User ID untuk build formal path
 * - dokumenId: Dokumen ID untuk build formal path
 * - lampiranUrlsBaru: Array lampiran dari request client (mungkin ada PENDING)
 * - lampiranUrlsLama: Array lampiran dari database (untuk detect replaced files)
 *
 * Returns:
 * - updatedLampirans: Array LampiranUrl dengan path formal (siap disave ke DB)
 * - pathsToDelete: Array path lama yang perlu dihapus dari storage
 */
export async function syncDocumentAttachments(
  supabaseAdmin: SupabaseClient,
  userId: string,
  dokumenId: string,
  lampiranUrlsBaru: LampiranUrl[],
  lampiranUrlsLama: LampiranUrl[]
): Promise<{
  updatedLampirans: LampiranUrl[]
  pathsToDelete: string[]
}> {
  const updated = [...lampiranUrlsBaru]
  const pathsToDelete: string[] = []

  console.log('[syncDocumentAttachments] Starting sync for dokId:', dokumenId, 'lampirans:', lampiranUrlsBaru.length)

  for (let i = 0; i < updated.length; i++) {
    const lamp = updated[i]
    if (!lamp.url) continue

    // Skip non-PENDING files (already formal)
    if (!isPendingFile(lamp.url)) {
      console.log('[syncDocumentAttachments] Skipping non-pending:', lamp.url)
      continue
    }

    // Check if this lampiran is replacing an old file
    const oldLamp = lampiranUrlsLama.find(l => l.kelengkapan_id === lamp.kelengkapan_id)
    if (oldLamp && oldLamp.url !== lamp.url) {
      console.log('[syncDocumentAttachments] Will delete replaced file:', oldLamp.url)
      pathsToDelete.push(oldLamp.url)
    }

    // Move PENDING file to formal path
    const ext = extractExtension(lamp.url)
    const newPath = `${userId}/${dokumenId}/${crypto.randomUUID()}.${ext}`

    console.log('[syncDocumentAttachments] Moving:', lamp.url, '->', newPath)
    const { error: moveError } = await supabaseAdmin.storage
      .from('dokumen-lampiran')
      .move(lamp.url, newPath)

    if (moveError) {
      console.error('[syncDocumentAttachments] Move failed:', lamp.url, 'error:', moveError.message)
      throw new Error(`Gagal memproses file: ${moveError.message}`)
    }

    // Track PENDING path for cleanup
    pathsToDelete.push(lamp.url)
    console.log('[syncDocumentAttachments] Move success, new path:', newPath)

    // Update lampiran with new path
    updated[i] = { ...lamp, url: newPath }
  }

  // Also track deleted lampirans (in lama but not in baru)
  for (const oldLamp of lampiranUrlsLama) {
    const stillExists = updated.some(l => l.kelengkapan_id === oldLamp.kelengkapan_id)
    if (!stillExists && oldLamp.url) {
      console.log('[syncDocumentAttachments] Will delete removed lampiran:', oldLamp.url)
      pathsToDelete.push(oldLamp.url)
    }
  }

  console.log('[syncDocumentAttachments] Done. Updated:', updated.length, 'pathsToDelete:', pathsToDelete.length)

  return { updatedLampirans: updated, pathsToDelete }
}

/**
 * Delete orphaned files from storage.
 * Helper function to cleanup files after document update.
 */
export async function deleteOrphanFiles(
  supabaseAdmin: SupabaseClient,
  paths: string[]
): Promise<void> {
  for (const path of paths) {
    const { error } = await supabaseAdmin.storage
      .from('dokumen-lampiran')
      .remove([path])
    if (error) {
      console.warn('[deleteOrphanFiles] Failed to delete:', path, error.message)
    } else {
      console.log('[deleteOrphanFiles] Deleted:', path)
    }
  }
}
