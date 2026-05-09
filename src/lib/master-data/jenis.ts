import type { SupabaseClient } from '@supabase/supabase-js'
import { createJenisSchema } from '../schemas/master-data'
import type { JenisRow } from './shared'

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
