export const ROLE_NAMES = ['PEGAWAI', 'PPK', 'BENDAHARA', 'ARSIPARIS', 'ADMIN'] as const

export type RoleName = typeof ROLE_NAMES[number]

export const ROLES: { [K in RoleName]: K } = {
  PEGAWAI: 'PEGAWAI',
  PPK: 'PPK',
  BENDAHARA: 'BENDAHARA',
  ARSIPARIS: 'ARSIPARIS',
  ADMIN: 'ADMIN',
}

export const ROLE_DISPLAY: Record<RoleName, string> = {
  PEGAWAI: 'Pegawai',
  PPK: 'Pejabat Pembuat Komitmen',
  BENDAHARA: 'Bendahara',
  ARSIPARIS: 'Arsiparis',
  ADMIN: 'Administrator',
}

