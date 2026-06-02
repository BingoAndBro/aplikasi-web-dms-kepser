import type {
  ArchiveSourceType,
  BerkasArchiveStatus,
  BerkasStatus,
} from '#/lib/constants/archive-status'
import { formatDate } from '#/lib/utils/format'

export type BerkasLifecycleActionView = {
  action: 'mark_inactive' | 'propose_destruction' | 'approve_destruction'
  label: string
  confirmation: string
  successMessage: string
  confirmationPhrase?: string
}

export const BERKAS_DESTRUCTION_CONFIRMATION_PHRASE = 'MUSNAHKAN DATA FILE'

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
  if (statusBerkas === 'CLOSED' && !statusArsip) return 'Status arsip belum tersedia'
  if (statusArsip === 'AKTIF') return 'Aktif'
  if (statusArsip === 'INAKTIF') return 'Inaktif'
  if (statusArsip === 'USUL_MUSNAH') return 'Usul musnah'
  if (statusArsip === 'DIMUSNAHKAN') return 'Dimusnahkan'
  if (!statusArsip) return 'Belum final'

  return 'Status arsip tidak dikenal'
}

export function resolveBerkasLifecycleAction(
  statusBerkas: BerkasStatus | string | null | undefined,
  statusArsip: BerkasArchiveStatus | string | null | undefined,
): BerkasLifecycleActionView | null {
  if (statusBerkas !== 'CLOSED') return null

  if (statusArsip === 'AKTIF') {
    return {
      action: 'mark_inactive',
      label: 'Jadikan Inaktif',
      confirmation: 'Berkas akan dipindahkan ke status Inaktif. Dokumen tidak dihapus.',
      successMessage: 'Berkas berhasil dipindahkan ke status Inaktif.',
    }
  }

  if (statusArsip === 'INAKTIF') {
    return {
      action: 'propose_destruction',
      label: 'Usulkan Musnah',
      confirmation: 'Berkas akan masuk daftar Usul Musnah. Dokumen tidak dihapus.',
      successMessage: 'Berkas berhasil masuk daftar Usul Musnah.',
    }
  }

  if (statusArsip === 'USUL_MUSNAH') {
    return {
      action: 'approve_destruction',
      label: 'Musnahkan Data',
      confirmation: 'Status berkas akan menjadi Dimusnahkan. File fisik terkait berkas akan dihapus. Preview dan download file tidak akan tersedia setelah pemusnahan. Metadata berkas dan dokumen tetap tersimpan. Aksi ini tidak mudah dibalik.',
      confirmationPhrase: BERKAS_DESTRUCTION_CONFIRMATION_PHRASE,
      successMessage: 'Berkas berhasil dimusnahkan. File fisik terkait berkas dihapus jika ditemukan dan metadata tetap tersimpan.',
    }
  }

  return null
}

export function formatSourceTypeLabel(sourceType: ArchiveSourceType | string | null | undefined): string {
  if (sourceType === 'WORKFLOW') return 'Workflow'
  if (sourceType === 'MANUAL') return 'Manual'

  return 'Sumber tidak dikenal'
}

export function formatFolderWarningLabel(warning: string): string {
  if (warning === 'OPEN_STATUS_ARSIP_NULL') return 'Berkas terbuka dan belum final'
  if (warning === 'CLOSED_STATUS_ARSIP_UNKNOWN') return 'Berkas ditutup tetapi status arsip belum tersedia'

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

export function formatNullableDateLabel(value: string | null | undefined): string {
  return value ? formatDate(value) : '-'
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
