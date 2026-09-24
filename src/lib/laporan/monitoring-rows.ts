export type LaporanKinerjaRow = {
  id: string
  judul: string
  status: 'COMPLETED' | 'TERSIMPAN'
  fungsi_nama: string | null
  kegiatan_nama: string | null
  komponen_id: string | null
  komponen_nama: string | null
  tahun: number
  tanggal: string
  pengaju_id: string | null
  pengaju_nama: string
  created_at: string
  updated_at: string
  nominal_realisasi: number | null
  is_diberkaskan: boolean
}

export type SortMode = 'updated_desc' | 'nominal_desc' | 'documents_desc' | 'name_asc'

export type FungsiRow = {
  id: string
  nama: string
  dokumen: LaporanKinerjaRow[]
  kegiatan: KegiatanRow[]
  totalNominal: number
  latestDate: string | null
}

export type PegawaiRow = {
  id: string
  nama: string
  dokumen: LaporanKinerjaRow[]
  fungsi: FungsiRow[]
  totalNominal: number
  latestDate: string | null
}

export type KegiatanRow = {
  id: string
  fungsiId: string
  nama: string
  fungsiNama: string
  dokumen: LaporanKinerjaRow[]
  komponen: KomponenRow[]
  totalNominal: number
  latestDate: string | null
}

export type KomponenRow = {
  id: string
  kegiatanId: string
  fungsiId: string
  nama: string
  kegiatanNama: string
  fungsiNama: string
  dokumen: LaporanKinerjaRow[]
  totalNominal: number
  latestDate: string | null
}

export function buildFungsiRows(documents: LaporanKinerjaRow[], keyPrefix = 'fungsi'): FungsiRow[] {
  const groups = new Map<string, LaporanKinerjaRow[]>()

  for (const row of documents) {
    const fungsiName = displayName(row.fungsi_nama, 'Tanpa Fungsi')
    const key = stableKey(keyPrefix, fungsiName)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return Array.from(groups, ([id, rows]) => {
    const nama = displayName(rows[0]?.fungsi_nama, 'Tanpa Fungsi')
    const kegiatan = buildKegiatanRows(id, nama, rows)

    return {
      id,
      nama,
      dokumen: rows,
      kegiatan,
      totalNominal: totalNominal(rows),
      latestDate: latestDate(rows),
    }
  })
}

export function buildPegawaiRows(documents: LaporanKinerjaRow[]): PegawaiRow[] {
  const groups = new Map<string, LaporanKinerjaRow[]>()

  for (const row of documents) {
    const key = stableKey('pegawai', pegawaiIdentity(row))
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return Array.from(groups, ([id, rows]) => ({
    id,
    nama: displayName(rows[0]?.pengaju_nama, 'Tanpa Pengaju'),
    dokumen: rows,
    fungsi: buildFungsiRows(rows, `${id}-fungsi`),
    totalNominal: totalNominal(rows),
    latestDate: latestDate(rows),
  }))
}

export function buildKegiatanRows(fungsiId: string, fungsiNama: string, documents: LaporanKinerjaRow[]): KegiatanRow[] {
  const groups = new Map<string, LaporanKinerjaRow[]>()

  for (const row of documents) {
    const kegiatanName = displayName(row.kegiatan_nama, 'Tanpa Kegiatan')
    const key = stableKey(`${fungsiId}-kegiatan`, kegiatanName)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return Array.from(groups, ([id, rows]) => {
    const nama = displayName(rows[0]?.kegiatan_nama, 'Tanpa Kegiatan')

    return {
      id,
      fungsiId,
      nama,
      fungsiNama,
      dokumen: rows,
      komponen: buildKomponenRows(fungsiId, id, nama, fungsiNama, rows),
      totalNominal: totalNominal(rows),
      latestDate: latestDate(rows),
    }
  }).sort((a, b) => compareNamedRows(a, b, 'updated_desc'))
}

export function buildKomponenRows(
  fungsiId: string,
  kegiatanId: string,
  kegiatanNama: string,
  fungsiNama: string,
  documents: LaporanKinerjaRow[],
): KomponenRow[] {
  const groups = new Map<string, LaporanKinerjaRow[]>()

  for (const row of documents) {
    const komponenName = displayName(row.komponen_nama, 'Tanpa Komponen')
    const key = stableKey(`${kegiatanId}-komponen`, komponenName)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return Array.from(groups, ([id, rows]) => ({
    id,
    kegiatanId,
    fungsiId,
    nama: displayName(rows[0]?.komponen_nama, 'Tanpa Komponen'),
    kegiatanNama,
    fungsiNama,
    dokumen: rows,
    totalNominal: totalNominal(rows),
    latestDate: latestDate(rows),
  })).sort((a, b) => compareNamedRows(a, b, 'updated_desc'))
}

function pegawaiIdentity(row: LaporanKinerjaRow) {
  return row.pengaju_id?.trim() || row.pengaju_nama.trim() || 'unknown'
}

export function countKegiatan(fungsi: FungsiRow[]) {
  return fungsi.reduce((total, row) => total + row.kegiatan.length, 0)
}

export function compareNamedRows(
  a: { nama: string; dokumen: LaporanKinerjaRow[]; totalNominal: number; latestDate: string | null },
  b: { nama: string; dokumen: LaporanKinerjaRow[]; totalNominal: number; latestDate: string | null },
  sortBy: SortMode,
) {
  if (sortBy === 'name_asc') return a.nama.localeCompare(b.nama, 'id-ID')
  if (sortBy === 'documents_desc') return b.dokumen.length - a.dokumen.length
  if (sortBy === 'nominal_desc') return b.totalNominal - a.totalNominal
  return dateValue(b.latestDate) - dateValue(a.latestDate)
}

export function totalNominal(rows: LaporanKinerjaRow[]) {
  return rows.reduce((total, row) => {
    if (row.nominal_realisasi === null) return total
    return total + row.nominal_realisasi
  }, 0)
}

function latestDate(rows: LaporanKinerjaRow[]) {
  return rows.reduce<string | null>((latest, row) => {
    const value = row.updated_at || row.tanggal
    if (!value) return latest
    if (!latest) return value
    return dateValue(value) > dateValue(latest) ? value : latest
  }, null)
}

function stableKey(prefix: string, value: string) {
  return `${prefix}-${value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') || 'unknown'}`
}

export function dateValue(value?: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function displayName(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed || fallback
}
