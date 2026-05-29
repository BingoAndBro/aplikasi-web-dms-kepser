import { z } from 'zod'
import {
  MANUAL_ARCHIVE_RETENTION_LABELS,
  isDateOnlyString,
} from '#/lib/archive/retention'
import {
  ARCHIVE_SOURCE_TYPE_VALUES,
  BERKAS_STATUS_VALUES,
} from '#/lib/constants/archive-status'

export const berkasStatusSchema = z.enum(BERKAS_STATUS_VALUES)

export const berkasItemSourceTypeSchema = z.enum(ARCHIVE_SOURCE_TYPE_VALUES)

export const closeBerkasMetadataSchema = z
  .object({
    nomor_spm: z.string().trim().min(1, 'Nomor SPM wajib diisi').max(120, 'Nomor SPM maksimal 120 karakter'),
    retensi_aktif: z.enum(MANUAL_ARCHIVE_RETENTION_LABELS, { message: 'Retensi aktif tidak valid' }),
    retensi_inaktif: z.enum(MANUAL_ARCHIVE_RETENTION_LABELS, { message: 'Retensi inaktif tidak valid' }),
    closed_at: z.string().refine(isDateOnlyString, 'Tanggal tutup berkas harus valid dengan format YYYY-MM-DD').optional(),
  })
  .strict()
  .transform((value) => ({
    nomor_spm: value.nomor_spm,
    retensi_aktif: value.retensi_aktif,
    retensi_inaktif: value.retensi_inaktif,
    closed_at: value.closed_at ?? null,
  }))

export type CloseBerkasMetadataInput = z.infer<typeof closeBerkasMetadataSchema>
