import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKomponen,
} from '#/db/schema/master'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { parseLampiranUrls } from '#/lib/dokumen'

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ---------------------------------------------------------------------------
// GET /api/laporan/saya - Dokumen COMPLETED/TERSIMPAN milik user yang login
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/laporan/saya')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const rows = await db
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
              jenis_dokumen_id: dokumenTransaksi.jenisDokumenId,
              nama_dokumen: dokumenTransaksi.namaDokumen,
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              lampiran_dibersihkan_at: dokumenTransaksi.lampiranDibersihkanAt,
              lampiran_dibersihkan_alasan: dokumenTransaksi.lampiranDibersihkanAlasan,
              komponen_id: dokumenTransaksi.komponenId,
              komponen_nama: masterKomponen.nama,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterKomponen, eq(dokumenTransaksi.komponenId, masterKomponen.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .where(and(
              eq(dokumenTransaksi.createdBy, session.user.id),
              inArray(dokumenTransaksi.status, ['COMPLETED', 'TERSIMPAN']),
            ))
            .orderBy(desc(dokumenTransaksi.tanggal))

          return Response.json({
            dokumen: rows
              .map((row) => ({
                ...row,
                lampiran_urls: parseLampiranUrls(row.lampiran_urls),
                nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
                is_non_material: row.is_non_material ?? false,
                jenis_dokumen_id: row.jenis_dokumen_id ?? null,
                nama_dokumen: row.nama_dokumen ?? null,
                keterangan_detail: row.keterangan_detail ?? null,
                fungsi_nama: row.fungsi_nama ?? undefined,
                kegiatan_nama: row.kegiatan_nama ?? undefined,
                komponen_id: row.komponen_id ?? null,
                komponen_nama: row.komponen_nama ?? undefined,
                jenis_permintaan_nama: row.jenis_permintaan_nama ?? undefined,
                kategori_permintaan_nama: row.kategori_permintaan_nama ?? undefined,
                detail_permintaan_nama: row.detail_permintaan_nama ?? undefined,
                leaf_node_nama: row.is_non_material
                  ? (row.nama_dokumen ?? '')
                  : (row.detail_permintaan_nama
                    ?? row.kategori_permintaan_nama
                    ?? row.jenis_permintaan_nama
                    ?? row.komponen_nama
                    ?? row.kegiatan_nama
                    ?? ''),
                pengaju_id: row.created_by,
              })),
          })
        } catch (err) {
          console.error('[laporan/saya] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
