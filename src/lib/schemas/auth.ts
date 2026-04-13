import { z } from 'zod'

// Login
export const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})
export type LoginInput = z.infer<typeof loginSchema>

// Role switch
export const roleSwitchSchema = z.object({
  activeRole: z.enum(['PEGAWAI', 'PPK', 'BENDAHARA', 'ARSIPARIS', 'ADMIN']),
})
export type RoleSwitchInput = z.infer<typeof roleSwitchSchema>

// Session response
export const sessionResponseSchema = z.object({
  session: z.object({
    userId: z.string(),
    email: z.string(),
    userName: z.string().optional(),
  }).nullable(),
  roles: z.array(z.string()),
  activeRole: z.string().nullable(),
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>
