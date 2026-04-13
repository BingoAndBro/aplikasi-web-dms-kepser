import { createFileRoute } from '@tanstack/react-router'
import { roleSwitchSchema } from '#/lib/schemas/auth'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getUserRole, setActiveRoleCookieHeader } from '#/lib/auth'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/api/auth/role-switch')({
  post: async ({ request }) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = roleSwitchSchema.safeParse(body)
    if (!result.success) {
      return new Response(JSON.stringify({
        error: 'Validasi gagal',
        details: result.error.flatten(),
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { activeRole } = result.data
    const cookieHeader = request.headers.get('cookie')
    const mockEvent = {
      request,
      cookie: { get: () => undefined, set: () => {}, delete: () => {} },
    } as any
    const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const userRoles = await getUserRole(supabase, session.user.id)

    // ADMIN tidak boleh switch role
    if (userRoles.includes('ADMIN')) {
      return new Response(JSON.stringify({
        error: 'ADMIN tidak bisa switch role — akun dedicated',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!userRoles.includes(activeRole as RoleName)) {
      return new Response(JSON.stringify({
        error: `Role '${activeRole}' tidak tersedia untuk akun Anda`,
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const newCookie = setActiveRoleCookieHeader(cookieHeader, activeRole as RoleName)

    return new Response(JSON.stringify({ success: true, activeRole }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': newCookie,
      },
    })
  }
})
