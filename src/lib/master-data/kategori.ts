import type { SupabaseClient } from '@supabase/supabase-js'
import { createKategoriSchema } from '../schemas/master-data'
import type { KategoriRow } from './shared'

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
