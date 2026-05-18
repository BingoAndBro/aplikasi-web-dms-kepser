import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { deactivateLocalUser, isValidUserId } from '#/lib/users/local-user-mutations'

// ---------------------------------------------------------------------------
// POST /api/users/[id]/deactivate — Deactivate user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/$id/deactivate')({
  server: {
    handlers: {
      POST: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        if (!isValidUserId(id)) {
          return Response.json({ error: 'User ID tidak valid' }, { status: 400 })
        }

        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Hanya ADMIN yang bisa menonaktifkan user' }, { status: 403 })
        }

        // Self-deactivation prevention
        if (session.userId === id) {
          return Response.json({ error: 'Tidak bisa menonaktifkan akun sendiri' }, { status: 400 })
        }

        try {
          const result = await deactivateLocalUser(id, session.userId)

          if (result.error) {
            return Response.json({ error: result.error }, { status: result.status ?? 400 })
          }

          return Response.json({ success: true, message: 'User berhasil dinonaktifkan' })
        } catch (err: any) {
          console.error('[API] /api/users/[id]/deactivate error:', err)
          return Response.json({ error: 'Gagal menonaktifkan user' }, { status: 500 })
        }
      },
    },
  },
})
