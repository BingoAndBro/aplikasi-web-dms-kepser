import type { DokumenRow, LampiranUrl } from './types'
import { lampiranUrlsSchema } from '../schemas/dokumen'

export function parseLampiranUrls(rawLampiranUrls: unknown): LampiranUrl[] {
  let rawValue = rawLampiranUrls

  if (typeof rawLampiranUrls === 'string') {
    try {
      rawValue = JSON.parse(rawLampiranUrls)
    } catch {
      return []
    }
  }

  const parsed = lampiranUrlsSchema.safeParse(rawValue)
  return parsed.success ? parsed.data : []
}

export function parseDokumen(raw: any): DokumenRow {
  return {
    id: raw.id,
    judul: raw.judul,
    fungsi_id: raw.fungsi_id,
    kegiatan_jenis_id: raw.kegiatan_jenis_id,
    is_ketua_tim: raw.is_ketua_tim,
    status: raw.status,
    current_step: raw.current_step,
    revision_target: raw.revision_target,
    revision_notes: raw.revision_notes,
    lampiran_urls: parseLampiranUrls(raw.lampiran_urls),
    tahun: raw.tahun,
    tanggal: raw.tanggal,
    created_by: raw.created_by,
    nominal_realisasi: raw.nominal_realisasi ?? null,
    is_non_material: raw.is_non_material ?? false,
    keterangan_detail: raw.keterangan_detail ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    lampiran_dibersihkan_at: raw.lampiran_dibersihkan_at ?? null,
    lampiran_dibersihkan_alasan: raw.lampiran_dibersihkan_alasan ?? null,
    fungsi_nama: raw.fungsi_nama,
    kegiatan_nama: raw.kegiatan_nama,
    komponen_id: raw.komponen_id ?? null,
    komponen_nama: raw.komponen_nama,
    nama_dokumen: raw.nama_dokumen ?? null,
    jenis_permintaan_id: raw.jenis_permintaan_id,
    kategori_permintaan_id: raw.kategori_permintaan_id,
    detail_permintaan_id: raw.detail_permintaan_id,
    jenis_permintaan_nama: raw.jenis_permintaan_nama,
    kategori_permintaan_nama: raw.kategori_permintaan_nama,
    detail_permintaan_nama: raw.detail_permintaan_nama,
  }
}

export function parseDokumenWithNames(
  raw: any,
  fungsiMap: Record<string, string>,
  kegMap: Record<string, string>
): DokumenRow {
  return {
    id: raw.id,
    judul: raw.judul,
    fungsi_id: raw.fungsi_id,
    kegiatan_jenis_id: raw.kegiatan_jenis_id,
    is_ketua_tim: raw.is_ketua_tim,
    status: raw.status,
    current_step: raw.current_step,
    revision_target: raw.revision_target,
    revision_notes: raw.revision_notes,
    lampiran_urls: parseLampiranUrls(raw.lampiran_urls),
    tahun: raw.tahun,
    tanggal: raw.tanggal,
    created_by: raw.created_by,
    nominal_realisasi: raw.nominal_realisasi ?? null,
    is_non_material: raw.is_non_material ?? false,
    keterangan_detail: raw.keterangan_detail ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    lampiran_dibersihkan_at: raw.lampiran_dibersihkan_at ?? null,
    lampiran_dibersihkan_alasan: raw.lampiran_dibersihkan_alasan ?? null,
    fungsi_nama: fungsiMap[raw.fungsi_id] ?? raw.fungsi_nama ?? undefined,
    kegiatan_nama: kegMap[raw.kegiatan_jenis_id] ?? raw.kegiatan_nama ?? undefined,
    komponen_id: raw.komponen_id ?? null,
    komponen_nama: raw.komponen_nama,
    nama_dokumen: raw.nama_dokumen ?? null,
  }
}
