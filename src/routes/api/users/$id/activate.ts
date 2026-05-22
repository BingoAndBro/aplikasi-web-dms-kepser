import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { activateLocalUser, isValidUserId } from '#/lib/users/local-user-mutations'

// ---------------------------------------------------------------------------
// POST /api/users/[id]/activate — Activate user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/$id/activate')({
  server: {
    handlers: {
      POST: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const { id } = params

        if (!isValidUserId(id)) {
          return Response.json({ error: 'User ID tidak valid' }, { status: 400 })
        }

        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengaktifkan user' }, { status: 403 })
        }

        try {
          const result = await activateLocalUser(id)

          if (result.error) {
            return Response.json({ error: result.error }, { status: result.status ?? 400 })
          }

          return Response.json({ success: true, message: 'User berhasil diaktifkan' })
        } catch (err: any) {
          console.error('[API] /api/users/[id]/activate error:', err)
          return Response.json({ error: 'Gagal mengaktifkan user' }, { status: 500 })
        }
      },
    },
  },
})
