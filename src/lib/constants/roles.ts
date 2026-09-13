export const ROLE_NAMES = [
  'PEGAWAI',
  'PPK',
  'PPSPM',
  'KEPALA_SUB_BAGIAN_UMUM',
  'PENANGGUNG_JAWAB_KINERJA',
  'ADMIN',
] as const

export type RoleName = typeof ROLE_NAMES[number]

export const ROLES: { [K in RoleName]: K } = {
  PEGAWAI: 'PEGAWAI',
  PPK: 'PPK',
  PPSPM: 'PPSPM',
  KEPALA_SUB_BAGIAN_UMUM: 'KEPALA_SUB_BAGIAN_UMUM',
  PENANGGUNG_JAWAB_KINERJA: 'PENANGGUNG_JAWAB_KINERJA',
  ADMIN: 'ADMIN',
}

export const ROLE_DISPLAY: Record<RoleName, string> = {
  PEGAWAI: 'Pegawai',
  PPK: 'Pejabat Pembuat Komitmen',
  PPSPM: 'PPSPM',
  KEPALA_SUB_BAGIAN_UMUM: 'Kepala Sub Bagian Umum',
  PENANGGUNG_JAWAB_KINERJA: 'Penanggung Jawab Kinerja',
  ADMIN: 'Administrator',
}

