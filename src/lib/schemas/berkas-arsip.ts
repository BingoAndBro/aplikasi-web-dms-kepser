import { z } from 'zod'
import {
  MANUAL_ARCHIVE_RETENTION_LABELS,
  isDateOnlyString,
} from '#/lib/archive/retention'
import {
  ARCHIVE_SOURCE_TYPE_VALUES,
  BERKAS_ARCHIVE_STATUS_VALUES,
  BERKAS_STATUS_VALUES,
} from '#/lib/constants/archive-status'

export const berkasStatusSchema = z.enum(BERKAS_STATUS_VALUES)

export const berkasArchiveStatusSchema = z.enum(BERKAS_ARCHIVE_STATUS_VALUES)

export const nullableBerkasArchiveStatusSchema = berkasArchiveStatusSchema.nullable()

export const berkasItemSourceTypeSchema = z.enum(ARCHIVE_SOURCE_TYPE_VALUES)

export const openBerkasRequestSchema = z
  .object({
    klasifikasi_id: z.uuid('Cara pembayaran tidak valid'),
    tahun_anggaran: z.number({ error: 'Tahun anggaran wajib dipilih' }).int().min(2000).max(2100),
  })
  .strict()

export const addWorkflowBerkasItemRequestSchema = z
  .object({
    source_type: z.literal('WORKFLOW'),
    dokumen_id: z.uuid('Dokumen workflow tidak valid'),
  })
  .strict()

export const addManualBerkasItemRequestSchema = z
  .object({
    source_type: z.literal('MANUAL'),
    manual_arsip_id: z.uuid('Dokumen manual tidak valid'),
  })
  .strict()

export const addBerkasItemRequestSchema = z.discriminatedUnion('source_type', [
  addWorkflowBerkasItemRequestSchema,
  addManualBerkasItemRequestSchema,
])

// RP-01: satu field retensi "Masa Simpan Minimal". Key `retensi_aktif`
// dipertahankan sebagai identifier internal; `retensi_inaktif` dibuang (schema
// `.strict()` -> payload yang masih mengirimnya ditolak).
export const closeBerkasMetadataSchema = z
  .object({
    nomor_spm: z.string().trim().min(1, 'Nomor SPM wajib diisi').max(120, 'Nomor SPM maksimal 120 karakter'),
    retensi_aktif: z.enum(MANUAL_ARCHIVE_RETENTION_LABELS, { message: 'Masa Simpan Minimal tidak valid' }),
    closed_at: z.string().refine(isDateOnlyString, 'Tanggal tutup berkas harus valid dengan format YYYY-MM-DD').optional(),
  })
  .strict()
  .transform((value) => ({
    nomor_spm: value.nomor_spm,
    retensi_aktif: value.retensi_aktif,
    closed_at: value.closed_at ?? null,
  }))

export type CloseBerkasMetadataInput = z.infer<typeof closeBerkasMetadataSchema>
export type OpenBerkasRequestInput = z.infer<typeof openBerkasRequestSchema>
export type AddBerkasItemRequestInput = z.infer<typeof addBerkasItemRequestSchema>
export type NullableBerkasArchiveStatusInput = z.infer<typeof nullableBerkasArchiveStatusSchema>
