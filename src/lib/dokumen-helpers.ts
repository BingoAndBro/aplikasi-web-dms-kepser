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
 * Get single dokumen by ID with joined fungsi + kegiatan (manual join).
 */
export async function getDokumenById(
  supabase: SupabaseClient,
  id: string
): Promise<DokumenRow | null> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return null

  // Manual join: fetch kegiatan name
  if (data.kegiatan_jenis_id) {
    const { data: keg } = await supabase
      .from('master_kegiatan')
      .select('nama')
      .eq('id', data.kegiatan_jenis_id)
      .single()
    if (keg) (data as any).kegiatan_nama = keg.nama
  }

  // Manual join: fetch fungsi name
  if (data.fungsi_id) {
    const { data: fns } = await supabase
      .from('master_fungsi')
      .select('nama')
      .eq('id', data.fungsi_id)
      .single()
    if (fns) (data as any).fungsi_nama = fns.nama
  }

  return parseDokumen(data)
}

/**
 * Get all dokumen for a specific user, ordered by created_at DESC.
 * Manual join for kegiatan_nama and fungsi_nama (avoids PostgREST alias issues).
 */
export async function getDokumenByUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DokumenRow[]> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[dokumen-helpers] getDokumenByUser error:', error)
    return []
  }

  const dokList = data ?? []

  if (dokList.length === 0) return []

  // Collect unique IDs for manual join
  const fungsiIds = [...new Set(dokList.map(d => d.fungsi_id).filter(Boolean))]
  const kegiatanIds = [...new Set(dokList.map(d => d.kegiatan_jenis_id).filter(Boolean))]

  // Fetch fungsi names
  const fungsiMap: Record<string, string> = {}
  if (fungsiIds.length > 0) {
    const { data: fungsiRows } = await supabase
      .from('master_fungsi')
      .select('id, nama')
      .in('id', fungsiIds)
    for (const row of fungsiRows ?? []) {
      fungsiMap[row.id] = row.nama
    }
  }

  // Fetch kegiatan names
  const kegiatanMap: Record<string, string> = {}
  if (kegiatanIds.length > 0) {
    const { data: kegRows } = await supabase
      .from('master_kegiatan')
      .select('id, nama')
      .in('id', kegiatanIds)
    for (const row of kegRows ?? []) {
      kegiatanMap[row.id] = row.nama
    }
  }

  return dokList.map(d => parseDokumenWithNames(d, fungsiMap, kegiatanMap))
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

function parseDokumenWithNames(
  raw: any,
  fungsiMap: Record<string, string>,
  kegMap: Record<string, string>
): DokumenRow {
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
    fungsi_nama: fungsiMap[raw.fungsi_id] ?? raw.fungsi_nama ?? undefined,
    kegiatan_nama: kegMap[raw.kegiatan_jenis_id] ?? raw.kegiatan_nama ?? undefined,
  }
}
