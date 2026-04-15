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
import { createFungsiSchema, createKegiatanSchema, createKelengkapanSchema } from './schemas/master-data'

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
  payload: { kegiatanId: string; isKetuaTim: boolean; namaDokumen: string; required: boolean }
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
  payload: { isKetuaTim?: boolean; namaDokumen?: string; required?: boolean }
): Promise<{ data?: KelengkapanRow; error?: string }> {
  const { data, error } = await supabase
    .from('master_kelengkapan_dokumen')
    .update({ is_ketua_tim: payload.isKetuaTim, nama_dokumen: payload.namaDokumen, required: payload.required })
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
