import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '#/db/client'
import { arsip } from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

// ---------------------------------------------------------------------------
// GET /api/arsiparis/inbox - list dokumen COMPLETED yang belum diarsipkan
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/inbox')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const url = new URL(request.url)
        const fungsiId = url.searchParams.get('fungsi_id') ?? undefined
        const startDate = url.searchParams.get('start_date') ?? undefined
        const endDate = url.searchParams.get('end_date') ?? undefined

        const filters: SQL[] = [
          eq(dokumenTransaksi.status, 'COMPLETED'),
          isNull(arsip.dokumenId),
        ]
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
            .leftJoin(arsip, eq(dokumenTransaksi.id, arsip.dokumenId))
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(and(...filters))
            .orderBy(desc(dokumenTransaksi.createdAt))

          if (docs.length === 0) return Response.json({ inbox: [] })

          const logs = await db
            .select({
              dokumen_id: logAktivitas.dokumenId,
              timestamp: logAktivitas.timestamp,
            })
            .from(logAktivitas)
            .where(and(
              inArray(logAktivitas.dokumenId, docs.map((d) => d.id)),
              eq(logAktivitas.aksi, 'BENDAHARA_APPROVE'),
            ))

          const bendaharaLogMap: Record<string, Date> = {}
          for (const log of logs) {
            bendaharaLogMap[log.dokumen_id] = log.timestamp
          }

          return Response.json({
            inbox: docs.map((d) => ({
              id: d.id,
              judul: d.judul,
              fungsi_id: d.fungsi_id,
              fungsi_nama: d.fungsi_nama ?? '\u2014',
              kegiatan_jenis_id: d.kegiatan_jenis_id,
              kegiatan_nama: d.kegiatan_nama ?? '\u2014',
              created_by: d.created_by,
              nama_pegawai: '\u2014',
              tahun: d.tahun,
              tanggal: d.tanggal,
              created_at: d.created_at,
              bendahara_approve_at: bendaharaLogMap[d.id] ?? null,
            })),
          })
        } catch (err) {
          console.error('[arsiparis/inbox] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
