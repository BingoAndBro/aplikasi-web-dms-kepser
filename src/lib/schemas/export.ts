import { z } from 'zod'

// max(2000) is a payload-size safety net only, not the RP-07 business rule.
// The real 500-document cap is enforced by the endpoint (see the RP-07 plan,
// Step 8 point 4) so it can respond with a message naming the exact count.
export const exportZipRequestSchema = z
  .object({
    dokumen_ids: z.array(z.uuid()).min(1).max(2000),
  })
  .strict()

export type ExportZipRequest = z.infer<typeof exportZipRequestSchema>

// Laporan Kegiatan & Monitoring Dokumen Tim berbagi endpoint ekspor yang sama;
// `scope` menentukan status mana yang boleh ikut (lihat kegiatan-scope.ts).
export const kegiatanExportZipRequestSchema = z
  .object({
    dokumen_ids: z.array(z.uuid()).min(1).max(2000),
    scope: z.enum(['final', 'monitoring']).optional(),
  })
  .strict()
