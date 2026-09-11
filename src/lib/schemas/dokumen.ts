import { z } from 'zod'
import {
  DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR,
  findDuplicateAdditionalKelengkapanName,
} from '#/lib/kelengkapan-validation'

// ---------------------------------------------------------------------------
// Lampiran entry (stored as JSON in lampiran_urls column)
// ---------------------------------------------------------------------------

// Valid kelengkapan_id: standard UUID or "user-custom-{uuid}"
const kelengkapanIdRegex = /^(user-custom-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const lampiranUrlSchema = z.object({
  kelengkapan_id: z.string().regex(kelengkapanIdRegex, 'ID kelengkapan tidak valid'),
  nama: z.string().min(1, 'Nama tidak boleh kosong'),
  url: z.string().min(1, 'URL tidak boleh kosong'),
  uploaded_at: z.string().min(1, 'Timestamp tidak boleh kosong'),
})

export const lampiranUrlsSchema = z.array(lampiranUrlSchema)

export const requestLampiranUrlsSchema = z.array(lampiranUrlSchema).superRefine((lampiranUrls, ctx) => {
  const duplicateName = findDuplicateAdditionalKelengkapanName(lampiranUrls)
  if (!duplicateName) return

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR}: "${duplicateName}"`,
  })
})

export function getDokumenValidationErrorMessage(error: z.ZodError): string {
  return error.issues.find(issue =>
    issue.message.startsWith(DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR)
  )?.message ?? 'Validasi gagal'
}

// ---------------------------------------------------------------------------
// Create dokumen
// ---------------------------------------------------------------------------

export const createDokumenSchema = z.object({
  fungsiId: z.string().uuid('ID fungsi tidak valid'),
  kegiatanJenisId: z.string().uuid('ID kegiatan tidak valid'),
  isKetuaTim: z.boolean(),
  tahun: z.number().int().min(2000).max(2100, 'Tahun tidak valid'),
  tanggal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid. Gunakan YYYY-MM-DD')
    .refine(val => {
      const [y, m, d] = val.split('-').map(Number)
      const selected = new Date(y, m - 1, d)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return selected <= today
    }, { message: 'Tanggal tidak boleh melewati hari ini' }),
  lampiranUrls: requestLampiranUrlsSchema.default([]),
  jenisPermintaanId: z.string().uuid().optional(),
  kategoriPermintaanId: z.string().uuid().optional(),
  detailPermintaanId: z.string().uuid().optional(),
})

// ---------------------------------------------------------------------------
// Update dokumen (lampiran + optional metadata)
// ---------------------------------------------------------------------------

export const updateDokumenSchema = z.object({
  lampiranUrls: requestLampiranUrlsSchema.optional(),
  judul: z.string().min(3, 'Judul minimal 3 karakter').max(255, 'Judul maksimal 255 karakter').optional(),
  tahun: z.number().int().min(2000).max(2100).optional(),
  fungsiId: z.string().uuid('ID fungsi tidak valid').optional(),
  kegiatanId: z.string().uuid('ID kegiatan tidak valid').optional(),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid').optional(),
  komponenId: z.string().uuid().optional().nullable(),
  jenisPermintaanId: z.string().uuid().optional().nullable(),
  kategoriPermintaanId: z.string().uuid().optional().nullable(),
  detailPermintaanId: z.string().uuid().optional().nullable(),
  nominalRealisasi: z.number().min(0).max(999999999999).nullable().optional(),
  keteranganDetail: z.string().max(5000).optional().nullable(),
  namaDokumen: z.string().trim().min(1, 'Nama dokumen tidak boleh kosong').max(255, 'Nama dokumen maksimal 255 karakter').optional().nullable(),
})

// ---------------------------------------------------------------------------
// Submit/resubmit dokumen — no body needed
// ---------------------------------------------------------------------------

export const submitDokumenSchema = z.object({}).strict()

// ---------------------------------------------------------------------------
// Update nominal_realisasi
// ---------------------------------------------------------------------------

export const updateNominalSchema = z.object({
  nominal_realisasi: z.number()
    .min(0, 'Nominal tidak boleh negatif')
    .max(999999999999, 'Nominal terlalu besar')
    .nullable()
    .optional(),
  is_non_material: z.boolean().optional(),
})

export type UpdateNominal = z.infer<typeof updateNominalSchema>

// ---------------------------------------------------------------------------
// Submit dokumen (combined create + submit in one call)
// ---------------------------------------------------------------------------

export const createAndSubmitDokumenSchema = z.object({
  fungsiId: z.string().uuid('ID fungsi tidak valid'),
  kegiatanJenisId: z.string().uuid('ID kegiatan tidak valid'),
  isKetuaTim: z.boolean(),
  tahun: z.number().int().min(2000).max(2100, 'Tahun tidak valid'),
  tanggal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid. Gunakan YYYY-MM-DD')
    .refine(val => {
      const [y, m, d] = val.split('-').map(Number)
      const selected = new Date(y, m - 1, d)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return selected <= today
    }, { message: 'Tanggal tidak boleh melewati hari ini' }),
  lampiranUrls: requestLampiranUrlsSchema,
  nominal_realisasi: z.number()
    .min(0, 'Nominal tidak boleh negatif')
    .max(999999999999, 'Nominal terlalu besar')
    .nullable()
    .optional(),
  is_non_material: z.boolean().default(false),
  // For Non-Material documents
  jenisDokumenId: z.string().uuid().optional(),
  namaDokumen: z.string().trim().min(1, 'Nama dokumen tidak boleh kosong').max(255, 'Nama dokumen maksimal 255 karakter').optional(),
  keteranganDetail: z.string().max(500, 'Keterangan maksimal 500 karakter').optional(),
  // For Material documents
  komponenId: z.string().uuid().optional(),
  jenisPermintaanId: z.string().uuid().optional(),
  kategoriPermintaanId: z.string().uuid().optional(),
  detailPermintaanId: z.string().uuid().optional(),
})

// ---------------------------------------------------------------------------
// Approval actions — for PPK and Bendahara
// ---------------------------------------------------------------------------

// Approve dokumen — no body needed
export const approveDokumenSchema = z.object({}).strict()

// Reject dokumen — catatan wajib min 10 karakter
export const rejectDokumenSchema = z.object({
  catatan: z.string().min(10, 'Catatan minimal 10 karakter').max(2000, 'Catatan maksimal 2000 karakter'),
})

// Resubmit by PPK after Bendahara rejection — optional lampiran update
export const resubmitDokumenSchema = z.object({
  lampiranUrls: requestLampiranUrlsSchema.optional(),
  nominalRealisasi: z.number().min(0).max(999999999999).nullable().optional(),
}).strict()

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ApproveDokumen = z.infer<typeof approveDokumenSchema>
export type RejectDokumen = z.infer<typeof rejectDokumenSchema>
export type ResubmitDokumen = z.infer<typeof resubmitDokumenSchema>

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates that nominal_realisasi is present and > 0 for Material documents.
 * Non-Material documents (is_non_material = true) are exempt from this requirement.
 */
export function validateNominalForMaterial(
  isNonMaterial: boolean | undefined | null,
  nominalRealisasi: number | null | undefined
): { valid: boolean; error?: string } {
  // Non-material documents don't need nominal
  if (isNonMaterial) {
    return { valid: true }
  }

  // Material documents require nominal > 0
  if (
    nominalRealisasi === null ||
    nominalRealisasi === undefined ||
    nominalRealisasi <= 0
  ) {
    return {
      valid: false,
      error: 'Nominal_realisasi wajib untuk dokumen Material',
    }
  }

  return { valid: true }
}

/**
 * Validates the workflow chain field required per document characteristic:
 * Material requires komponenId (Komponen selection); Non-Material requires
 * a free-text namaDokumen ("Nama Dokumen").
 */
export function validateWorkflowChainForCharacteristic(
  isNonMaterial: boolean | undefined | null,
  input: { komponenId?: string | null; namaDokumen?: string | null }
): { valid: boolean; error?: string } {
  if (isNonMaterial) {
    if (!input.namaDokumen || !input.namaDokumen.trim()) {
      return {
        valid: false,
        error: 'Nama Dokumen wajib diisi untuk dokumen Non-Material',
      }
    }
    return { valid: true }
  }

  if (!input.komponenId) {
    return {
      valid: false,
      error: 'Komponen wajib dipilih untuk dokumen Material',
    }
  }

  return { valid: true }
}
