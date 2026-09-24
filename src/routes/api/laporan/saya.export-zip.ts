import { createFileRoute } from '@tanstack/react-router'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKomponen,
} from '#/db/schema/master'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { parseLampiranUrls } from '#/lib/dokumen'
import type { DokumenRow } from '#/lib/dokumen/types'
import {
  buildLaporanExportZipFilename,
  buildLaporanZipEntries,
} from '#/lib/export/laporan-zip-entries'
import { DocumentZipTooManyEntriesError, streamDocumentZip } from '#/lib/export/document-zip'
import { exportZipRequestSchema } from '#/lib/schemas/export'
import { requireSameOrigin } from '#/lib/security/same-origin'

const EXPORT_MAX_DOCUMENTS = 500

export const Route = createFileRoute('/api/laporan/saya/export-zip')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const parsed = exportZipRequestSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Daftar dokumen tidak valid' },
            { status: 400 },
          )
        }

        if (parsed.data.dokumen_ids.length > EXPORT_MAX_DOCUMENTS) {
          return Response.json({
            error: `Filter menghasilkan ${parsed.data.dokumen_ids.length} dokumen. Maksimal ${EXPORT_MAX_DOCUMENTS} per ekspor — persempit periode atau kegiatan.`,
          }, { status: 413 })
        }

        try {
          const rawRows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              current_step: dokumenTransaksi.currentStep,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              nama_dokumen: dokumenTransaksi.namaDokumen,
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              komponen_id: dokumenTransaksi.komponenId,
              komponen_nama: masterKomponen.nama,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
              kegiatan_nama: masterKegiatan.nama,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterKomponen, eq(dokumenTransaksi.komponenId, masterKomponen.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .where(and(
              inArray(dokumenTransaksi.id, parsed.data.dokumen_ids),
              eq(dokumenTransaksi.createdBy, session.user.id),
              inArray(dokumenTransaksi.status, ['COMPLETED', 'TERSIMPAN']),
            ))

          const rows: DokumenRow[] = rawRows.map(row => ({
            ...row,
            lampiran_urls: parseLampiranUrls(row.lampiran_urls),
            nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
            is_non_material: row.is_non_material ?? false,
            nama_dokumen: row.nama_dokumen ?? null,
            keterangan_detail: row.keterangan_detail ?? null,
            kegiatan_nama: row.kegiatan_nama ?? undefined,
            komponen_id: row.komponen_id ?? null,
            komponen_nama: row.komponen_nama ?? undefined,
            jenis_permintaan_nama: row.jenis_permintaan_nama ?? undefined,
            kategori_permintaan_nama: row.kategori_permintaan_nama ?? undefined,
            detail_permintaan_nama: row.detail_permintaan_nama ?? undefined,
          }))

          const entries = await buildLaporanZipEntries(rows)

          const response = await streamDocumentZip(entries, {
            requesterLabel: session.user.displayName ?? session.user.username,
            requesterRole: 'PEGAWAI',
            sourceDescription: 'Laporan Saya (filter aktif klien)',
            filename: buildLaporanExportZipFilename('Laporan_Saya', session.user.displayName ?? session.user.username),
          })

          console.info('[laporan/saya.export-zip] export completed', {
            actor: session.user.id,
            documentCount: rows.length,
          })

          return response
        } catch (error) {
          if (error instanceof DocumentZipTooManyEntriesError) {
            return Response.json({ error: error.message }, { status: 413 })
          }

          console.error('[laporan/saya.export-zip] zip stream error')
          return Response.json({ error: 'Gagal membuat ekspor ZIP' }, { status: 500 })
        }
      },
    },
  },
})

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
