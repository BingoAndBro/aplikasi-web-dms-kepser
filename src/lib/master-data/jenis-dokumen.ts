import type { SupabaseClient } from '@supabase/supabase-js'
import type { JenisDokumenRow } from './shared'

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
