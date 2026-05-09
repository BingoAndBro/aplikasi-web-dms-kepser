import type { SupabaseClient } from '@supabase/supabase-js'
import { createFungsiSchema } from '../schemas/master-data'
import type { FungsiRow } from './shared'

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

export async function createFungsi(
  supabase: SupabaseClient,
  payload: { nama: string; deskripsi?: string }
): Promise<{ data?: FungsiRow; error?: string }> {
  const parsed = createFungsiSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

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
