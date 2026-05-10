import { z } from 'zod'
import { roleArraySchema } from './auth'

export const userMetadataSchema = z.object({
  nama_lengkap: z.string().min(1).optional(),
  nip_nrp: z.string().min(1).optional(),
  departemen: z.string().min(1).optional(),
})

export const userProfilePayloadSchema = z.object({
  id: z.string(),
  email: z.string(),
  metadata: userMetadataSchema,
  roles: roleArraySchema,
})

export const userPayloadSchema = userProfilePayloadSchema.extend({
  isActive: z.boolean(),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
})

export const userProfileResponseSchema = z.object({
  user: userProfilePayloadSchema,
})

export const userResponseSchema = z.object({
  user: userPayloadSchema,
})

export const userListResponseSchema = z.object({
  users: z.array(userPayloadSchema),
  total: z.number(),
})

export type UserMetadataInput = z.infer<typeof userMetadataSchema>
