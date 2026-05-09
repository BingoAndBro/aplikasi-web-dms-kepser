import type { RoleName } from '../constants/roles'

export { ROLE_DISPLAY, ROLE_NAMES, ROLES } from '../constants/roles'
export type { RoleName } from '../constants/roles'

// Extend Supabase User type
export interface AppUser {
  id: string
  email: string
  userName?: string // dari user_metadata
  createdAt: string
}

// App session - Supabase session + app-specific data
export interface AppSession {
  user: AppUser
  // roles adalah semua role yang dimiliki user
  roles: RoleName[]
  // activeRole adalah role yang sedang aktif (dari cookie)
  activeRole: RoleName
  // primaryRole adalah role default
  primaryRole: RoleName
}

