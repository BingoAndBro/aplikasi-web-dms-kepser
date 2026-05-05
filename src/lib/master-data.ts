/**
 * Client-side service layer untuk master data.
 * Pakai Supabase browser client langsung — tidak bergantung pada
 * server-side API route handler (yang tidak accessible dari client
 * saat app berjalan dalam mode SPA / ssr: false).
 *
 * Dipakai oleh: admin.master-data.*.tsx pages
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MasterFungsi } from './db/schema'
import { createFungsiSchema, createKegiatanSchema, createKelengkapanSchema, createJenisSchema, createKategoriSchema, createDetailSchema } from './schemas/master-data'

// ---------------------------------------------------------------------------
// Types for API responses (with joined data)
// ---------------------------------------------------------------------------

export type FungsiWithKegiatanCount = MasterFungsi & {
  jumlah_kegiatan?: number
}

// Supabase returns snake_case DB column names (fungsi_id, is_active, created_at).
// These types match what Supabase actually returns from .select('*').
export type FungsiRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  jumlah_kegiatan?: number
}

export type KegiatanRow = {
  id: string
  nama: string
  deskripsi: string | null
  fungsi_id: string
  is_active: boolean
  created_at: string
  fungsi_nama?: string
}

export type KelengkapanRow = {
  id: string
  nama_dokumen: string
  is_ketua_tim: boolean
  required: boolean
  kegiatan_id: string
  created_at: string
  kegiatan_nama?: string
  fungsi_nama?: string
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
}

export type JenisRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  jumlah_kategori?: number
}

export type KategoriRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  jenis_permintaan_id: string
  jenis_nama?: string
  jumlah_detail?: number
}

export type DetailRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  kategori_permintaan_id: string
  kategori_nama?: string
  jenis_nama?: string
}

export type JenisDokumenRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// Fungsi Helpers
// ---------------------------------------------------------------------------

/**
 * Ambil semua fungsi aktif, sorted by nama ASC.
 */
export async function getAllFungsi(
  supabase: SupabaseClient
): Promise<FungsiRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_fungsi')
      .select('*')
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getAllFungsi error:', error)
      return []
    }

    return (data as FungsiRow[]) ?? []
  } catch (err) {
    console.error('[master-data] getAllFungsi exception:', err)
    return []
  }
}

/**
 * Ambil satu fungsi by ID.
 */
export async function getFungsiById(
  supabase: SupabaseClient,
  id: string
): Promise<FungsiRow | null> {
  try {
    const { data, error } = await supabase
      .from('master_fungsi')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return null
    return data as FungsiRow
  } catch {
    return null
  }
}

/**
 * Ambil jumlah kegiatan aktif per fungsi.
 */
export async function getFungsiWithKegiatanCount(
  supabase: SupabaseClient
): Promise<FungsiRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_fungsi')
      .select('*, master_kegiatan(id)')
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getFungsiWithKegiatanCount error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      jumlah_kegiatan: Array.isArray(row.master_kegiatan)
        ? row.master_kegiatan.length
        : 0,
    })) as FungsiRow[]
  } catch (err) {
    console.error('[master-data] getFungsiWithKegiatanCount exception:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Kegiatan Helpers
// ---------------------------------------------------------------------------

/**
 * Ambil semua kegiatan aktif dengan info fungsi.
 */
export async function getAllKegiatan(
  supabase: SupabaseClient
): Promise<KegiatanRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_kegiatan')
      .select('*, master_fungsi(nama)')
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getAllKegiatan error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      fungsi_nama: row.master_fungsi?.nama,
    })) as KegiatanRow[]
  } catch (err) {
    console.error('[master-data] getAllKegiatan exception:', err)
    return []
  }
}

/**
 * Ambil kegiatan aktif untuk fungsi tertentu.
 */
export async function getKegiatanByFungsi(
  supabase: SupabaseClient,
  fungsiId: string
): Promise<KegiatanRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_kegiatan')
      .select('*, master_fungsi(nama)')
      .eq('is_active', true)
      .eq('fungsi_id', fungsiId)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getKegiatanByFungsi error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      fungsi_nama: row.master_fungsi?.nama,
    })) as KegiatanRow[]
  } catch (err) {
    console.error('[master-data] getKegiatanByFungsi exception:', err)
    return []
  }
}

/**
 * Ambil satu kegiatan by ID.
 */
export async function getKegiatanById(
  supabase: SupabaseClient,
  id: string
): Promise<KegiatanRow | null> {
  try {
    const { data, error } = await supabase
      .from('master_kegiatan')
      .select('*, master_fungsi(nama)')
      .eq('id', id)
      .single()

    if (error) return null

    const row = data as any
    return {
      ...row,
      fungsi_nama: row.master_fungsi?.nama,
    } as KegiatanRow
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Kelengkapan Helpers
// ---------------------------------------------------------------------------

/**
 * Ambil semua kelengkapan dengan info kegiatan dan fungsi.
 */
export async function getAllKelengkapan(
  supabase: SupabaseClient
): Promise<KelengkapanRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_kelengkapan_dokumen')
      .select(`
        *,
        master_kegiatan(nama, master_fungsi(nama))
      `)
      .order('nama_dokumen', { ascending: true })

    if (error) {
      console.error('[master-data] getAllKelengkapan error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      kegiatan_nama: row.master_kegiatan?.nama,
      fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
    })) as KelengkapanRow[]
  } catch (err) {
    console.error('[master-data] getAllKelengkapan exception:', err)
    return []
  }
}

/**
 * Ambil kelengkapan untuk kegiatan tertentu, filtered by is_ketua_tim.
 */
export async function getKelengkapanByKegiatan(
  supabase: SupabaseClient,
  kegiatanId: string,
  isKetuaTim: boolean
): Promise<KelengkapanRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_kelengkapan_dokumen')
      .select('*')
      .eq('kegiatan_id', kegiatanId)
      .eq('is_ketua_tim', isKetuaTim)
      .order('nama_dokumen', { ascending: true })

    if (error) {
      console.error('[master-data] getKelengkapanByKegiatan error:', error)
      return []
    }

    return (data as KelengkapanRow[]) ?? []
  } catch (err) {
    console.error('[master-data] getKelengkapanByKegiatan exception:', err)
    return []
  }
}

/**
 * Ambil kelengkapan untuk kegiatan tertentu dengan info kegiatan + fungsi.
 */
export async function getKelengkapanByKegiatanWithInfo(
  supabase: SupabaseClient,
  kegiatanId: string
): Promise<KelengkapanRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_kelengkapan_dokumen')
      .select(`
        *,
        master_kegiatan(nama, master_fungsi(nama))
      `)
      .eq('kegiatan_id', kegiatanId)
      .order('is_ketua_tim', { ascending: true })
      .order('nama_dokumen', { ascending: true })

    if (error) {
      console.error('[master-data] getKelengkapanByKegiatanWithInfo error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      kegiatan_nama: row.master_kegiatan?.nama,
      fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
    })) as KelengkapanRow[]
  } catch (err) {
    console.error('[master-data] getKelengkapanByKegiatanWithInfo exception:', err)
    return []
  }
}

export async function getKelengkapanByChain(
  supabase: SupabaseClient,
  fungsiId: string,
  kegiatanId: string,
  jenisId?: string,
  kategoriId?: string,
  detailId?: string,
): Promise<KelengkapanRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_kelengkapan_dokumen')
      .select(`
        *,
        master_kegiatan(nama, master_fungsi(nama))
      `)
      .eq('kegiatan_id', kegiatanId)
      .order('is_ketua_tim', { ascending: true })
      .order('nama_dokumen', { ascending: true })

    if (error) {
      console.error('[master-data] getKelengkapanByChain error:', error)
      return []
    }

    // Filter in-memory: show item if its chain matches OR it's a legacy item (all chain cols null)
    const filtered = (data as any[]).filter(row => {
      const isLegacy = !row.jenis_permintaan_id && !row.kategori_permintaan_id && !row.detail_permintaan_id
      if (isLegacy) return true

      // Non-legacy items: must match the chain
      // Jenis must match (or be null = legacy, already handled above)
      if (jenisId && row.jenis_permintaan_id && row.jenis_permintaan_id !== jenisId) return false
      if (kategoriId && row.kategori_permintaan_id && row.kategori_permintaan_id !== kategoriId) return false
      if (detailId && row.detail_permintaan_id && row.detail_permintaan_id !== detailId) return false

      return true
    })

    return filtered.map(row => ({
      ...row,
      kegiatan_nama: row.master_kegiatan?.nama,
      fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
    })) as KelengkapanRow[]
  } catch (err) {
    console.error('[master-data] getKelengkapanByChain exception:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// CRUD — Fungsi
// ---------------------------------------------------------------------------

export async function createFungsi(
  supabase: SupabaseClient,
  payload: { nama: string; deskripsi?: string }
): Promise<{ data?: FungsiRow; error?: string }> {
  const parsed = createFungsiSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

  // Cek duplikat
  const { data: existing } = await supabase
    .from('master_fungsi')
    .select('id')
    .eq('nama', parsed.data.nama)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    return { error: `Nama fungsi "${parsed.data.nama}" sudah ada` }
  }

  const { data, error } = await supabase
    .from('master_fungsi')
    .insert({ nama: parsed.data.nama, deskripsi: parsed.data.deskripsi ?? null })
    .select()
    .single()

  if (error) return { error: 'Gagal membuat fungsi' }
  return { data: data as FungsiRow }
}

export async function updateFungsi(
  supabase: SupabaseClient,
  id: string,
  payload: { nama?: string; deskripsi?: string }
): Promise<{ data?: FungsiRow; error?: string }> {
  const { data, error } = await supabase
    .from('master_fungsi')
    .update({ nama: payload.nama, deskripsi: payload.deskripsi })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: 'Gagal mengupdate fungsi' }
  return { data: data as FungsiRow }
}

export async function deleteFungsi(
  supabase: SupabaseClient,
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('master_fungsi')
    .delete()
    .eq('id', id)

  if (error) return { error: 'Gagal menghapus fungsi' }
  return {}
}

// ---------------------------------------------------------------------------
// CRUD — Kegiatan
// ---------------------------------------------------------------------------

export async function createKegiatan(
  supabase: SupabaseClient,
  payload: { fungsiId: string; nama: string; deskripsi?: string }
): Promise<{ data?: KegiatanRow; error?: string }> {
  const parsed = createKegiatanSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

  // Cek fungsi ada
  const { data: fungsi } = await supabase
    .from('master_fungsi')
    .select('id, nama')
    .eq('id', parsed.data.fungsiId)
    .eq('is_active', true)
    .maybeSingle()

  if (!fungsi) return { error: 'Fungsi tidak ditemukan atau tidak aktif' }

  // Cek duplikat
  const { data: existing } = await supabase
    .from('master_kegiatan')
    .select('id')
    .eq('nama', parsed.data.nama)
    .eq('fungsi_id', parsed.data.fungsiId)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) return { error: `Kegiatan "${parsed.data.nama}" sudah ada di fungsi "${fungsi.nama}"` }

  const { data, error } = await supabase
    .from('master_kegiatan')
    .insert({ fungsi_id: parsed.data.fungsiId, nama: parsed.data.nama, deskripsi: parsed.data.deskripsi ?? null })
    .select('*, master_fungsi(nama)')
    .single()

  if (error) return { error: 'Gagal membuat kegiatan' }

  const row = data as any
  return {
    data: {
      ...row,
      fungsi_nama: row.master_fungsi?.nama,
    } as KegiatanRow,
  }
}

export async function updateKegiatan(
  supabase: SupabaseClient,
  id: string,
  payload: { fungsiId?: string; nama?: string; deskripsi?: string }
): Promise<{ data?: KegiatanRow; error?: string }> {
  const { data, error } = await supabase
    .from('master_kegiatan')
    .update({ fungsi_id: payload.fungsiId, nama: payload.nama, deskripsi: payload.deskripsi })
    .eq('id', id)
    .select('*, master_fungsi(nama)')
    .single()

  if (error) return { error: 'Gagal mengupdate kegiatan' }

  const row = data as any
  return {
    data: {
      ...row,
      fungsi_nama: row.master_fungsi?.nama,
    } as KegiatanRow,
  }
}

export async function deleteKegiatan(
  supabase: SupabaseClient,
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('master_kegiatan')
    .delete()
    .eq('id', id)

  if (error) return { error: 'Gagal menghapus kegiatan' }
  return {}
}

// ---------------------------------------------------------------------------
// CRUD — Kelengkapan
// ---------------------------------------------------------------------------

export async function createKelengkapan(
  supabase: SupabaseClient,
  payload: { kegiatanId: string; isKetuaTim: boolean; namaDokumen: string; required: boolean; jenisPermintaanId?: string; kategoriPermintaanId?: string; detailPermintaanId?: string }
): Promise<{ data?: KelengkapanRow; error?: string }> {
  const parsed = createKelengkapanSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

  const { data, error } = await supabase
    .from('master_kelengkapan_dokumen')
    .insert({
      kegiatan_id: parsed.data.kegiatanId,
      is_ketua_tim: parsed.data.isKetuaTim,
      nama_dokumen: parsed.data.namaDokumen,
      required: parsed.data.required,
      jenis_permintaan_id: parsed.data.jenisPermintaanId ?? null,
      kategori_permintaan_id: parsed.data.kategoriPermintaanId ?? null,
      detail_permintaan_id: parsed.data.detailPermintaanId ?? null,
    })
    .select('*, master_kegiatan(nama, master_fungsi(nama))')
    .single()

  if (error) return { error: 'Gagal menambah kelengkapan' }

  const row = data as any
  return {
    data: {
      ...row,
      kegiatan_nama: row.master_kegiatan?.nama,
      fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
    } as KelengkapanRow,
  }
}

export async function updateKelengkapan(
  supabase: SupabaseClient,
  id: string,
  payload: { isKetuaTim?: boolean; namaDokumen?: string; required?: boolean; jenisPermintaanId?: string | null; kategoriPermintaanId?: string | null; detailPermintaanId?: string | null }
): Promise<{ data?: KelengkapanRow; error?: string }> {
  const updatePayload: Record<string, unknown> = {}
  if (payload.isKetuaTim !== undefined) updatePayload.is_ketua_tim = payload.isKetuaTim
  if (payload.namaDokumen !== undefined) updatePayload.nama_dokumen = payload.namaDokumen
  if (payload.required !== undefined) updatePayload.required = payload.required
  if (payload.jenisPermintaanId !== undefined) updatePayload.jenis_permintaan_id = payload.jenisPermintaanId
  if (payload.kategoriPermintaanId !== undefined) updatePayload.kategori_permintaan_id = payload.kategoriPermintaanId
  if (payload.detailPermintaanId !== undefined) updatePayload.detail_permintaan_id = payload.detailPermintaanId

  const { data, error } = await supabase
    .from('master_kelengkapan_dokumen')
    .update(updatePayload)
    .eq('id', id)
    .select('*, master_kegiatan(nama, master_fungsi(nama))')
    .single()

  if (error) return { error: 'Gagal mengupdate kelengkapan' }

  const row = data as any
  return {
    data: {
      ...row,
      kegiatan_nama: row.master_kegiatan?.nama,
      fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
    } as KelengkapanRow,
  }
}

export async function deleteKelengkapan(
  supabase: SupabaseClient,
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('master_kelengkapan_dokumen')
    .delete()
    .eq('id', id)

  if (error) return { error: 'Gagal menghapus kelengkapan' }
  return {}
}

// ---------------------------------------------------------------------------
// Jenis Permintaan Helpers
// ---------------------------------------------------------------------------

export async function getAllJenis(
  supabase: SupabaseClient
): Promise<JenisRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_jenis_permintaan')
      .select('*')
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getAllJenis error:', error)
      return []
    }

    return (data as JenisRow[]) ?? []
  } catch (err) {
    console.error('[master-data] getAllJenis exception:', err)
    return []
  }
}

export async function getAllJenisWithCount(
  supabase: SupabaseClient
): Promise<JenisRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_jenis_permintaan')
      .select('*, master_kategori_permintaan(id)')
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getAllJenisWithCount error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      jumlah_kategori: Array.isArray(row.master_kategori_permintaan)
        ? row.master_kategori_permintaan.length
        : 0,
    })) as JenisRow[]
  } catch (err) {
    console.error('[master-data] getAllJenisWithCount exception:', err)
    return []
  }
}

export async function getAllKategoriWithCount(
  supabase: SupabaseClient
): Promise<KategoriRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_kategori_permintaan')
      .select('*, master_jenis_permintaan(nama), master_detail_permintaan(id)')
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getAllKategoriWithCount error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      jenis_nama: row.master_jenis_permintaan?.nama,
      jumlah_detail: Array.isArray(row.master_detail_permintaan)
        ? row.master_detail_permintaan.length
        : 0,
    })) as KategoriRow[]
  } catch (err) {
    console.error('[master-data] getAllKategoriWithCount exception:', err)
    return []
  }
}

export async function getKategoriByJenis(
  supabase: SupabaseClient,
  jenisId: string
): Promise<KategoriRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_kategori_permintaan')
      .select('*, master_jenis_permintaan(nama)')
      .eq('jenis_permintaan_id', jenisId)
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getKategoriByJenis error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      jenis_nama: row.master_jenis_permintaan?.nama,
    })) as KategoriRow[]
  } catch (err) {
    console.error('[master-data] getKategoriByJenis exception:', err)
    return []
  }
}

export async function getDetailByKategori(
  supabase: SupabaseClient,
  kategoriId: string
): Promise<DetailRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_detail_permintaan')
      .select('*, master_kategori_permintaan(nama, master_jenis_permintaan(nama))')
      .eq('kategori_permintaan_id', kategoriId)
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getDetailByKategori error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      kategori_nama: row.master_kategori_permintaan?.nama,
      jenis_nama: row.master_kategori_permintaan?.master_jenis_permintaan?.nama,
    })) as DetailRow[]
  } catch (err) {
    console.error('[master-data] getDetailByKategori exception:', err)
    return []
  }
}

export async function hasDetailChildren(
  supabase: SupabaseClient,
  kategoriId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('master_detail_permintaan')
      .select('id')
      .eq('kategori_permintaan_id', kategoriId)
      .eq('is_active', true)
      .limit(1)

    if (error) return false
    return (data?.length ?? 0) > 0
  } catch {
    return false
  }
}

export async function getAllDetailWithInfo(
  supabase: SupabaseClient
): Promise<DetailRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_detail_permintaan')
      .select('*, master_kategori_permintaan(nama, master_jenis_permintaan(nama))')
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getAllDetailWithInfo error:', error)
      return []
    }

    return (data as any[]).map(row => ({
      ...row,
      kategori_nama: row.master_kategori_permintaan?.nama,
      jenis_nama: row.master_kategori_permintaan?.master_jenis_permintaan?.nama,
    })) as DetailRow[]
  } catch (err) {
    console.error('[master-data] getAllDetailWithInfo exception:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// CRUD — Jenis
// ---------------------------------------------------------------------------

export async function createJenis(
  supabase: SupabaseClient,
  payload: { nama: string; deskripsi?: string }
): Promise<{ data?: JenisRow; error?: string }> {
  const parsed = createJenisSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

  const { data: existing } = await supabase
    .from('master_jenis_permintaan')
    .select('id')
    .eq('nama', parsed.data.nama)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    return { error: `Jenis permintaan "${parsed.data.nama}" sudah ada` }
  }

  const { data, error } = await supabase
    .from('master_jenis_permintaan')
    .insert({ nama: parsed.data.nama, deskripsi: parsed.data.deskripsi ?? null })
    .select()
    .single()

  if (error) return { error: 'Gagal membuat jenis permintaan' }
  return { data: data as JenisRow }
}

export async function updateJenis(
  supabase: SupabaseClient,
  id: string,
  payload: { nama?: string; deskripsi?: string; isActive?: boolean }
): Promise<{ data?: JenisRow; error?: string }> {
  const { data, error } = await supabase
    .from('master_jenis_permintaan')
    .update({
      nama: payload.nama,
      deskripsi: payload.deskripsi,
      is_active: payload.isActive,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: 'Gagal mengupdate jenis permintaan' }
  return { data: data as JenisRow }
}

export async function deleteJenis(
  supabase: SupabaseClient,
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('master_jenis_permintaan')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { error: 'Gagal menghapus jenis permintaan' }
  return {}
}

// ---------------------------------------------------------------------------
// CRUD — Kategori
// ---------------------------------------------------------------------------

export async function createKategori(
  supabase: SupabaseClient,
  payload: { jenisPermintaanId: string; nama: string; deskripsi?: string }
): Promise<{ data?: KategoriRow; error?: string }> {
  const parsed = createKategoriSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

  const { data: jenis } = await supabase
    .from('master_jenis_permintaan')
    .select('id, nama')
    .eq('id', parsed.data.jenisPermintaanId)
    .eq('is_active', true)
    .maybeSingle()

  if (!jenis) return { error: 'Jenis permintaan tidak ditemukan atau tidak aktif' }

  const { data: existing } = await supabase
    .from('master_kategori_permintaan')
    .select('id')
    .eq('nama', parsed.data.nama)
    .eq('jenis_permintaan_id', parsed.data.jenisPermintaanId)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) return { error: `Kategori "${parsed.data.nama}" sudah ada di jenis "${jenis.nama}"` }

  const { data, error } = await supabase
    .from('master_kategori_permintaan')
    .insert({
      jenis_permintaan_id: parsed.data.jenisPermintaanId,
      nama: parsed.data.nama,
      deskripsi: parsed.data.deskripsi ?? null,
    })
    .select('*, master_jenis_permintaan(nama)')
    .single()

  if (error) return { error: 'Gagal membuat kategori permintaan' }

  const row = data as any
  return { data: { ...row, jenis_nama: row.master_jenis_permintaan?.nama } as KategoriRow }
}

export async function updateKategori(
  supabase: SupabaseClient,
  id: string,
  payload: { jenisPermintaanId?: string; nama?: string; deskripsi?: string; isActive?: boolean }
): Promise<{ data?: KategoriRow; error?: string }> {
  const { data, error } = await supabase
    .from('master_kategori_permintaan')
    .update({
      jenis_permintaan_id: payload.jenisPermintaanId,
      nama: payload.nama,
      deskripsi: payload.deskripsi,
      is_active: payload.isActive,
    })
    .eq('id', id)
    .select('*, master_jenis_permintaan(nama)')
    .single()

  if (error) return { error: 'Gagal mengupdate kategori permintaan' }

  const row = data as any
  return { data: { ...row, jenis_nama: row.master_jenis_permintaan?.nama } as KategoriRow }
}

export async function deleteKategori(
  supabase: SupabaseClient,
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('master_kategori_permintaan')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { error: 'Gagal menghapus kategori permintaan' }
  return {}
}

// ---------------------------------------------------------------------------
// CRUD — Detail
// ---------------------------------------------------------------------------

export async function createDetail(
  supabase: SupabaseClient,
  payload: { kategoriPermintaanId: string; nama: string; deskripsi?: string }
): Promise<{ data?: DetailRow; error?: string }> {
  const parsed = createDetailSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

  const { data: kategori } = await supabase
    .from('master_kategori_permintaan')
    .select('id, nama')
    .eq('id', parsed.data.kategoriPermintaanId)
    .eq('is_active', true)
    .maybeSingle()

  if (!kategori) return { error: 'Kategori permintaan tidak ditemukan atau tidak aktif' }

  const { data: existing } = await supabase
    .from('master_detail_permintaan')
    .select('id')
    .eq('nama', parsed.data.nama)
    .eq('kategori_permintaan_id', parsed.data.kategoriPermintaanId)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) return { error: `Detail "${parsed.data.nama}" sudah ada di kategori "${kategori.nama}"` }

  const { data, error } = await supabase
    .from('master_detail_permintaan')
    .insert({
      kategori_permintaan_id: parsed.data.kategoriPermintaanId,
      nama: parsed.data.nama,
      deskripsi: parsed.data.deskripsi ?? null,
    })
    .select('*, master_kategori_permintaan(nama, master_jenis_permintaan(nama))')
    .single()

  if (error) return { error: 'Gagal membuat detail permintaan' }

  const row = data as any
  return {
    data: {
      ...row,
      kategori_nama: row.master_kategori_permintaan?.nama,
      jenis_nama: row.master_kategori_permintaan?.master_jenis_permintaan?.nama,
    } as DetailRow,
  }
}

export async function updateDetail(
  supabase: SupabaseClient,
  id: string,
  payload: { kategoriPermintaanId?: string; nama?: string; deskripsi?: string; isActive?: boolean }
): Promise<{ data?: DetailRow; error?: string }> {
  const { data, error } = await supabase
    .from('master_detail_permintaan')
    .update({
      kategori_permintaan_id: payload.kategoriPermintaanId,
      nama: payload.nama,
      deskripsi: payload.deskripsi,
      is_active: payload.isActive,
    })
    .eq('id', id)
    .select('*, master_kategori_permintaan(nama, master_jenis_permintaan(nama))')
    .single()

  if (error) return { error: 'Gagal mengupdate detail permintaan' }

  const row = data as any
  return {
    data: {
      ...row,
      kategori_nama: row.master_kategori_permintaan?.nama,
      jenis_nama: row.master_kategori_permintaan?.master_jenis_permintaan?.nama,
    } as DetailRow,
  }
}

export async function deleteDetail(
  supabase: SupabaseClient,
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('master_detail_permintaan')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { error: 'Gagal menghapus detail permintaan' }
  return {}
}

// ---------------------------------------------------------------------------
// Jenis Dokumen (Non-Material) Helpers
// ---------------------------------------------------------------------------

export async function getAllJenisDokumen(
  supabase: SupabaseClient
): Promise<JenisDokumenRow[]> {
  try {
    const { data, error } = await supabase
      .from('master_jenis_dokumen')
      .select('*')
      .eq('is_active', true)
      .order('nama', { ascending: true })

    if (error) {
      console.error('[master-data] getAllJenisDokumen error:', error)
      return []
    }

    return (data as JenisDokumenRow[]) ?? []
  } catch (err) {
    console.error('[master-data] getAllJenisDokumen exception:', err)
    return []
  }
}

export async function createJenisDokumen(
  supabase: SupabaseClient,
  payload: { nama: string; deskripsi?: string }
): Promise<{ data?: JenisDokumenRow; error?: string }> {
  const { data: existing } = await supabase
    .from('master_jenis_dokumen')
    .select('id')
    .eq('nama', payload.nama)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    return { error: `Jenis dokumen "${payload.nama}" sudah ada` }
  }

  const { data, error } = await supabase
    .from('master_jenis_dokumen')
    .insert({ nama: payload.nama, deskripsi: payload.deskripsi ?? null })
    .select()
    .single()

  if (error) return { error: 'Gagal membuat jenis dokumen' }
  return { data: data as JenisDokumenRow }
}

export async function updateJenisDokumen(
  supabase: SupabaseClient,
  id: string,
  payload: { nama?: string; deskripsi?: string; isActive?: boolean }
): Promise<{ data?: JenisDokumenRow; error?: string }> {
  const { data, error } = await supabase
    .from('master_jenis_dokumen')
    .update({
      nama: payload.nama,
      deskripsi: payload.deskripsi,
      is_active: payload.isActive,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: 'Gagal mengupdate jenis dokumen' }
  return { data: data as JenisDokumenRow }
}

export async function deleteJenisDokumen(
  supabase: SupabaseClient,
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('master_jenis_dokumen')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { error: 'Gagal menghapus jenis dokumen' }
  return {}
}
