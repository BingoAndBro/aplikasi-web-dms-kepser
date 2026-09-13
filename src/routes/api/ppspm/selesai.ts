import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

export const Route = createFileRoute('/api/ppspm/selesai')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'PPSPM')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        try {
          const docs = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(eq(dokumenTransaksi.status, 'COMPLETED'))
            .orderBy(desc(dokumenTransaksi.updatedAt))

          return Response.json({
            dokumen: docs.map((d) => ({
              id: d.id,
              judul: d.judul,
              fungsi_nama: d.fungsi_nama ?? '\u2014',
              kegiatan_nama: d.kegiatan_nama ?? '\u2014',
              tahun: d.tahun,
              tanggal: d.tanggal,
              created_at: d.created_at,
              updated_at: d.updated_at,
            })),
          })
        } catch (err) {
          console.error('[ppspm/selesai] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
