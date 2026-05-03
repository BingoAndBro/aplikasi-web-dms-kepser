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
  email: string
  metadata: UserMetadata
  roles: RoleName[]
  isActive: boolean
  disabledAt: string | null
  createdAt: string
  updatedAt?: string
}

// Request types untuk API
export interface CreateUserRequest {
  email: string
  password: string
  nama_lengkap: string
  nip_nrp: string
  departemen?: string
  roles: RoleName[]
}

export interface UpdateUserRequest {
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
    email: string
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

export function isValidPassword(password: string): boolean {
  return password.length >= 8
}

export function isValidNip(nip: string): boolean {
  const nipRegex = /^\d{8,20}$/
  return nipRegex.test(nip)
}
