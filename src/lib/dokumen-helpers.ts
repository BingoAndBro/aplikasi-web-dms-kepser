/**
 * Helper functions for dokumen_transaksi operations.
 * Uses Supabase client (not Drizzle ORM) - follows existing project convention.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeFilename, extractExtension, extractFilenameFromPath, isPendingFile } from './utils/file'
import { parseDokumenWithNames } from './dokumen/parse'
import type {
  DokumenRow,
  LampiranUrl,
  LogRow,
} from './dokumen/types'

export * from './dokumen'

// ---------------------------------------------------------------------------
// Dokumen CRUD Helpers
// ---------------------------------------------------------------------------

/**
 * Create a new DRAFT dokumen.
 */
export async function createDokumen(
  supabase: SupabaseClient,
  payload: {
    judul: string
    fungsiId: string
    kegiatanJenisId: string
    isKetuaTim: boolean
    tahun: number
    tanggal: string
    lampiranUrls: LampiranUrl[]
    createdBy: string
    nominalRealisasi?: number | null
    isNonMaterial?: boolean
    jenisDokumenId?: string
    keteranganDetail?: string
    jenisPermintaanId?: string
    kategoriPermintaanId?: string
    detailPermintaanId?: string
  }
): Promise<{ data?: DokumenRow; error?: string }> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .insert({
      judul: payload.judul,
      fungsi_id: payload.fungsiId,
      kegiatan_jenis_id: payload.kegiatanJenisId,
      is_ketua_tim: payload.isKetuaTim,
      tahun: payload.tahun,
      tanggal: payload.tanggal,
      lampiran_urls: JSON.stringify(payload.lampiranUrls),
      created_by: payload.createdBy,
      status: 'DRAFT',
      nominal_realisasi: payload.nominalRealisasi ?? 0,
      is_non_material: payload.isNonMaterial ?? false,
      jenis_dokumen_id: payload.jenisDokumenId ?? null,
      keterangan_detail: payload.keteranganDetail ?? null,
      jenis_permintaan_id: payload.jenisPermintaanId ?? null,
      kategori_permintaan_id: payload.kategoriPermintaanId ?? null,
      detail_permintaan_id: payload.detailPermintaanId ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[dokumen-helpers] createDokumen error:', error)
    return { error: 'Gagal membuat dokumen' }
  }

  // Manual join for response
  const fungsiMap: Record<string, string> = {}
  const kegMap: Record<string, string> = {}
  const { data: fns } = await supabase.from('master_fungsi').select('id, nama').eq('id', payload.fungsiId).single()
  if (fns) fungsiMap[payload.fungsiId] = fns.nama
  const { data: keg } = await supabase.from('master_kegiatan').select('id, nama').eq('id', payload.kegiatanJenisId).single()
  if (keg) kegMap[payload.kegiatanJenisId] = keg.nama

  return { data: parseDokumenWithNames(data, fungsiMap, kegMap) }
}

/**
 * Update lampiran_urls and/or metadata on a dokumen.
 */
export async function updateDokumen(
  supabase: SupabaseClient,
  id: string,
  payload: {
    lampiranUrls?: LampiranUrl[]
    judul?: string
    tahun?: number
    fungsiId?: string
    kegiatanId?: string
    tanggal?: string
    nominalRealisasi?: number | null
    isNonMaterial?: boolean
    keteranganDetail?: string | null
  }
): Promise<{ data?: DokumenRow; error?: string }> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  if (payload.lampiranUrls !== undefined) {
    updates.lampiran_urls = JSON.stringify(payload.lampiranUrls)
  }
  if (payload.judul !== undefined) {
    updates.judul = payload.judul
  }
  if (payload.tahun !== undefined) {
    updates.tahun = payload.tahun
  }
  if (payload.fungsiId !== undefined) {
    updates.fungsi_id = payload.fungsiId
  }
  if (payload.kegiatanId !== undefined) {
    updates.kegiatan_jenis_id = payload.kegiatanId
  }
  if (payload.tanggal !== undefined) {
    updates.tanggal = payload.tanggal
  }
  if (payload.nominalRealisasi !== undefined) {
    updates.nominal_realisasi = payload.nominalRealisasi
  }
  if (payload.isNonMaterial !== undefined) {
    updates.is_non_material = payload.isNonMaterial
  }
  if (payload.keteranganDetail !== undefined) {
    updates.keterangan_detail = payload.keteranganDetail
  }

  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[dokumen-helpers] updateDokumen error:', error)
    return { error: 'Gagal memperbarui dokumen' }
  }

  // Manual join for response
  const fungsiMap: Record<string, string> = {}
  const kegMap: Record<string, string> = {}
  if (data.fungsi_id) {
    const { data: fns } = await supabase.from('master_fungsi').select('id, nama').eq('id', data.fungsi_id).single()
    if (fns) fungsiMap[data.fungsi_id] = fns.nama
  }
  if (data.kegiatan_jenis_id) {
    const { data: keg } = await supabase.from('master_kegiatan').select('id, nama').eq('id', data.kegiatan_jenis_id).single()
    if (keg) kegMap[data.kegiatan_jenis_id] = keg.nama
  }

  return { data: parseDokumenWithNames(data, fungsiMap, kegMap) }
}

/**
 * Update dokumen status fields after FSM transition.
 * Returns the updated fields without re-fetching (avoids FK join issues).
 */
export async function updateDokumenStatus(
  supabase: SupabaseClient,
  id: string,
  payload: {
    status: string
    currentStep: string | null
    revisionTarget: string | null
    revisionNotes?: string
  }
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('dokumen_transaksi')
    .update({
      status: payload.status,
      current_step: payload.currentStep,
      revision_target: payload.revisionTarget,
      revision_notes: payload.revisionNotes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('[dokumen-helpers] updateDokumenStatus error:', error)
    return { error: 'Gagal memperbarui status dokumen' }
  }

  return {}
}

// ---------------------------------------------------------------------------
// Log Helpers (append-only)
// ---------------------------------------------------------------------------

/**
 * Insert a log entry. This is append-only - NO UPDATE/DELETE.
 */
export async function insertLog(
  supabase: SupabaseClient,
  payload: {
    dokumenId: string
    userId: string
    aksi: string
    catatan?: string | null
    stepUrutan?: number | null
  }
): Promise<{ data?: LogRow; error?: string }> {
  const { data, error } = await supabase
    .from('log_aktivitas')
    .insert({
      dokumen_id: payload.dokumenId,
      user_id: payload.userId,
      aksi: payload.aksi,
      catatan: payload.catatan ?? null,
      step_urutan: payload.stepUrutan ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[dokumen-helpers] insertLog error:', error)
    return { error: 'Gagal mencatat aktivitas' }
  }

  return { data: data as LogRow }
}

/**
 * Get log entries for a dokumen.
 */
export async function getLogsByDokumen(
  supabase: SupabaseClient,
  dokumenId: string
): Promise<LogRow[]> {
  const { data, error } = await supabase
    .from('log_aktivitas')
    .select('*')
    .eq('dokumen_id', dokumenId)
    .order('timestamp', { ascending: true })

  if (error) {
    console.error('[dokumen-helpers] getLogsByDokumen error:', error)
    return []
  }

  return (data ?? []) as LogRow[]
}

// ---------------------------------------------------------------------------
// Storage Filename Helpers (Single Source of Truth)
// ---------------------------------------------------------------------------

export { isPendingFile as isStoragePathPending } from './utils/file'

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
