export type LampiranUrl = {
  kelengkapan_id: string
  nama: string
  url: string
  uploaded_at: string
}

export type DokumenRow = {
  id: string
  judul: string
  fungsi_id: string
  kegiatan_jenis_id: string
  is_ketua_tim: boolean
  status: string
  current_step: string | null
  revision_target: string | null
  revision_notes: string | null
  lampiran_urls: LampiranUrl[]
  tahun: number
  tanggal: string
  created_by: string
  nominal_realisasi: number | null
  is_non_material: boolean
  keterangan_detail: string | null
  created_at: string
  updated_at: string
  // Kondisi lampiran fisik -- TERPISAH dari `status`. Diisi lewat pembersihan
  // non-material oleh ketua tim, atau pemusnahan berkas oleh kasubag.
  lampiran_dibersihkan_at?: string | null
  lampiran_dibersihkan_alasan?: string | null
  // Chain fields (for Material)
  komponen_id?: string | null
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
  // Free-text name (for Non-Material)
  nama_dokumen?: string | null
  // Joined fields
  fungsi_nama?: string
  kegiatan_nama?: string
  komponen_nama?: string
  jenis_permintaan_nama?: string
  kategori_permintaan_nama?: string
  detail_permintaan_nama?: string
}

export type LogRow = {
  id: string
  dokumen_id: string
  user_id: string
  aksi: string
  catatan: string | null
  step_urutan: number | null
  timestamp: string
  // Joined
  user_nama?: string
}

export type KelengkapanRequired = {
  id: string
  nama_dokumen: string
  required: boolean
}

export type DokumenLaporanRow = DokumenRow & {
  pengaju_nama?: string
  pengaju_id?: string
  leaf_node_nama?: string
}
