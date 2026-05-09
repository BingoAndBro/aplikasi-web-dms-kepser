import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDokumen, parseDokumenWithNames } from './parse'
import type { DokumenLaporanRow, DokumenRow, KelengkapanRequired } from './types'

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

  // Kelengkapan melekat ke leaf node â€” apply chain filters.
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
  // else: no chain â†’ match legacy items (all chain cols NULL)

  const { data, error } = await query

  if (error) {
    console.error('[dokumen-helpers] getKelengkapanRequired error:', error)
    return []
  }

  return (data ?? []) as KelengkapanRequired[]
}

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

/**
 * Resolve the most specific (leaf) node name from a permintaan chain.
 * Priority: detail â†’ kategori â†’ jenis â†’ fallback
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
