import { z } from 'zod'

export const assignKetuaTimSchema = z.object({
  user_id: z.string().uuid('user_id wajib UUID valid'),
  kegiatan_id: z.string().uuid('kegiatan_id wajib UUID valid'),
})

export const updateKetuaTimSchema = z.object({
  user_id: z.string().uuid('user_id wajib UUID valid'),
})

export type AssignKetuaTimInput = z.infer<typeof assignKetuaTimSchema>
export type UpdateKetuaTimInput = z.infer<typeof updateKetuaTimSchema>
