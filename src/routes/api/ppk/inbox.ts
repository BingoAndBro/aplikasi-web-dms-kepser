import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

// ---------------------------------------------------------------------------
// GET /api/ppk/inbox - list dokumen IN_PPK_VALIDATION
// Query params: fungsi_id (optional), start_date (optional), end_date (optional)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/inbox')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'PPK')) {
          return Response.json({ error: 'Akses ditolak \u2014 bukan PPK' }, { status: 403 })
        }

        const url = new URL(request.url)
        const fungsiId = url.searchParams.get('fungsi_id') ?? undefined
        const startDate = url.searchParams.get('start_date') ?? undefined
        const endDate = url.searchParams.get('end_date') ?? undefined

        const filters: SQL[] = [eq(dokumenTransaksi.status, 'IN_PPK_VALIDATION')]
        if (fungsiId) filters.push(eq(dokumenTransaksi.fungsiId, fungsiId))
        if (startDate) filters.push(sql`${dokumenTransaksi.createdAt} >= ${startDate}`)
        if (endDate) filters.push(sql`${dokumenTransaksi.createdAt} <= ${endDate + 'T23:59:59'}`)

        try {
          const docs = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              fungsi_nama: masterFungsi.nama,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              kegiatan_nama: masterKegiatan.nama,
              created_by: dokumenTransaksi.createdBy,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_at: dokumenTransaksi.createdAt,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(and(...filters))
            .orderBy(desc(dokumenTransaksi.createdAt))

          return Response.json({
            dokumen: docs.map((d) => ({
              id: d.id,
              judul: d.judul,
              fungsi_id: d.fungsi_id,
              fungsi_nama: d.fungsi_nama ?? '\u2014',
              kegiatan_jenis_id: d.kegiatan_jenis_id,
              kegiatan_nama: d.kegiatan_nama ?? '\u2014',
              created_by: d.created_by,
              tahun: d.tahun,
              tanggal: d.tanggal,
              created_at: d.created_at,
            })),
          })
        } catch (err) {
          console.error('[ppk/inbox] query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
