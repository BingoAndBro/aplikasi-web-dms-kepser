import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession, getUserRole } from '#/lib/auth'
import { parseUserProfileResponse } from '#/lib/user-response'
import { parseUserMetadata } from '#/lib/user-metadata'

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
// GET /api/users/me — Get current user profile
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get roles
        const roles = await getUserRole(supabase, session.user.id)

        return Response.json(parseUserProfileResponse({
          user: {
            id: session.user.id,
            email: session.user.email,
            metadata: parseUserMetadata(session.user.user_metadata),
            roles,
          },
        }))
      },
    },
  },
})
