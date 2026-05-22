import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { ketuaTimAssignments } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)

  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
  }

  return null
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getAssignmentId(request: Request, params: Record<string, string | undefined>) {
  const pathname = new URL(request.url).pathname
  const pathId = pathname.match(/\/api\/ketua-tim\/([^/?#]+)/)?.[1]
  return params.id ?? params.$id ?? pathId
}

export const Route = createFileRoute('/api/ketua-tim/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }: { request: Request; params: Record<string, string | undefined> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const authError = await requireAdmin(request)
        if (authError) return authError

        const id = getAssignmentId(request, params)
        if (!id || !uuidRegex.test(id)) {
          console.error('[API] /api/ketua-tim/$id DELETE invalid id:', {
            id,
            params,
            pathname: new URL(request.url).pathname,
          })
          return Response.json({ error: 'ID assignment tidak valid' }, { status: 400 })
        }

        try {
          const deleted = await db
            .delete(ketuaTimAssignments)
            .where(eq(ketuaTimAssignments.id, id))
            .returning({ id: ketuaTimAssignments.id })

          if (deleted.length === 0) {
            return Response.json({ error: 'Assignment ketua tim tidak ditemukan' }, { status: 404 })
          }

          return Response.json({ success: true })
        } catch (err) {
          console.error('[API] /api/ketua-tim/$id DELETE error:', err)
          return Response.json({ error: 'Gagal menghapus assignment ketua tim' }, { status: 500 })
        }
      },
    },
  },
})
