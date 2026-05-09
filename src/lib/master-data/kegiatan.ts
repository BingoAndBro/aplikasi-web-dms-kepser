import type { SupabaseClient } from '@supabase/supabase-js'
import { createKegiatanSchema } from '../schemas/master-data'
import type { KegiatanRow } from './shared'

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

export async function createKegiatan(
  supabase: SupabaseClient,
  payload: { fungsiId: string; nama: string; deskripsi?: string }
): Promise<{ data?: KegiatanRow; error?: string }> {
  const parsed = createKegiatanSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

  const { data: fungsi } = await supabase
    .from('master_fungsi')
    .select('id, nama')
    .eq('id', parsed.data.fungsiId)
    .eq('is_active', true)
    .maybeSingle()

  if (!fungsi) return { error: 'Fungsi tidak ditemukan atau tidak aktif' }

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
