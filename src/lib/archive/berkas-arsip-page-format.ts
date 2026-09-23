import type {
  ArchiveSourceType,
  BerkasArchiveStatus,
  BerkasStatus,
} from '#/lib/constants/archive-status'
import { formatDate, formatDateTime } from '#/lib/utils/format'

export type BerkasLifecycleActionView = {
  action: 'propose_destruction' | 'cancel_proposal' | 'approve_destruction'
  label: string
  confirmation: string
  successMessage: string
  confirmationPhrase?: string
}

export const BERKAS_DESTRUCTION_CONFIRMATION_PHRASE = 'BERSIHKAN FILE BERKAS'

export function formatBerkasStatusLabel(status: BerkasStatus | string | null | undefined): string {
  if (status === 'OPEN') return 'Berkas terbuka'
  if (status === 'CLOSED') return 'Berkas ditutup'

  return 'Status berkas tidak dikenal'
}

export function formatBerkasArchiveStatusLabel(
  statusArsip: BerkasArchiveStatus | string | null | undefined,
  statusBerkas?: BerkasStatus | string | null,
): string {
  if (statusBerkas === 'OPEN' && !statusArsip) return 'Belum final'
  if (statusBerkas === 'CLOSED' && !statusArsip) return 'Status belum tersedia'
  // RP-01 label: Tersimpan / Usul Pembersihan / File Dibersihkan; INAKTIF dibuang dari alur.
  if (statusArsip === 'AKTIF') return 'Tersimpan'
  if (statusArsip === 'USUL_MUSNAH') return 'Usul Pembersihan'
  if (statusArsip === 'DIMUSNAHKAN') return 'File Dibersihkan'
  if (!statusArsip) return 'Belum final'

  return 'Status tidak dikenal'
}

/**
 * RP-01: aksi lifecycle primer per status arsip berkas tertutup.
 * - AKTIF        -> "Usulkan Pembersihan" (propose_destruction)
 * - USUL_MUSNAH  -> "Bersihkan File" (approve_destruction, konfirmasi ketik-persis)
 * Aksi sekunder ("Batalkan Usulan") diambil dari `resolveSecondaryBerkasLifecycleAction`.
 */
export function resolveBerkasLifecycleAction(
  statusBerkas: BerkasStatus | string | null | undefined,
  statusArsip: BerkasArchiveStatus | string | null | undefined,
): BerkasLifecycleActionView | null {
  if (statusBerkas !== 'CLOSED') return null

  if (statusArsip === 'AKTIF') {
    return {
      action: 'propose_destruction',
      label: 'Usulkan Pembersihan',
      confirmation: 'Berkas akan masuk daftar Usul Pembersihan. Dokumen tidak dihapus.',
      successMessage: 'Berkas berhasil masuk daftar Usul Pembersihan.',
    }
  }

  if (statusArsip === 'USUL_MUSNAH') {
    return {
      action: 'approve_destruction',
      label: 'Bersihkan File',
      confirmation: 'Status berkas akan menjadi File Dibersihkan. File fisik terkait berkas akan dihapus. Preview dan download file tidak akan tersedia setelah pembersihan. Metadata berkas dan dokumen tetap tersimpan. Aksi ini tidak mudah dibalik.',
      confirmationPhrase: BERKAS_DESTRUCTION_CONFIRMATION_PHRASE,
      successMessage: 'File berkas berhasil dibersihkan. File fisik terkait berkas dihapus jika ditemukan dan metadata tetap tersimpan.',
    }
  }

  return null
}

/**
 * RP-01: aksi lifecycle sekunder — hanya "Batalkan Usulan" untuk berkas
 * berstatus USUL_MUSNAH (kembali ke Tersimpan). Tanpa konfirmasi ketik-persis.
 */
export function resolveSecondaryBerkasLifecycleAction(
  statusBerkas: BerkasStatus | string | null | undefined,
  statusArsip: BerkasArchiveStatus | string | null | undefined,
): BerkasLifecycleActionView | null {
  if (statusBerkas !== 'CLOSED') return null
  if (statusArsip !== 'USUL_MUSNAH') return null

  return {
    action: 'cancel_proposal',
    label: 'Batalkan Usulan',
    confirmation: 'Berkas kembali ke status Tersimpan. Tidak ada file yang dihapus.',
    successMessage: 'Usulan pembersihan dibatalkan.',
  }
}

export function formatSourceTypeLabel(sourceType: ArchiveSourceType | string | null | undefined): string {
  if (sourceType === 'WORKFLOW') return 'Persetujuan'
  if (sourceType === 'MANUAL') return 'Manual'

  return 'Sumber tidak dikenal'
}

export function formatFolderWarningLabel(warning: string): string {
  if (warning === 'OPEN_STATUS_ARSIP_NULL') return 'Berkas terbuka dan belum final'
  if (warning === 'CLOSED_STATUS_ARSIP_UNKNOWN') return 'Berkas ditutup tetapi status belum tersedia'

  return 'Status transisi perlu ditinjau'
}

export function formatItemWarningLabel(warning: string): string {
  if (warning === 'SOURCE_NOT_FOUND') return 'Data sumber tidak ditemukan'
  if (warning === 'UNKNOWN_SOURCE_TYPE') return 'Jenis sumber tidak dikenal'
  if (warning === 'ATTACHMENT_METADATA_UNAVAILABLE') return 'Metadata lampiran belum tersedia'

  return 'Data item perlu ditinjau'
}

export function formatKlasifikasiLabel(kode: string | null, nama: string | null): string {
  if (kode && nama) return `${kode} - ${nama}`
  return kode ?? nama ?? '-'
}

export function formatBerkasLabel(
  kode: string | null,
  nama: string | null,
  tahunAnggaran: number,
): string {
  return `${formatKlasifikasiLabel(kode, nama)} · TA ${tahunAnggaran}`
}

export function formatNullableDateLabel(value: string | null | undefined): string {
  return value ? formatDate(value) : '-'
}

export function formatNullableDateTimeLabel(value: string | null | undefined): string {
  return value ? formatDateTime(value) : '-'
}

export function formatNominalRupiah(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'

  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return '-'

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(numericValue)
}

export function formatAttachmentCount(value: number | null | undefined): string {
  if (typeof value !== 'number') return '-'

  return String(value)
}

export function snippet(value: string | null | undefined, maxLength = 140): string {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!normalized) return '-'
  if (normalized.length <= maxLength) return normalized

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}
