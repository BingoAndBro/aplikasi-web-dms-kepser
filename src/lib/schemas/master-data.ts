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
// Komponen Schemas
// ---------------------------------------------------------------------------

export const createKomponenSchema = z.object({
  kegiatanId: z.string().uuid('ID kegiatan tidak valid'),
  nama: z.string().min(1, 'Nama tidak boleh kosong').max(255),
  deskripsi: z.string().max(500).optional(),
})

export const updateKomponenSchema = z.object({
  kegiatanId: z.string().uuid().optional(),
  nama: z.string().min(1).max(255).optional(),
  deskripsi: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Kelengkapan Schemas
// ---------------------------------------------------------------------------

export const createKelengkapanSchema = z.object({
  kegiatanId: z.string().uuid('ID kegiatan tidak valid'),
  isKetuaTim: z.boolean(),
  namaDokumen: z.string().min(1, 'Nama dokumen tidak boleh kosong').max(255),
  required: z.boolean().default(true),
  komponenId: z.string().uuid().optional(),
  jenisPermintaanId: z.string().uuid().optional(),
  kategoriPermintaanId: z.string().uuid().optional(),
  detailPermintaanId: z.string().uuid().optional(),
})

export const updateKelengkapanSchema = z.object({
  isKetuaTim: z.boolean().optional(),
  namaDokumen: z.string().min(1).max(255).optional(),
  required: z.boolean().optional(),
  komponenId: z.string().uuid().optional().nullable(),
  jenisPermintaanId: z.string().uuid().optional().nullable(),
  kategoriPermintaanId: z.string().uuid().optional().nullable(),
  detailPermintaanId: z.string().uuid().optional().nullable(),
})

// ---------------------------------------------------------------------------
// Jenis Permintaan Schemas
// ---------------------------------------------------------------------------

export const createJenisSchema = z.object({
  nama: z.string().min(1, 'Nama tidak boleh kosong').max(255),
  deskripsi: z.string().max(500).optional(),
})

export const updateJenisSchema = z.object({
  nama: z.string().min(1).max(255).optional(),
  deskripsi: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Kategori Permintaan Schemas
// ---------------------------------------------------------------------------

export const createKategoriSchema = z.object({
  jenisPermintaanId: z.string().uuid('ID jenis tidak valid'),
  nama: z.string().min(1, 'Nama tidak boleh kosong').max(255),
  deskripsi: z.string().max(500).optional(),
})

export const updateKategoriSchema = z.object({
  jenisPermintaanId: z.string().uuid().optional(),
  nama: z.string().min(1).max(255).optional(),
  deskripsi: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Detail Permintaan Schemas
// ---------------------------------------------------------------------------

export const createDetailSchema = z.object({
  kategoriPermintaanId: z.string().uuid('ID kategori tidak valid'),
  nama: z.string().min(1, 'Nama tidak boleh kosong').max(255),
  deskripsi: z.string().max(500).optional(),
})

export const updateDetailSchema = z.object({
  kategoriPermintaanId: z.string().uuid().optional(),
  nama: z.string().min(1).max(255).optional(),
  deskripsi: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})
