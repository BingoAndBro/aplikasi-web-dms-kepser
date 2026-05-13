import { createFileRoute } from '@tanstack/react-router'
import { ROLES } from '#/lib/constants/roles'
import { roleSwitchSchema } from '#/lib/schemas/auth'
import { validateAssignedRoles } from '#/lib/auth/role-resolution'
import { SESSION_COOKIE_NAME } from '#/lib/auth/session-constants'
import {
  findSessionByTokenHash,
  type SessionWithUserAndRoles,
} from '#/lib/auth/session-repository'
import { hashSessionToken } from '#/lib/auth/session-token'
import {
  createActiveRoleCookieHeader,
  getCookieValue,
} from '#/lib/auth/session-cookies'

export const Route = createFileRoute('/api/auth/role-switch')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
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
        const rawToken = getCookieValue(cookieHeader, SESSION_COOKIE_NAME)

        if (!rawToken) {
          return Response.json({ error: 'Not authenticated' }, { status: 401 })
        }

        let currentSession: SessionWithUserAndRoles | null
        try {
          currentSession = await findSessionByTokenHash(hashSessionToken(rawToken))
        } catch {
          currentSession = null
        }

        if (!currentSession) {
          return Response.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const roleValidation = validateAssignedRoles(currentSession.roles)
        if (!roleValidation.ok) {
          return Response.json({ error: roleValidation.error }, { status: 403 })
        }

        if (currentSession.roles.includes(ROLES.ADMIN)) {
          return Response.json({
            error: 'ADMIN tidak bisa switch role \u2014 akun dedicated',
          }, { status: 403 })
        }

        if (!currentSession.roles.includes(activeRole)) {
          return Response.json({
            error: `Role '${activeRole}' tidak tersedia untuk akun Anda`,
          }, { status: 403 })
        }

        return Response.json({ success: true, activeRole }, {
          headers: {
            'Set-Cookie': createActiveRoleCookieHeader(activeRole),
          },
        })
      },
    },
  },
})
