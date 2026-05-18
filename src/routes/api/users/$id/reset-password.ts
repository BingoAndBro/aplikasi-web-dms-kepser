import { createFileRoute } from '@tanstack/react-router'

import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { resetPasswordRequestBoundarySchema } from '#/lib/schemas/user'
import { isValidPassword } from '#/lib/types/user'
import { isValidUserId } from '#/lib/users/local-user-mutations'
import { resetLocalUserPassword } from '#/lib/users/local-user-passwords'

// ---------------------------------------------------------------------------
// POST /api/users/[id]/reset-password - Reset password for user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/$id/reset-password')({
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
          return Response.json({ error: 'Hanya ADMIN yang bisa mereset password' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsedBody = resetPasswordRequestBoundarySchema.safeParse(body)
        const password = parsedBody.success ? parsedBody.data.password : undefined

        if (typeof password !== 'string' || !isValidPassword(password)) {
          return Response.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
        }

        try {
          const result = await resetLocalUserPassword(id, password)

          if (!result.success) {
            return Response.json({ error: result.error }, { status: result.status })
          }

          return Response.json({ success: true, message: 'Password berhasil direset' })
        } catch {
          return Response.json({ error: 'Gagal mereset password' }, { status: 500 })
        }
      },
    },
  },
})
