import { z } from 'zod'

// Body rute ADMIN Google Drive (SPEC 7.3). Semua strict: field asing ditolak.

export const MULAI_HUBUNG_MODES = ['HUBUNGKAN', 'GANTI', 'HUBUNGKAN_ULANG'] as const

export const mulaiHubungRequestSchema = z
  .object({
    mode: z.enum(MULAI_HUBUNG_MODES),
    akun_id: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'HUBUNGKAN_ULANG' && !value.akun_id) {
      ctx.addIssue({ code: 'custom', message: 'Akun yang dihubungkan ulang wajib dipilih', path: ['akun_id'] })
    }
  })

export type MulaiHubungRequest = z.infer<typeof mulaiHubungRequestSchema>

// 2048 = batas yang sama dengan parsePastedAddress.
export const hubungkanRequestSchema = z
  .object({
    alamat: z.string().trim().min(1, 'Tempel alamat dari tab yang gagal dimuat').max(2048, 'Alamat terlalu panjang'),
  })
  .strict()

export type HubungkanRequest = z.infer<typeof hubungkanRequestSchema>

export const putuskanRequestSchema = z
  .object({
    konfirmasi: z.literal(true, { error: 'Konfirmasi pemutusan akun wajib dicentang' }),
  })
  .strict()

export type PutuskanRequest = z.infer<typeof putuskanRequestSchema>
