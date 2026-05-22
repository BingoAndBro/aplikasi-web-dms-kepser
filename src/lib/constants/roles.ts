export const ROLE_NAMES = ['PEGAWAI', 'PPK', 'BENDAHARA', 'KEPALA_SUB_BAGIAN_UMUM', 'ADMIN'] as const

export type RoleName = typeof ROLE_NAMES[number]

export const ROLES: { [K in RoleName]: K } = {
  PEGAWAI: 'PEGAWAI',
  PPK: 'PPK',
  BENDAHARA: 'BENDAHARA',
  KEPALA_SUB_BAGIAN_UMUM: 'KEPALA_SUB_BAGIAN_UMUM',
  ADMIN: 'ADMIN',
}

export const ROLE_DISPLAY: Record<RoleName, string> = {
  PEGAWAI: 'Pegawai',
  PPK: 'Pejabat Pembuat Komitmen',
  BENDAHARA: 'Bendahara',
  KEPALA_SUB_BAGIAN_UMUM: 'Kepala Sub Bagian Umum',
  ADMIN: 'Administrator',
}

