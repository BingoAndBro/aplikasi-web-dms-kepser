import { createFileRoute } from '@tanstack/react-router'
import { loginSchema } from '#/lib/schemas/auth'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getPrimaryRole, getUserRole, setActiveRoleCookieHeader } from '#/lib/auth'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/api/auth/login')({
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

    const result = loginSchema.safeParse(body)
    if (!result.success) {
      return new Response(JSON.stringify({
        error: 'Validasi gagal',
        details: result.error.flatten(),
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { email, password } = result.data

    // Create server client (we pass a mock event with cookie header from request)
    const cookieHeader = request.headers.get('cookie')
    const mockEvent = {
      request,
      cookie: {
        get: () => undefined,
        set: () => {},
        delete: () => {},
      },
    } as any
    const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return new Response(JSON.stringify({
        error: 'Email atau password salah',
        code: error.code,
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const roles = await getUserRole(supabase, data.user.id)
    const activeRole: RoleName = getPrimaryRole(roles)

    // Set active_role cookie
    const newCookie = setActiveRoleCookieHeader(cookieHeader, activeRole)

    return new Response(JSON.stringify({
      user: {
        id: data.user.id,
        email: data.user.email,
        userName: data.user.user_metadata?.user_name as string | undefined,
      },
      roles,
      activeRole,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': newCookie,
      },
    })
  }
})
