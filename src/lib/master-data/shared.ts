import type { MasterFungsi } from '../db/schema'

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
  jumlah_komponen?: number
}

export type KomponenRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  kegiatan_id: string
  kegiatan_nama?: string
  jumlah_jenis?: number
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
  komponen_permintaan_id?: string | null
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
}

export type JenisRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  komponen_id: string
  komponen_nama?: string
  jumlah_kategori?: number
}

export type KategoriRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  jenis_permintaan_id: string
  jenis_nama?: string
  jumlah_detail?: number
}

export type DetailRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
  kategori_permintaan_id: string
  kategori_nama?: string
  jenis_nama?: string
}

export type JenisDokumenRow = {
  id: string
  nama: string
  deskripsi: string | null
  is_active: boolean
  created_at: string
}
