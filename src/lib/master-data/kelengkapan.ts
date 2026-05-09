import type { SupabaseClient } from '@supabase/supabase-js'
import { createKelengkapanSchema } from '../schemas/master-data'
import type { KelengkapanRow } from './shared'

type KelengkapanChainPayload = {
  jenisPermintaanId?: string | null
  kategoriPermintaanId?: string | null
  detailPermintaanId?: string | null
}

async function validateKelengkapanChain(
  supabase: SupabaseClient,
  payload: KelengkapanChainPayload
): Promise<string | undefined> {
  const jenisPermintaanId = payload.jenisPermintaanId ?? null
  const kategoriPermintaanId = payload.kategoriPermintaanId ?? null
  const detailPermintaanId = payload.detailPermintaanId ?? null

  if (detailPermintaanId && !kategoriPermintaanId) {
    return 'Detail permintaan harus memiliki kategori permintaan'
  }

  if (kategoriPermintaanId && !jenisPermintaanId) {
    return 'Kategori permintaan harus memiliki jenis permintaan'
  }

  if (kategoriPermintaanId) {
    const { data, error } = await supabase
      .from('master_kategori_permintaan')
      .select('jenis_permintaan_id')
      .eq('id', kategoriPermintaanId)
      .single()

    if (error || !data) {
      return 'Kategori permintaan tidak ditemukan'
    }

    if (data.jenis_permintaan_id !== jenisPermintaanId) {
      return 'Kategori permintaan tidak sesuai dengan jenis permintaan'
    }
  }

  if (detailPermintaanId) {
    const { data, error } = await supabase
      .from('master_detail_permintaan')
      .select('kategori_permintaan_id')
      .eq('id', detailPermintaanId)
      .single()

    if (error || !data) {
      return 'Detail permintaan tidak ditemukan'
    }

    if (data.kategori_permintaan_id !== kategoriPermintaanId) {
      return 'Detail permintaan tidak sesuai dengan kategori permintaan'
    }
  }

  return undefined
}

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

export async function createKelengkapan(
  supabase: SupabaseClient,
  payload: { kegiatanId: string; isKetuaTim: boolean; namaDokumen: string; required: boolean; jenisPermintaanId?: string; kategoriPermintaanId?: string; detailPermintaanId?: string }
): Promise<{ data?: KelengkapanRow; error?: string }> {
  const parsed = createKelengkapanSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.flatten().formErrors.join(', ') }
  }

  const chainError = await validateKelengkapanChain(supabase, parsed.data)
  if (chainError) return { error: chainError }

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
  const { data: existing, error: existingError } = await supabase
    .from('master_kelengkapan_dokumen')
    .select('jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id')
    .eq('id', id)
    .single()

  if (existingError || !existing) return { error: 'Kelengkapan tidak ditemukan' }

  const chainError = await validateKelengkapanChain(supabase, {
    jenisPermintaanId: payload.jenisPermintaanId !== undefined
      ? payload.jenisPermintaanId
      : existing.jenis_permintaan_id,
    kategoriPermintaanId: payload.kategoriPermintaanId !== undefined
      ? payload.kategoriPermintaanId
      : existing.kategori_permintaan_id,
    detailPermintaanId: payload.detailPermintaanId !== undefined
      ? payload.detailPermintaanId
      : existing.detail_permintaan_id,
  })
  if (chainError) return { error: chainError }

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
