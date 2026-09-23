// Types untuk User Management (SPEC 06)

import type { RoleName } from './auth'

// User metadata dari auth.users.raw_user_meta_data
export interface UserMetadata {
  nama_lengkap?: string
  nip_nrp?: string
  departemen?: string
}

// User dengan roles — response type untuk API
export interface UserWithRoles {
  id: string
  username: string
  email: string | null
  metadata: UserMetadata
  roles: RoleName[]
  isActive: boolean
  disabledAt: string | null
  createdAt: string
  updatedAt?: string
  avatar_url?: string | null
  avatar_mime_type?: 'image/jpeg' | 'image/png' | 'image/webp' | null
  avatar_size_bytes?: number | null
  avatar_updated_at?: string | null
}

// Request types untuk API
export interface CreateUserRequest {
  username: string
  email?: string
  password: string
  nama_lengkap: string
  nip_nrp: string
  departemen?: string
  roles: RoleName[]
}

export interface UpdateUserRequest {
  username?: string
  email?: string
  nama_lengkap?: string
  nip_nrp?: string
  departemen?: string
  roles?: RoleName[]
}

export interface ResetPasswordRequest {
  password: string
}

// Response types
export interface UserListResponse {
  users: UserWithRoles[]
  total: number
}

export interface UserResponse {
  user: UserWithRoles
}

export interface UserProfileResponse {
  user: {
    id: string
    username: string
    email: string | null
    metadata: UserMetadata
    roles: RoleName[]
  }
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

// Validation schemas helpers
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Keep in sync with the auth_users_username_format_check CHECK constraint
// added in drizzle/0017_username_login_identity.sql. The "at least one
// letter" rule guarantees a username can never collide with the nip_nrp
// namespace (which is numeric-only, see isValidNip below), so login
// resolution by identifier never needs to disambiguate.
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-z0-9._-]{3,30}$/
  return usernameRegex.test(username) && /[a-z]/.test(username)
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8
}

export function isValidNip(nip: string): boolean {
  const nipRegex = /^\d{8,20}$/
  return nipRegex.test(nip)
}
