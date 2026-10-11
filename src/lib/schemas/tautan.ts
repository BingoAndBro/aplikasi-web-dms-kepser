import { z } from 'zod'

import {
  TAUTAN_JUDUL_MAX_LENGTH,
  TAUTAN_KETERANGAN_MAX_LENGTH,
} from '#/lib/laporan/tautan-shared'

// max(2000) hanya pengaman ukuran payload, sama seperti schemas/export.ts.
// Batas 500 dokumen (TAUTAN_MAX_DOKUMEN) diperiksa endpoint supaya pesannya
// bisa menyebut jumlah persisnya.
export const createTautanRequestSchema = z
  .object({
    sumber: z.enum(['LAPORAN_SAYA', 'LAPORAN_KEGIATAN', 'LAPORAN_KINERJA']),
    // Bawaan LOGIN: tautan publik harus dipilih secara eksplisit.
    akses: z.enum(['LOGIN', 'PUBLIK']).default('LOGIN'),
    judul: z
      .string()
      .trim()
      .min(1, 'Judul tautan wajib diisi')
      .max(TAUTAN_JUDUL_MAX_LENGTH, `Judul tautan maksimal ${TAUTAN_JUDUL_MAX_LENGTH} karakter`),
    keterangan: z
      .string()
      .trim()
      .max(TAUTAN_KETERANGAN_MAX_LENGTH)
      .nullish()
      .transform((value) => value || null),
    dokumen_ids: z.array(z.uuid()).max(2000).default([]),
    manual_arsip_ids: z.array(z.uuid()).max(2000).default([]),
  })
  .strict()
  .refine(
    (value) => value.dokumen_ids.length + value.manual_arsip_ids.length > 0,
    { message: 'Pilih minimal satu dokumen', path: ['dokumen_ids'] },
  )
  .refine(
    (value) => value.sumber !== 'LAPORAN_SAYA' || value.manual_arsip_ids.length === 0,
    { message: 'Dokumen tambahan KSBU tidak termasuk Laporan Saya', path: ['manual_arsip_ids'] },
  )

export type CreateTautanRequest = z.infer<typeof createTautanRequestSchema>

export const listTautanQuerySchema = z.object({
  sumber: z.enum(['LAPORAN_SAYA', 'LAPORAN_KEGIATAN', 'LAPORAN_KINERJA']).optional(),
})
