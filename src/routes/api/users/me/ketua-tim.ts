import { createFileRoute } from '@tanstack/react-router'
import { asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { ketuaTimAssignments, masterKegiatan } from '#/db/schema/master'
import {
  createUnauthorizedResponse,
  getLocalServerSession,
} from '#/lib/auth/local-server-auth'

// ---------------------------------------------------------------------------
// GET /api/users/me/ketua-tim — Get current user's chairman kegiatan
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me/ketua-tim')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return createUnauthorizedResponse('Unauthorized')
        }

        try {
          const kegiatan = await db
            .select({
              id: ketuaTimAssignments.kegiatanId,
              nama: masterKegiatan.nama,
            })
            .from(ketuaTimAssignments)
            .innerJoin(
              masterKegiatan,
              eq(ketuaTimAssignments.kegiatanId, masterKegiatan.id),
            )
            .where(eq(ketuaTimAssignments.userId, session.user.id))
            .orderBy(asc(masterKegiatan.nama))

          return Response.json({
            is_ketua_tim: kegiatan.length > 0,
            kegiatan,
          })
        } catch (error) {
          console.error('[API] /api/users/me/ketua-tim GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      }
    }
  }
})
