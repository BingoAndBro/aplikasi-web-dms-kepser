// Role enum — hardcoded untuk MVP

export const ROLE_NAMES = ['PEGAWAI', 'PPK', 'BENDAHARA', 'ARSIPARIS', 'ADMIN'] as const

export type RoleName = typeof ROLE_NAMES[number]

// Extend Supabase User type
export interface AppUser {
  id: string
  email: string
  userName?: string // dari user_metadata
  createdAt: string
}

// App session — Supabase session + app-specific data
export interface AppSession {
  user: AppUser
  // roles adalah semua role yang dimiliki user
  roles: RoleName[]
  // activeRole adalah role yang sedang aktif (dari cookie)
  activeRole: RoleName
  // primaryRole adalah role default
  primaryRole: RoleName
}

// Role display labels untuk UI
export const ROLE_DISPLAY: Record<RoleName, string> = {
  PEGAWAI: 'Pegawai',
  PPK: 'Pejabat Pembuat Komitmen',
  BENDAHARA: 'Bendahara',
  ARSIPARIS: 'Arsiparis',
  ADMIN: 'Administrator',
}
