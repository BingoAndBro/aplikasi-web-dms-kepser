import { z } from 'zod'

// ---------------------------------------------------------------------------
// Fungsi Schemas
// ---------------------------------------------------------------------------

export const createFungsiSchema = z.object({
  nama: z.string().min(1, 'Nama tidak boleh kosong').max(255),
  deskripsi: z.string().max(500).optional(),
})

export const updateFungsiSchema = z.object({
  nama: z.string().min(1).max(255).optional(),
  deskripsi: z.string().max(500).optional(),
})

// ---------------------------------------------------------------------------
// Kegiatan Schemas
// ---------------------------------------------------------------------------

export const createKegiatanSchema = z.object({
  fungsiId: z.string().uuid('ID fungsi tidak valid'),
  nama: z.string().min(1, 'Nama tidak boleh kosong').max(255),
  deskripsi: z.string().max(500).optional(),
})

export const updateKegiatanSchema = z.object({
  fungsiId: z.string().uuid().optional(),
  nama: z.string().min(1).max(255).optional(),
  deskripsi: z.string().max(500).optional(),
})

// ---------------------------------------------------------------------------
// Kelengkapan Schemas
// ---------------------------------------------------------------------------

export const createKelengkapanSchema = z.object({
  kegiatanId: z.string().uuid('ID kegiatan tidak valid'),
  isKetuaTim: z.boolean(),
  namaDokumen: z.string().min(1, 'Nama dokumen tidak boleh kosong').max(255),
  required: z.boolean().default(true),
})

export const updateKelengkapanSchema = z.object({
  isKetuaTim: z.boolean().optional(),
  namaDokumen: z.string().min(1).max(255).optional(),
  required: z.boolean().optional(),
})
