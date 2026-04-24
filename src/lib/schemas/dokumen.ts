import { z } from 'zod'

// ---------------------------------------------------------------------------
// Lampiran entry (stored as JSON in lampiran_urls column)
// ---------------------------------------------------------------------------

export const lampiranUrlSchema = z.object({
  kelengkapan_id: z.string().uuid('ID kelengkapan tidak valid'),
  nama: z.string().min(1, 'Nama tidak boleh kosong'),
  url: z.string().min(1, 'URL tidak boleh kosong'),
  uploaded_at: z.string().min(1, 'Timestamp tidak boleh kosong'),
})

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
  lampiranUrls: z.array(lampiranUrlSchema).default([]),
  jenisPermintaanId: z.string().uuid().optional(),
  kategoriPermintaanId: z.string().uuid().optional(),
  detailPermintaanId: z.string().uuid().optional(),
})

// ---------------------------------------------------------------------------
// Update dokumen (lampiran + optional metadata)
// ---------------------------------------------------------------------------

export const updateDokumenSchema = z.object({
  lampiranUrls: z.array(lampiranUrlSchema).optional(),
  judul: z.string().min(3, 'Judul minimal 3 karakter').max(255, 'Judul maksimal 255 karakter').optional(),
  tahun: z.number().int().min(2000).max(2100).optional(),
  fungsiId: z.string().uuid('ID fungsi tidak valid').optional(),
  kegiatanId: z.string().uuid('ID kegiatan tidak valid').optional(),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid').optional(),
  jenisPermintaanId: z.string().uuid().optional().nullable(),
  kategoriPermintaanId: z.string().uuid().optional().nullable(),
  detailPermintaanId: z.string().uuid().optional().nullable(),
})

// ---------------------------------------------------------------------------
// Submit/resubmit dokumen — no body needed
// ---------------------------------------------------------------------------

export const submitDokumenSchema = z.object({}).strict()

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
      // Ensure date is not in the future (server-side safety net)
      const [y, m, d] = val.split('-').map(Number)
      const selected = new Date(y, m - 1, d)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return selected <= today
    }, { message: 'Tanggal tidak boleh melewati hari ini' }),
  lampiranUrls: z.array(lampiranUrlSchema),
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
  lampiranUrls: z.array(lampiranUrlSchema).optional(),
}).strict()

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ApproveDokumen = z.infer<typeof approveDokumenSchema>
export type RejectDokumen = z.infer<typeof rejectDokumenSchema>
export type ResubmitDokumen = z.infer<typeof resubmitDokumenSchema>
