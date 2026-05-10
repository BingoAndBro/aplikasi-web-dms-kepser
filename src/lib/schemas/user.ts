import { z } from 'zod'

export const userMetadataSchema = z.object({
  nama_lengkap: z.string().min(1).optional(),
  nip_nrp: z.string().min(1).optional(),
  departemen: z.string().min(1).optional(),
})

export type UserMetadataInput = z.infer<typeof userMetadataSchema>
