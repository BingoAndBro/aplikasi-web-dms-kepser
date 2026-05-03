import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createAdminClient } from '#/lib/supabase-admin'
import { resetUserPassword } from '#/lib/user-helpers'
import { isValidPassword } from '#/lib/types/user'

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
// POST /api/users/[id]/reset-password — Reset password for user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/$id/reset-password')({
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
          return Response.json({ error: 'Hanya ADMIN yang bisa mereset password' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { password } = body as any

        // Validation
        if (!password || !isValidPassword(password)) {
          return Response.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const result = await resetUserPassword(admin, id, password)

          if (result.error) {
            return Response.json({ error: result.error }, { status: 400 })
          }

          return Response.json({ success: true, message: 'Password berhasil direset' })
        } catch (err: any) {
          console.error('[API] /api/users/[id]/reset-password error:', err)
          return Response.json({ error: 'Gagal mereset password' }, { status: 500 })
        }
      },
    },
  },
})
