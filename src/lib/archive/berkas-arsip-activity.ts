import { ARCHIVE_SOURCE_TYPE_VALUES, type ArchiveSourceType } from '#/lib/constants/archive-status'

export const BERKAS_ACTIVITY_EVENT_TYPES = [
  'BERKAS_DIBUKA',
  'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN',
  'DOKUMEN_MANUAL_DITAMBAHKAN',
  'BERKAS_DITUTUP',
  'METADATA_ARSIP_AKTIF_DIPERBARUI',
  'BERKAS_DIPINDAHKAN_KE_INAKTIF',
  'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH',
  'BERKAS_DIMUSNAHKAN',
] as const

export type BerkasActivityEventType = typeof BERKAS_ACTIVITY_EVENT_TYPES[number]

export const BERKAS_ACTIVITY_EVENT_LABELS: Record<BerkasActivityEventType, string> = {
  BERKAS_DIBUKA: 'Berkas dibuka',
  DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN: 'Dokumen Persetujuan diklasifikasikan',
  DOKUMEN_MANUAL_DITAMBAHKAN: 'Penambahan dokumen manual sukses',
  BERKAS_DITUTUP: 'Berkas ditutup',
  METADATA_ARSIP_AKTIF_DIPERBARUI: 'Metadata Tersimpan diperbarui',
  // RP-01: nilai enum dipertahankan (DB CHECK) tetapi event ini tak lagi ditulis runtime.
  BERKAS_DIPINDAHKAN_KE_INAKTIF: 'Berkas dipindahkan ke Inaktif (usang)',
  BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH: 'Berkas diusulkan untuk pembersihan',
  BERKAS_DIMUSNAHKAN: 'File berkas dibersihkan',
}

export function isBerkasActivityEventType(value: unknown): value is BerkasActivityEventType {
  return BERKAS_ACTIVITY_EVENT_TYPES.includes(value as BerkasActivityEventType)
}

export function isBerkasActivitySourceType(value: unknown): value is ArchiveSourceType {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
}

export function formatBerkasActivityEventLabel(eventType: BerkasActivityEventType): string {
  return BERKAS_ACTIVITY_EVENT_LABELS[eventType]
}
