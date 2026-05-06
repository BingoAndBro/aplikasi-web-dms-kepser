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
  nominal_realisasi: number | null
  is_non_material: boolean
  jenis_dokumen_id: string | null
  keterangan_detail: string | null
  created_at: string
  updated_at: string
  // Chain fields (for Material)
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
  // Joined fields
  fungsi_nama?: string
  kegiatan_nama?: string
  jenis_permintaan_nama?: string
  kategori_permintaan_nama?: string
  detail_permintaan_nama?: string
  jenis_dokumen_nama?: string
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

  // Manual join: fetch jenis_permintaan nama
  if (data.jenis_permintaan_id) {
    const { data: jenis } = await supabase
      .from('master_jenis_permintaan')
      .select('nama')
      .eq('id', data.jenis_permintaan_id)
      .single()
    if (jenis) (data as any).jenis_permintaan_nama = jenis.nama
  }

  // Manual join: fetch kategori_permintaan nama
  if (data.kategori_permintaan_id) {
    const { data: kat } = await supabase
      .from('master_kategori_permintaan')
      .select('nama')
      .eq('id', data.kategori_permintaan_id)
      .single()
    if (kat) (data as any).kategori_permintaan_nama = kat.nama
  }

  // Manual join: fetch detail_permintaan nama
  if (data.detail_permintaan_id) {
    const { data: det } = await supabase
      .from('master_detail_permintaan')
      .select('nama')
      .eq('id', data.detail_permintaan_id)
      .single()
    if (det) (data as any).detail_permintaan_nama = det.nama
  }

  // Manual join: fetch jenis_dokumen nama (for Non-Material)
  if ((data as any).jenis_dokumen_id) {
    const { data: jenisDok } = await supabase
      .from('master_jenis_dokumen')
      .select('nama')
      .eq('id', (data as any).jenis_dokumen_id)
      .single()
    if (jenisDok) (data as any).jenis_dokumen_nama = jenisDok.nama
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
 * Get required kelengkapan for a kegiatan + role + optional chain.
 * Uses dynamic match: only filters on chain columns if provided.
 * When all chain params are null, falls back to kegiatan+role only (backward compat).
 */
export async function getKelengkapanRequired(
  supabase: SupabaseClient,
  kegiatanId: string,
  isKetuaTim: boolean,
  options?: {
    jenisPermintaanId?: string
    kategoriPermintaanId?: string
    detailPermintaanId?: string
  }
): Promise<KelengkapanRequired[]> {
  let query = supabase
    .from('master_kelengkapan_dokumen')
    .select('id, nama_dokumen, required')
    .eq('kegiatan_id', kegiatanId)
    .eq('is_ketua_tim', isKetuaTim)

  // Kelengkapan melekat ke leaf node — apply chain filters.
  if (options?.detailPermintaanId) {
    query = query.eq('detail_permintaan_id', options.detailPermintaanId)
  } else if (options?.kategoriPermintaanId) {
    query = query
      .eq('kategori_permintaan_id', options.kategoriPermintaanId)
      .is('detail_permintaan_id', null)
  } else if (options?.jenisPermintaanId) {
    query = query
      .eq('jenis_permintaan_id', options.jenisPermintaanId)
      .is('kategori_permintaan_id', null)
      .is('detail_permintaan_id', null)
  }
  // else: no chain → match legacy items (all chain cols NULL)

  const { data, error } = await query

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
// Leaf Node Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the most specific (leaf) node name from a permintaan chain.
 * Priority: detail → kategori → jenis → fallback
 */
export async function resolveLeafNodeName(
  supabase: SupabaseClient,
  opts: {
    detailId?: string | null
    kategoriId?: string | null
    jenisId?: string | null
    fallback?: string
  }
): Promise<string> {
  if (opts.detailId) {
    const { data } = await supabase
      .from('master_detail_permintaan')
      .select('nama')
      .eq('id', opts.detailId)
      .single()
    if (data?.nama) return data.nama
  }
  if (opts.kategoriId) {
    const { data } = await supabase
      .from('master_kategori_permintaan')
      .select('nama')
      .eq('id', opts.kategoriId)
      .single()
    if (data?.nama) return data.nama
  }
  if (opts.jenisId) {
    const { data } = await supabase
      .from('master_jenis_permintaan')
      .select('nama')
      .eq('id', opts.jenisId)
      .single()
    if (data?.nama) return data.nama
  }
  return opts.fallback ?? 'Dokumen'
}

// ---------------------------------------------------------------------------
// Laporan Helpers
// ---------------------------------------------------------------------------

export type DokumenLaporanRow = DokumenRow & {
  pengaju_nama?: string
  pengaju_id?: string
  leaf_node_nama?: string
}

/**
 * Ambil semua dokumen berstatus COMPLETED atau TERSIMPAN milik user, dengan full join nama.
 * TERSIMPAN = dokumen Non-Material yang tersimpan
 * COMPLETED = dokumen Material yang telah disetujui
 */
export async function getDokumenSelesaiByUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DokumenLaporanRow[]> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .select('*')
    .eq('created_by', userId)
    .in('status', ['COMPLETED', 'TERSIMPAN'])
    .order('tanggal', { ascending: false })

  if (error || !data || data.length === 0) return []

  return _enrichDokumenRows(supabase, data)
}

/**
 * Ambil semua dokumen COMPLETED/TERSIMPAN dari kegiatan dimana user adalah chairman saat ini.
 * Includes all documents regardless of who submitted them.
 * WAJIB menggunakan admin client agar bisa baca dokumen user lain.
 */
export async function getDokumenKegiatanByKetuaTim(
  adminClient: SupabaseClient,
  userId: string
): Promise<DokumenLaporanRow[]> {
  // 1. Get all kegiatan where user is assigned as chairman
  const { data: assignments, error: e0 } = await adminClient
    .from('ketua_tim_assignments')
    .select('kegiatan_id')
    .eq('user_id', userId)

  if (e0 || !assignments || assignments.length === 0) return []

  const kegiatanIds = assignments.map((a: any) => a.kegiatan_id)

  // 2. Get ALL COMPLETED/TERSIMPAN documents for those kegiatan
  const { data: allDocs, error: e1 } = await adminClient
    .from('dokumen_transaksi')
    .select('*')
    .in('kegiatan_jenis_id', kegiatanIds)
    .in('status', ['COMPLETED', 'TERSIMPAN'])

  if (e1 || !allDocs || allDocs.length === 0) return []

  // 3. Return enriched list with all metadata
  return _enrichDokumenRows(adminClient, allDocs)
}

/**
 * Internal: enrich array dokumen raw dengan nama-nama joined.
 */
async function _enrichDokumenRows(
  supabase: SupabaseClient,
  rows: any[]
): Promise<DokumenLaporanRow[]> {
  if (rows.length === 0) return []

  // Collect unique IDs
  const fungsiIds = [...new Set(rows.map((d: any) => d.fungsi_id).filter(Boolean))]
  const kegIds = [...new Set(rows.map((d: any) => d.kegiatan_jenis_id).filter(Boolean))]
  const jenisIds = [...new Set(rows.map((d: any) => d.jenis_permintaan_id).filter(Boolean))]
  const katIds = [...new Set(rows.map((d: any) => d.kategori_permintaan_id).filter(Boolean))]
  const detIds = [...new Set(rows.map((d: any) => d.detail_permintaan_id).filter(Boolean))]

  const fungsiMap: Record<string, string> = {}
  const kegMap: Record<string, string> = {}
  const jenisMap: Record<string, string> = {}
  const katMap: Record<string, string> = {}
  const detMap: Record<string, string> = {}

  if (fungsiIds.length) {
    const { data } = await supabase.from('master_fungsi').select('id, nama').in('id', fungsiIds)
    for (const r of data ?? []) fungsiMap[r.id] = r.nama
  }
  if (kegIds.length) {
    const { data } = await supabase.from('master_kegiatan').select('id, nama').in('id', kegIds)
    for (const r of data ?? []) kegMap[r.id] = r.nama
  }
  if (jenisIds.length) {
    const { data } = await supabase.from('master_jenis_permintaan').select('id, nama').in('id', jenisIds)
    for (const r of data ?? []) jenisMap[r.id] = r.nama
  }
  if (katIds.length) {
    const { data } = await supabase.from('master_kategori_permintaan').select('id, nama').in('id', katIds)
    for (const r of data ?? []) katMap[r.id] = r.nama
  }
  if (detIds.length) {
    const { data } = await supabase.from('master_detail_permintaan').select('id, nama').in('id', detIds)
    for (const r of data ?? []) detMap[r.id] = r.nama
  }

  return rows.map((raw: any): DokumenLaporanRow => {
    const leafNama = detMap[raw.detail_permintaan_id]
      ?? katMap[raw.kategori_permintaan_id]
      ?? jenisMap[raw.jenis_permintaan_id]
      ?? kegMap[raw.kegiatan_jenis_id]
      ?? ''

    return {
      ...parseDokumenWithNames(raw, fungsiMap, kegMap),
      jenis_permintaan_id: raw.jenis_permintaan_id,
      kategori_permintaan_id: raw.kategori_permintaan_id,
      detail_permintaan_id: raw.detail_permintaan_id,
      jenis_permintaan_nama: jenisMap[raw.jenis_permintaan_id],
      kategori_permintaan_nama: katMap[raw.kategori_permintaan_id],
      detail_permintaan_nama: detMap[raw.detail_permintaan_id],
      leaf_node_nama: leafNama,
      pengaju_id: raw.created_by,
    }
  })
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
    nominal_realisasi: raw.nominal_realisasi ?? null,
    is_non_material: raw.is_non_material ?? false,
    jenis_dokumen_id: raw.jenis_dokumen_id ?? null,
    keterangan_detail: raw.keterangan_detail ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    fungsi_nama: raw.fungsi_nama,
    kegiatan_nama: raw.kegiatan_nama,
    jenis_permintaan_id: raw.jenis_permintaan_id,
    kategori_permintaan_id: raw.kategori_permintaan_id,
    detail_permintaan_id: raw.detail_permintaan_id,
    jenis_permintaan_nama: raw.jenis_permintaan_nama,
    kategori_permintaan_nama: raw.kategori_permintaan_nama,
    detail_permintaan_nama: raw.detail_permintaan_nama,
    jenis_dokumen_nama: raw.jenis_dokumen_nama,
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
    nominal_realisasi: raw.nominal_realisasi ?? null,
    is_non_material: raw.is_non_material ?? false,
    jenis_dokumen_id: raw.jenis_dokumen_id ?? null,
    keterangan_detail: raw.keterangan_detail ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    fungsi_nama: fungsiMap[raw.fungsi_id] ?? raw.fungsi_nama ?? undefined,
    kegiatan_nama: kegMap[raw.kegiatan_jenis_id] ?? raw.kegiatan_nama ?? undefined,
    jenis_dokumen_nama: raw.jenis_dokumen_nama,
  }
}

// ---------------------------------------------------------------------------
// Storage Filename Helpers (Single Source of Truth)
// ---------------------------------------------------------------------------

/**
 * Membersihkan karakter berbahaya dari nama file.
 * Karakter seperti / \ * ? " < > | akan diganti dengan underscore.
 */
function _sanitizeFilename(str: string): string {
  return str.replace(/[\/\\:*?"<>|]/g, '_').replace(/_+/g, '_')
}

/**
 * Mengekstrak ekstensi dari nama file.
 * Returns: ekstensi dalam lowercase atau string kosong jika tidak ada.
 */
function _extractExtension(filename: string): string {
  const lastDotIdx = filename.lastIndexOf('.')
  return lastDotIdx > 0 && lastDotIdx < filename.length - 1
    ? filename.slice(lastDotIdx + 1).toLowerCase()
    : ''
}

/**
 * Mengekstrak nama file dari storage path.
 * Handles format: [folder]/[filename.ext] atau dash-style [timestamp]-[random]-[filename]
 */
function _extractFilenameFromPath(url: string): string {
  const pathParts = url.split('/')
  const filenameWithExt = pathParts[pathParts.length - 1] || 'download'

  // Cek apakah dash-format (PENDING file): timestamp-random-filename
  const dashMatch = filenameWithExt.match(/^\d{13}-[a-zA-Z0-9]+-(.+)$/)
  if (dashMatch) {
    return dashMatch[1]
  }

  return filenameWithExt
}

/**
 * Cek apakah storage path adalah PENDING file.
 * PENDING = storage path dengan format timestamp-random-filename (dash).
 * File PENDING adalah file yang baru diupload saat edit/revisi.
 * File FORMAL adalah file yang sudah disubmit ke workflow.
 */
export function isStoragePathPending(lampiranUrl: string): boolean {
  const pathParts = lampiranUrl.split('/')
  const filenameWithExt = pathParts[pathParts.length - 1] || 'download'
  return /^\d{13}-[a-zA-Z0-9]+-.+$/.test(filenameWithExt)
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

  // Extract extension dari storage path
  const ext = _extractExtension(lamp.url)

  return `${_sanitizeFilename(kelengkapanNama)}_${_sanitizeFilename(leafNode)}_${_sanitizeFilename(kegiatanNama)}_${tanggal}.${ext}`
}

/**
 * Membangun nama file untuk storage/display.
 * - Jika file PENDING (dash-format path), kembalikan nama upload asli
 * - Jika file FORMAL, kembalikan formal filename
 */
export function buildStorageFilename(dok: DokumenRow, lamp: LampiranUrl): string {
  if (isStoragePathPending(lamp.url)) {
    // File PENDING - gunakan nama upload asli dari storage path
    return _extractFilenameFromPath(lamp.url)
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
  const ext = _extractExtension(lamp.url)
  const uuid = crypto.randomUUID()
  return `${userId}/${dokId}/${uuid}.${ext}`
}
