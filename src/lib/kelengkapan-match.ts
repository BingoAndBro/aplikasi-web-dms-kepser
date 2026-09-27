// Client-safe: shared by the Ajukan checklist (KelengkapanChecklist), the
// Pegawai revisi page and the PPK resubmit page.
//
// A master_kelengkapan_dokumen row applies to exactly one six-column
// combination: kegiatan, is_ketua_tim, komponen, jenis, kategori, detail. An
// unselected level must match a NULL column — there is no inheritance from a
// parent level. The server enforces the same rule in SQL
// (buildRequiredKelengkapanCondition in local-submit-drizzle-adapter.ts), so
// the checklist the user sees is the list the server checks.

export type KelengkapanMatchRow = {
  kegiatan_id: string | null
  is_ketua_tim: boolean
  komponen_permintaan_id?: string | null
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
}

export type KelengkapanSelection = {
  kegiatanId: string | null | undefined
  isKetuaTim: boolean
  komponenId?: string | null
  jenisPermintaanId?: string | null
  kategoriPermintaanId?: string | null
  detailPermintaanId?: string | null
}

const orNull = (value: string | null | undefined) => value || null

export function matchesKelengkapanSelection(
  row: KelengkapanMatchRow,
  selection: KelengkapanSelection,
): boolean {
  return orNull(row.kegiatan_id) === orNull(selection.kegiatanId)
    && row.is_ketua_tim === selection.isKetuaTim
    && orNull(row.komponen_permintaan_id) === orNull(selection.komponenId)
    && orNull(row.jenis_permintaan_id) === orNull(selection.jenisPermintaanId)
    && orNull(row.kategori_permintaan_id) === orNull(selection.kategoriPermintaanId)
    && orNull(row.detail_permintaan_id) === orNull(selection.detailPermintaanId)
}

/** Selection of a stored dokumen_transaksi row (API snake_case shape). */
export function kelengkapanSelectionFromDokumen(dokumen: {
  kegiatan_jenis_id: string | null
  is_ketua_tim: boolean
  komponen_id?: string | null
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
}): KelengkapanSelection {
  return {
    kegiatanId: dokumen.kegiatan_jenis_id,
    isKetuaTim: dokumen.is_ketua_tim,
    komponenId: dokumen.komponen_id,
    jenisPermintaanId: dokumen.jenis_permintaan_id,
    kategoriPermintaanId: dokumen.kategori_permintaan_id,
    detailPermintaanId: dokumen.detail_permintaan_id,
  }
}
