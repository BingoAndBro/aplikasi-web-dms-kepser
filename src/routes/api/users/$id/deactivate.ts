import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createAdminClient } from '#/lib/supabase-admin'
import { deactivateUser } from '#/lib/user-helpers'

// ---------------------------------------------------------------------------
// Helper: create Supabase client with cookie
// ---------------------------------------------------------------------------

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/users/[id]/deactivate — Deactivate user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/$id/deactivate')({
  server: {
    handlers: {
      POST: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        if (!id || typeof id !== 'string') {
          return Response.json({ error: 'User ID tidak valid' }, { status: 400 })
        }

        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa menonaktifkan user' }, { status: 403 })
        }

        // Self-deactivation prevention
        if (session.user.id === id) {
          return Response.json({ error: 'Tidak bisa menonaktifkan akun sendiri' }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const result = await deactivateUser(admin, id)

          if (result.error) {
            return Response.json({ error: result.error }, { status: 400 })
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
