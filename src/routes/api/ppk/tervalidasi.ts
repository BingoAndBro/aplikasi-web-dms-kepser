import { createFileRoute } from '@tanstack/react-router'
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

// ---------------------------------------------------------------------------
// GET /api/ppk/tervalidasi - list dokumen IN_BENDAHARA_APPROVAL, COMPLETED
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/tervalidasi')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        try {
          const docs = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              fungsi_nama: masterFungsi.nama,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              kegiatan_nama: masterKegiatan.nama,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_at: dokumenTransaksi.createdAt,
              status: dokumenTransaksi.status,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(inArray(dokumenTransaksi.status, ['IN_BENDAHARA_APPROVAL', 'COMPLETED']))
            .orderBy(desc(dokumenTransaksi.createdAt))

          return Response.json({
            dokumen: docs.map((d) => ({
              id: d.id,
              judul: d.judul,
              fungsi_id: d.fungsi_id,
              fungsi_nama: d.fungsi_nama ?? '\u2014',
              kegiatan_jenis_id: d.kegiatan_jenis_id,
              kegiatan_nama: d.kegiatan_nama ?? '\u2014',
              tahun: d.tahun,
              tanggal: d.tanggal,
              created_at: d.created_at,
              status: d.status,
            })),
          })
        } catch (err) {
          console.error('[ppk/tervalidasi] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
