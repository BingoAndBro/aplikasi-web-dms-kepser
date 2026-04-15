import { createFileRoute } from '@tanstack/react-router'
import { roleSwitchSchema } from '#/lib/schemas/auth'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getUserRole, setActiveRoleCookieHeader } from '#/lib/auth'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/api/auth/role-switch')({
  server: {
    post: async ({ request }) => {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      const result = roleSwitchSchema.safeParse(body)
      if (!result.success) {
        return Response.json({
          error: 'Validasi gagal',
          details: result.error.flatten(),
        }, { status: 400 })
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
        return Response.json({ error: 'Not authenticated' }, { status: 401 })
      }

      const userRoles = await getUserRole(supabase, session.user.id)

      if (userRoles.includes('ADMIN')) {
        return Response.json({
          error: 'ADMIN tidak bisa switch role — akun dedicated',
        }, { status: 403 })
      }

      if (!userRoles.includes(activeRole as RoleName)) {
        return Response.json({
          error: `Role '${activeRole}' tidak tersedia untuk akun Anda`,
        }, { status: 403 })
      }

      const newCookie = setActiveRoleCookieHeader(cookieHeader, activeRole as RoleName)

      return Response.json({ success: true, activeRole }, {
        headers: {
          'Set-Cookie': newCookie,
        },
      })
    },
  },
})
