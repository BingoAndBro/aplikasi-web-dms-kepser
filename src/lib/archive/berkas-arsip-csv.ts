import {
  formatAttachmentCount,
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatItemWarningLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
  formatSourceTypeLabel,
  snippet,
} from '#/lib/archive/berkas-arsip-page-format'

export const BERKAS_FOLDER_LIST_CSV_FILENAME = 'daftar-berkas-terbuka.csv'
// RP-01: `/kasubag/inaktif` dihapus & `/kasubag/usul-musnah` -> `/kasubag/pembersihan`.
// Nama file lama dibuang; halaman Berkas Tertutup + Pembersihan Berkas memakai ini.
export const BERKAS_TERTUTUP_LIST_CSV_FILENAME = 'daftar-berkas-tertutup.csv'
export const BERKAS_PEMBERSIHAN_LIST_CSV_FILENAME = 'daftar-pembersihan-berkas.csv'
export const BERKAS_DETAIL_ITEMS_CSV_FILENAME = 'daftar-dokumen-berkas.csv'

type CsvCell = string | number | boolean | null | undefined

export type BerkasFolderCsvRow = {
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string
  status_berkas: string
  status_arsip: string | null
  nomor_spm: string | null
  closed_at: string | null
  item_count: number
  workflow_item_count: number
  manual_item_count: number
  total_nominal_realisasi: number | null
  umur_berkas?: number | null
  updated_at: string | null
}

export type BerkasFolderCsvSection = {
  label: 'Berkas Terbuka' | 'Berkas Tertutup' | 'Usulan Pembersihan' | 'Sudah Dibersihkan' | string
  folders: readonly BerkasFolderCsvRow[]
}

export type BerkasDetailItemCsvRow = {
  source_type: string
  source_title: string
  source_date: string | null
  source_nominal_realisasi: number | null
  source_created_by_display_name: string | null
  attachment_count: number | null
  workflow: {
    status: string | null
    fungsi_nama: string | null
    kegiatan_nama: string | null
  } | null
  manual: {
    komponen_name: string | null
    keterangan: string | null
  } | null
  warnings: string[]
}

const FOLDER_LIST_HEADERS = [
  'No',
  'Kategori / Section',
  'Cara Pembayaran',
  'Status Berkas',
  'Status',
  'Umur Berkas',
  'Jumlah Dokumen',
  'Dokumen Workflow',
  'Dokumen Manual',
  'Total Nominal',
  'Nomor SPM',
  'Tanggal Ditutup',
  'Terakhir Diperbarui',
] as const

const DETAIL_ITEM_HEADERS = [
  'No',
  'Sumber',
  'Nama Dokumen',
  'Tanggal Dokumen',
  'Dibuat Oleh',
  'Nominal',
  'Jumlah Lampiran',
  'Keterangan / Provenance',
  'Catatan',
] as const

export function createBerkasFolderListCsv(sections: readonly BerkasFolderCsvSection[]): string {
  let rowNumber = 0
  const rows = sections.flatMap((section) => section.folders.map((folder) => {
    rowNumber += 1

    return [
      rowNumber,
      safeCsvText(section.label),
      safeCsvText(formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)),
      safeCsvText(formatBerkasStatusLabel(folder.status_berkas)),
      safeCsvText(formatBerkasArchiveStatusLabel(folder.status_arsip, folder.status_berkas)),
      folder.umur_berkas === null || folder.umur_berkas === undefined ? '-' : `${folder.umur_berkas} hari`,
      folder.item_count,
      folder.workflow_item_count,
      folder.manual_item_count,
      formatOptionalNominal(folder.total_nominal_realisasi),
      safeCsvText(folder.nomor_spm),
      formatOptionalDate(folder.closed_at),
      formatOptionalDate(folder.updated_at),
    ]
  }))

  return buildSafeCsv([FOLDER_LIST_HEADERS, ...rows])
}

export function createBerkasDetailItemsCsv(items: readonly BerkasDetailItemCsvRow[]): string {
  const rows = items.map((item, index) => [
    index + 1,
    safeCsvText(formatSourceTypeLabel(item.source_type)),
    safeCsvText(item.source_title, 'Dokumen tidak tersedia'),
    formatOptionalDate(item.source_date),
    safeCsvText(item.source_created_by_display_name),
    formatOptionalNominal(item.source_nominal_realisasi),
    typeof item.attachment_count === 'number' ? formatAttachmentCount(item.attachment_count) : '',
    safeCsvText(formatItemProvenance(item)),
    safeCsvText(item.warnings.map(formatItemWarningLabel).join('; ')),
  ])

  return buildSafeCsv([DETAIL_ITEM_HEADERS, ...rows])
}

export function buildSafeCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`
}

export function escapeCsvCell(value: CsvCell): string {
  const text = value === null || value === undefined ? '' : String(value)
  const neutralized = neutralizeSpreadsheetFormula(text)

  return /[",\r\n]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized
}

export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function neutralizeSpreadsheetFormula(value: string): string {
  const withoutBom = value.replace(/^\uFEFF/, '')
  const startsWithFormula = /^[=+\-@\t\r\n]/.test(withoutBom) || /^ +[=+\-@]/.test(withoutBom)

  return startsWithFormula ? `'${value}` : value
}

function formatItemProvenance(item: BerkasDetailItemCsvRow): string {
  if (item.workflow) {
    return [
      item.workflow.status ? `Status: ${item.workflow.status}` : null,
      item.workflow.fungsi_nama ? `Fungsi: ${item.workflow.fungsi_nama}` : null,
      item.workflow.kegiatan_nama ? `Kegiatan: ${item.workflow.kegiatan_nama}` : null,
    ].filter((part): part is string => Boolean(part)).join('; ')
  }

  if (item.manual) {
    return [
      item.manual.komponen_name ? `Komponen: ${item.manual.komponen_name}` : null,
      item.manual.keterangan ? `Keterangan: ${snippet(item.manual.keterangan)}` : null,
    ].filter((part): part is string => Boolean(part)).join('; ')
  }

  return ''
}

function formatOptionalDate(value: string | null | undefined): string {
  return value ? safeCsvText(formatNullableDateLabel(value)) : ''
}

function formatOptionalNominal(value: number | null | undefined): string {
  return typeof value === 'number' ? safeCsvText(formatNominalRupiah(value)) : ''
}

function safeCsvText(value: string | null | undefined, fallback = ''): string {
  const trimmed = trimToNull(value)
  if (!trimmed) return fallback

  return hasDisallowedCsvText(trimmed) ? fallback : trimmed
}

function hasDisallowedCsvText(value: string): boolean {
  const lower = value.toLowerCase()

  return /^[a-z]:[\\/]/i.test(value)
    || lower.includes('://')
    || value.includes('\\')
    || lower.includes('/storage/')
    || lower.includes('logical_path')
    || lower.includes('logicalpath')
    || lower.includes('physical_path')
    || lower.includes('physicalpath')
    || lower.includes('signed_url')
    || lower.includes('signedurl')
    || lower.includes('storage root')
    || lower.includes('storage_root')
    || lower.includes('token')
    || lower.includes('database_url')
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}
