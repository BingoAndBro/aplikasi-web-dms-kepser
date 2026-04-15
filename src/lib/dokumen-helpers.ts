/**
 * Helper functions for dokumen_transaksi operations.
 * Uses Supabase client (not Drizzle ORM) — follows existing project convention.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LampiranUrl = {
  kelengkapan_id: string
  nama: string
  url: string
  uploaded_at: string
}

export type DokumenRow = {
  id: string
  judul: string
  fungsi_id: string
  kegiatan_jenis_id: string
  is_ketua_tim: boolean
  status: string
  current_step: string | null
  revision_target: string | null
  revision_notes: string | null
  lampiran_urls: LampiranUrl[]
  tahun: number
  tanggal: string
  created_by: string
  created_at: string
  updated_at: string
  // Joined fields
  fungsi_nama?: string
  kegiatan_nama?: string
}

export type LogRow = {
  id: string
  dokumen_id: string
  user_id: string
  aksi: string
  catatan: string | null
  step_urutan: number | null
  timestamp: string
  // Joined
  user_nama?: string
}

// ---------------------------------------------------------------------------
// Dokumen CRUD Helpers
// ---------------------------------------------------------------------------

/**
 * Get single dokumen by ID with joined fungsi + kegiatan.
 */
export async function getDokumenById(
  supabase: SupabaseClient,
  id: string
): Promise<DokumenRow | null> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .select(`
      *,
      master_fungsi:nama as fungsi_nama,
      master_kegiatan:nama as kegiatan_nama
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null

  return parseDokumen(data)
}

/**
 * Get all dokumen for a specific user, ordered by created_at DESC.
 */
export async function getDokumenByUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DokumenRow[]> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .select(`
      *,
      master_fungsi:nama as fungsi_nama,
      master_kegiatan:nama as kegiatan_nama
    `)
    .eq('created_by', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dokumen-helpers] getDokumenByUser error:', error)
    return []
  }

  return (data ?? []).map(parseDokumen)
}

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
    })
    .select(`
      *,
      master_fungsi:nama as fungsi_nama,
      master_kegiatan:nama as kegiatan_nama
    `)
    .single()

  if (error) {
    console.error('[dokumen-helpers] createDokumen error:', error)
    return { error: 'Gagal membuat dokumen' }
  }

  return { data: parseDokumen(data) }
}

/**
 * Update lampiran_urls on a dokumen. Only for NEED_REVISION target=USER.
 */
export async function updateDokumen(
  supabase: SupabaseClient,
  id: string,
  payload: { lampiranUrls: LampiranUrl[] }
): Promise<{ data?: DokumenRow; error?: string }> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .update({
      lampiran_urls: JSON.stringify(payload.lampiranUrls),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      *,
      master_fungsi:nama as fungsi_nama,
      master_kegiatan:nama as kegiatan_nama
    `)
    .single()

  if (error) {
    console.error('[dokumen-helpers] updateDokumen error:', error)
    return { error: 'Gagal memperbarui dokumen' }
  }

  return { data: parseDokumen(data) }
}

/**
 * Update dokumen status fields after FSM transition.
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
): Promise<{ data?: DokumenRow; error?: string }> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .update({
      status: payload.status,
      current_step: payload.currentStep,
      revision_target: payload.revisionTarget,
      revision_notes: payload.revisionNotes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      *,
      master_fungsi:nama as fungsi_nama,
      master_kegiatan:nama as kegiatan_nama
    `)
    .single()

  if (error) {
    console.error('[dokumen-helpers] updateDokumenStatus error:', error)
    return { error: 'Gagal memperbarui status dokumen' }
  }

  return { data: parseDokumen(data) }
}

// ---------------------------------------------------------------------------
// Log Helpers (append-only)
// ---------------------------------------------------------------------------

/**
 * Insert a log entry. This is append-only — NO UPDATE/DELETE.
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
// Kelengkapan validation helpers
// ---------------------------------------------------------------------------

export type KelengkapanRequired = {
  id: string
  nama_dokumen: string
  required: boolean
}

/**
 * Get required kelengkapan for a kegiatan + role combination.
 */
export async function getKelengkapanRequired(
  supabase: SupabaseClient,
  kegiatanId: string,
  isKetuaTim: boolean
): Promise<KelengkapanRequired[]> {
  const { data, error } = await supabase
    .from('master_kelengkapan_dokumen')
    .select('id, nama_dokumen, required')
    .eq('kegiatan_id', kegiatanId)
    .eq('is_ketua_tim', isKetuaTim)

  if (error) {
    console.error('[dokumen-helpers] getKelengkapanRequired error:', error)
    return []
  }

  return (data ?? []) as KelengkapanRequired[]
}

// ---------------------------------------------------------------------------
// Role check helper
// ---------------------------------------------------------------------------

/**
 * Check if user has an approver role (PPK/BENDAHARA/ARSIPARIS/ADMIN).
 */
export async function userHasApproverRole(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role:roles(nama)')
    .eq('user_id', userId)

  if (error || !data) return false

  const roleNames = data
    .map((r: any) => r.role?.nama as string | undefined)
    .filter(Boolean) as string[]

  return ['PPK', 'BENDAHARA', 'ARSIPARIS', 'ADMIN'].some(r => roleNames.includes(r))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseDokumen(raw: any): DokumenRow {
  let lampiranUrls: LampiranUrl[] = []
  if (raw.lampiran_urls) {
    if (typeof raw.lampiran_urls === 'string') {
      try {
        lampiranUrls = JSON.parse(raw.lampiran_urls)
      } catch {
        lampiranUrls = []
      }
    } else {
      lampiranUrls = raw.lampiran_urls
    }
  }

  return {
    id: raw.id,
    judul: raw.judul,
    fungsi_id: raw.fungsi_id,
    kegiatan_jenis_id: raw.kegiatan_jenis_id,
    is_ketua_tim: raw.is_ketua_tim,
    status: raw.status,
    current_step: raw.current_step,
    revision_target: raw.revision_target,
    revision_notes: raw.revision_notes,
    lampiran_urls: lampiranUrls,
    tahun: raw.tahun,
    tanggal: raw.tanggal,
    created_by: raw.created_by,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    fungsi_nama: raw.fungsi_nama,
    kegiatan_nama: raw.kegiatan_nama,
  }
}
