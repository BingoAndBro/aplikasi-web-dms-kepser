import { z } from 'zod'
import { ROLE_NAMES } from '../constants/roles'

// Login
export const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})
export type LoginInput = z.infer<typeof loginSchema>

// Role switch
export const roleSwitchSchema = z.object({
  activeRole: z.enum(ROLE_NAMES),
})
export type RoleSwitchInput = z.infer<typeof roleSwitchSchema>

export const roleSchema = z.enum(ROLE_NAMES)
export const roleArraySchema = z.array(roleSchema)

// Session response
export const sessionResponseSchema = z.object({
  session: z.object({
    userId: z.string(),
    email: z.string(),
    userName: z.string().optional(),
  }).nullable(),
  roles: roleArraySchema,
  activeRole: z.string().nullable(),
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>
