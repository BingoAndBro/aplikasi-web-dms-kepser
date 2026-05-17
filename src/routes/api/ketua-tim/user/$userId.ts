import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { ketuaTimAssignments, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

async function requireLocalAdmin(request: Request) {
  const session = await getLocalServerSession(request)

  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
  }

  return null
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/api/ketua-tim/user/$userId')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { userId: string } }) => {
        const authError = await requireLocalAdmin(request)
        if (authError) return authError

        const { userId } = params
        if (!uuidRegex.test(userId)) {
          return Response.json({ error: 'User ID tidak valid' }, { status: 400 })
        }

        try {
          const rows = await db
            .select({
              id: ketuaTimAssignments.id,
              user_id: ketuaTimAssignments.userId,
              kegiatan_id: ketuaTimAssignments.kegiatanId,
              created_at: ketuaTimAssignments.createdAt,
              kegiatan_id_join: masterKegiatan.id,
              kegiatan_nama: masterKegiatan.nama,
            })
            .from(ketuaTimAssignments)
            .leftJoin(masterKegiatan, eq(ketuaTimAssignments.kegiatanId, masterKegiatan.id))
            .where(eq(ketuaTimAssignments.userId, userId))
            .orderBy(desc(ketuaTimAssignments.createdAt))

          return Response.json({
            assignments: rows.map((row) => ({
              id: row.id,
              user_id: row.user_id,
              kegiatan_id: row.kegiatan_id,
              created_at: row.created_at,
              kegiatan: row.kegiatan_id_join
                ? { id: row.kegiatan_id_join, nama: row.kegiatan_nama }
                : null,
            })),
          })
        } catch (err) {
          console.error('[API] /api/ketua-tim/user/$userId GET error:', err)
          return Response.json({ error: 'Gagal mengambil data ketua tim user' }, { status: 500 })
        }
      },
    },
  },
})
