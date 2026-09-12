import { createFileRoute } from '@tanstack/react-router'
import { asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { parseLampiranUrls } from '#/lib/dokumen'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ---------------------------------------------------------------------------
// GET /api/ppk/dokumen/[id] - Get dokumen detail for PPK
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'PPK')) {
          return Response.json({ error: 'Akses ditolak \u2014 bukan PPK' }, { status: 403 })
        }

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        try {
          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              fungsi_nama: masterFungsi.nama,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              kegiatan_nama: masterKegiatan.nama,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              current_step: dokumenTransaksi.currentStep,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              lampiran_dibersihkan_at: dokumenTransaksi.lampiranDibersihkanAt,
              lampiran_dibersihkan_alasan: dokumenTransaksi.lampiranDibersihkanAlasan,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)

          const dok = rows[0]
          if (!dok) {
            return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
          }

          const ppkStatuses = [
            'IN_PPK_VALIDATION',
            'IN_BENDAHARA_APPROVAL',
            'NEED_REVISION',
            'COMPLETED',
            'ARCHIVED',
          ]
          if (!ppkStatuses.includes(dok.status)) {
            return Response.json({ error: 'Dokumen tidak tersedia untuk PPK' }, { status: 400 })
          }

          const logs = await db
            .select({
              id: logAktivitas.id,
              dokumen_id: logAktivitas.dokumenId,
              user_id: logAktivitas.userId,
              aksi: logAktivitas.aksi,
              catatan: logAktivitas.catatan,
              step_urutan: logAktivitas.stepUrutan,
              timestamp: logAktivitas.timestamp,
            })
            .from(logAktivitas)
            .where(eq(logAktivitas.dokumenId, params.id))
            .orderBy(asc(logAktivitas.timestamp))

          return Response.json({
            dokumen: {
              id: dok.id,
              judul: dok.judul,
              fungsi_id: dok.fungsi_id,
              fungsi_nama: dok.fungsi_nama ?? '\u2014',
              kegiatan_jenis_id: dok.kegiatan_jenis_id,
              kegiatan_nama: dok.kegiatan_nama ?? '\u2014',
              is_ketua_tim: dok.is_ketua_tim,
              status: dok.status,
              current_step: dok.current_step,
              revision_target: dok.revision_target,
              revision_notes: dok.revision_notes,
              lampiran_urls: parseLampiranUrls(dok.lampiran_urls),
              tahun: dok.tahun,
              tanggal: dok.tanggal,
              created_by: dok.created_by,
              created_at: dok.created_at,
              updated_at: dok.updated_at,
              lampiran_dibersihkan_at: dok.lampiran_dibersihkan_at,
              lampiran_dibersihkan_alasan: dok.lampiran_dibersihkan_alasan,
              nominal_realisasi: normalizeNumericValue(dok.nominal_realisasi),
              jenis_permintaan_id: dok.jenis_permintaan_id,
              kategori_permintaan_id: dok.kategori_permintaan_id,
              detail_permintaan_id: dok.detail_permintaan_id,
              jenis_permintaan_nama: dok.jenis_permintaan_nama ?? undefined,
              kategori_permintaan_nama: dok.kategori_permintaan_nama ?? undefined,
              detail_permintaan_nama: dok.detail_permintaan_nama ?? undefined,
            },
            logs,
          })
        } catch (err) {
          console.error('[ppk/dokumen/:id] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
