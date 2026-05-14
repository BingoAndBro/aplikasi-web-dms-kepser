import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { ketuaTimAssignments } from '#/db/schema/master'
import {
  createUnauthorizedResponse,
  getLocalServerSession,
} from '#/lib/auth/local-server-auth'

// ---------------------------------------------------------------------------
// GET /api/users/me/is-ketua-tim/$kegiatanId — Check if user is chairman for kegiatan
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me/is-ketua-tim/$kegiatanId')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { kegiatanId: string } }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return createUnauthorizedResponse('Unauthorized')
        }

        const { kegiatanId } = params

        if (!kegiatanId) {
          return Response.json({ error: 'kegiatanId wajib diisi' }, { status: 400 })
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(kegiatanId)) {
          return Response.json({ error: 'Format kegiatanId tidak valid' }, { status: 400 })
        }

        try {
          const assignments = await db
            .select({ id: ketuaTimAssignments.id })
            .from(ketuaTimAssignments)
            .where(and(
              eq(ketuaTimAssignments.userId, session.user.id),
              eq(ketuaTimAssignments.kegiatanId, kegiatanId),
            ))
            .limit(1)

          return Response.json({
            is_ketua_tim: assignments.length > 0,
          })
        } catch (error) {
          console.error('[API] /api/users/me/is-ketua-tim/$kegiatanId GET error:', error)
          return Response.json({ error: 'Gagal memeriksa status chairman' }, { status: 500 })
        }
      }
    }
  }
})
