import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

export const Route = createFileRoute('/api/ppspm/ditolak')({
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
              revision_notes: dokumenTransaksi.revisionNotes,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(and(
              eq(dokumenTransaksi.status, 'NEED_REVISION'),
              eq(dokumenTransaksi.revisionTarget, 'PPK'),
            ))
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
              revision_notes: d.revision_notes,
            })),
          })
        } catch (err) {
          console.error('[ppspm/ditolak] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
