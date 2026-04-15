import { createFileRoute } from '@tanstack/react-router'
import { loginSchema } from '#/lib/schemas/auth'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getPrimaryRole, getUserRole, setActiveRoleCookieHeader } from '#/lib/auth'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    post: async ({ request }) => {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      const result = loginSchema.safeParse(body)
      if (!result.success) {
        return Response.json({
          error: 'Validasi gagal',
          details: result.error.flatten(),
        }, { status: 400 })
      }

      const { email, password } = result.data

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
        return Response.json({
          error: 'Email atau password salah',
          code: error.code,
        }, { status: 401 })
      }

      const roles = await getUserRole(supabase, data.user.id)
      const activeRole: RoleName = getPrimaryRole(roles)

      const newCookie = setActiveRoleCookieHeader(cookieHeader, activeRole)

      return Response.json({
        user: {
          id: data.user.id,
          email: data.user.email,
          userName: data.user.user_metadata?.user_name as string | undefined,
        },
        roles,
        activeRole,
      }, {
        headers: {
          'Set-Cookie': newCookie,
        },
      })
    },
  },
})
