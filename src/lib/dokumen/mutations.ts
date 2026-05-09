import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDokumenWithNames } from './parse'
import type { DokumenRow, LampiranUrl } from './types'

/**
 * Create a new DRAFT dokumen.
 */
export async function createDokumen(
  supabase: SupabaseClient,
  payload: {
    judul: string
    fungsiId: string
    kegiatanJenisId: string
    isKetuaTim: boolean
    tahun: number
    tanggal: string
    lampiranUrls: LampiranUrl[]
    createdBy: string
    nominalRealisasi?: number | null
    isNonMaterial?: boolean
    jenisDokumenId?: string
    keteranganDetail?: string
    jenisPermintaanId?: string
    kategoriPermintaanId?: string
    detailPermintaanId?: string
  }
): Promise<{ data?: DokumenRow; error?: string }> {
  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .insert({
      judul: payload.judul,
      fungsi_id: payload.fungsiId,
      kegiatan_jenis_id: payload.kegiatanJenisId,
      is_ketua_tim: payload.isKetuaTim,
      tahun: payload.tahun,
      tanggal: payload.tanggal,
      lampiran_urls: JSON.stringify(payload.lampiranUrls),
      created_by: payload.createdBy,
      status: 'DRAFT',
      nominal_realisasi: payload.nominalRealisasi ?? 0,
      is_non_material: payload.isNonMaterial ?? false,
      jenis_dokumen_id: payload.jenisDokumenId ?? null,
      keterangan_detail: payload.keteranganDetail ?? null,
      jenis_permintaan_id: payload.jenisPermintaanId ?? null,
      kategori_permintaan_id: payload.kategoriPermintaanId ?? null,
      detail_permintaan_id: payload.detailPermintaanId ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[dokumen-helpers] createDokumen error:', error)
    return { error: 'Gagal membuat dokumen' }
  }

  // Manual join for response
  const fungsiMap: Record<string, string> = {}
  const kegMap: Record<string, string> = {}
  const { data: fns } = await supabase.from('master_fungsi').select('id, nama').eq('id', payload.fungsiId).single()
  if (fns) fungsiMap[payload.fungsiId] = fns.nama
  const { data: keg } = await supabase.from('master_kegiatan').select('id, nama').eq('id', payload.kegiatanJenisId).single()
  if (keg) kegMap[payload.kegiatanJenisId] = keg.nama

  return { data: parseDokumenWithNames(data, fungsiMap, kegMap) }
}

/**
 * Update lampiran_urls and/or metadata on a dokumen.
 */
export async function updateDokumen(
  supabase: SupabaseClient,
  id: string,
  payload: {
    lampiranUrls?: LampiranUrl[]
    judul?: string
    tahun?: number
    fungsiId?: string
    kegiatanId?: string
    tanggal?: string
    nominalRealisasi?: number | null
    isNonMaterial?: boolean
    keteranganDetail?: string | null
  }
): Promise<{ data?: DokumenRow; error?: string }> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  if (payload.lampiranUrls !== undefined) {
    updates.lampiran_urls = JSON.stringify(payload.lampiranUrls)
  }
  if (payload.judul !== undefined) {
    updates.judul = payload.judul
  }
  if (payload.tahun !== undefined) {
    updates.tahun = payload.tahun
  }
  if (payload.fungsiId !== undefined) {
    updates.fungsi_id = payload.fungsiId
  }
  if (payload.kegiatanId !== undefined) {
    updates.kegiatan_jenis_id = payload.kegiatanId
  }
  if (payload.tanggal !== undefined) {
    updates.tanggal = payload.tanggal
  }
  if (payload.nominalRealisasi !== undefined) {
    updates.nominal_realisasi = payload.nominalRealisasi
  }
  if (payload.isNonMaterial !== undefined) {
    updates.is_non_material = payload.isNonMaterial
  }
  if (payload.keteranganDetail !== undefined) {
    updates.keterangan_detail = payload.keteranganDetail
  }

  const { data, error } = await supabase
    .from('dokumen_transaksi')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[dokumen-helpers] updateDokumen error:', error)
    return { error: 'Gagal memperbarui dokumen' }
  }

  // Manual join for response
  const fungsiMap: Record<string, string> = {}
  const kegMap: Record<string, string> = {}
  if (data.fungsi_id) {
    const { data: fns } = await supabase.from('master_fungsi').select('id, nama').eq('id', data.fungsi_id).single()
    if (fns) fungsiMap[data.fungsi_id] = fns.nama
  }
  if (data.kegiatan_jenis_id) {
    const { data: keg } = await supabase.from('master_kegiatan').select('id, nama').eq('id', data.kegiatan_jenis_id).single()
    if (keg) kegMap[data.kegiatan_jenis_id] = keg.nama
  }

  return { data: parseDokumenWithNames(data, fungsiMap, kegMap) }
}

/**
 * Update dokumen status fields after FSM transition.
 * Returns the updated fields without re-fetching (avoids FK join issues).
 */
export async function updateDokumenStatus(
  supabase: SupabaseClient,
  id: string,
  payload: {
    status: string
    currentStep: string | null
    revisionTarget: string | null
    revisionNotes?: string
  }
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('dokumen_transaksi')
    .update({
      status: payload.status,
      current_step: payload.currentStep,
      revision_target: payload.revisionTarget,
      revision_notes: payload.revisionNotes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('[dokumen-helpers] updateDokumenStatus error:', error)
    return { error: 'Gagal memperbarui status dokumen' }
  }

  return {}
}
