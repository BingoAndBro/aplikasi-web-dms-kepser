import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { clearActiveRoleCookieHeader } from '#/lib/auth'

export const Route = createFileRoute('/api/auth/logout')({
  post: async ({ request }) => {
    const cookieHeader = request.headers.get('cookie')
    const mockEvent = {
      request,
      cookie: { get: () => undefined, set: () => {}, delete: () => {} },
    } as any
    const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

    await supabase.auth.signOut()

    const newCookie = clearActiveRoleCookieHeader(cookieHeader)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': newCookie,
      },
    })
  }
})
