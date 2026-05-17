import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { arsip } from '#/db/schema/arsip'
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/dokumen/[id] - detail dokumen untuk review arsip
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        if (!isUuid(params.id)) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

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
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
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
          if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

          if (dok.status !== 'COMPLETED') {
            return Response.json({ error: 'Dokumen belum menyelesaikan approval' }, { status: 400 })
          }

          const bendaharaLogs = await db
            .select({
              user_id: logAktivitas.userId,
              timestamp: logAktivitas.timestamp,
            })
            .from(logAktivitas)
            .where(and(
              eq(logAktivitas.dokumenId, params.id),
              eq(logAktivitas.aksi, 'BENDAHARA_APPROVE'),
            ))
            .orderBy(asc(logAktivitas.timestamp))
            .limit(1)

          const arsipRows = await db
            .select({
              id: arsip.id,
              status_arsip: arsip.statusArsip,
              nomor_surat: arsip.nomorSurat,
            })
            .from(arsip)
            .where(eq(arsip.dokumenId, params.id))
            .limit(1)

          const bendaharaLog = bendaharaLogs[0]
          const arsipRecord = arsipRows[0]

          return Response.json({
            dokumen: {
              id: dok.id,
              judul: dok.judul,
              fungsi: { id: dok.fungsi_id ?? '', nama: dok.fungsi_nama ?? '\u2014' },
              kegiatan: { id: dok.kegiatan_jenis_id ?? '', nama: dok.kegiatan_nama ?? '\u2014' },
              jenis_permintaan_id: dok.jenis_permintaan_id,
              jenis_permintaan_nama: dok.jenis_permintaan_nama ?? undefined,
              kategori_permintaan_id: dok.kategori_permintaan_id,
              kategori_permintaan_nama: dok.kategori_permintaan_nama ?? undefined,
              detail_permintaan_id: dok.detail_permintaan_id,
              detail_permintaan_nama: dok.detail_permintaan_nama ?? undefined,
              tanggal: dok.tanggal,
              tahun: dok.tahun,
              is_ketua_tim: dok.is_ketua_tim,
              lampiran_urls: parseLampiranUrls(dok.lampiran_urls),
              created_by: { id: dok.created_by, nama: 'Pegawai' },
              status: dok.status,
              is_archived: !!arsipRecord,
            },
            bendahara_approve: bendaharaLog
              ? { nama: 'Bendahara', tanggal: bendaharaLog.timestamp }
              : null,
            arsip: arsipRecord
              ? {
                  id: arsipRecord.id,
                  status_arsip: arsipRecord.status_arsip,
                  nomor_surat: arsipRecord.nomor_surat,
                }
              : null,
          })
        } catch (err) {
          console.error('[arsiparis/dokumen/:id] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
