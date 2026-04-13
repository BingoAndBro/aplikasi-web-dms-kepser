import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getUserRole, getActiveRoleFromCookies, getPrimaryRole } from '#/lib/auth'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/api/auth/session')({
  get: async ({ request }) => {
    const cookieHeader = request.headers.get('cookie')
    const mockEvent = {
      request,
      cookie: { get: () => undefined, set: () => {}, delete: () => {} },
    } as any
    const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return new Response(JSON.stringify({
        session: null,
        roles: [],
        activeRole: null,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const roles = await getUserRole(supabase, session.user.id)
    const cookieRole = getActiveRoleFromCookies(cookieHeader)
    const activeRole: RoleName = cookieRole && roles.includes(cookieRole)
      ? cookieRole
      : getPrimaryRole(roles)

    return new Response(JSON.stringify({
      session: {
        userId: session.user.id,
        email: session.user.email,
        userName: session.user.user_metadata?.user_name as string | undefined,
      },
      roles,
      activeRole,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
