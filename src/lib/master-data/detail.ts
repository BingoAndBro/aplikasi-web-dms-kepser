import type { SupabaseClient } from '@supabase/supabase-js'
import { createDetailSchema } from '../schemas/master-data'
import type { DetailRow } from './shared'

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
