export const ARCHIVE_STATUS_VALUES = [
  'AKTIF',
  'INAKTIF',
  'USUL_MUSNAH',
  'DIMUSNAHKAN',
] as const

export type StatusArsip = typeof ARCHIVE_STATUS_VALUES[number]

export const ARCHIVE_STATUS: { [K in StatusArsip]: K } = {
  AKTIF: 'AKTIF',
  INAKTIF: 'INAKTIF',
  USUL_MUSNAH: 'USUL_MUSNAH',
  DIMUSNAHKAN: 'DIMUSNAHKAN',
}

export const ARCHIVE_SOURCE_TYPE_VALUES = [
  'WORKFLOW',
  'MANUAL',
] as const

export type ArchiveSourceType = typeof ARCHIVE_SOURCE_TYPE_VALUES[number]

export const ARCHIVE_SOURCE_TYPE: { [K in ArchiveSourceType]: K } = {
  WORKFLOW: 'WORKFLOW',
  MANUAL: 'MANUAL',
}
