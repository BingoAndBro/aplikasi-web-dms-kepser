import { createFileRoute } from '@tanstack/react-router'
import { toLocalAuthUser } from '#/lib/auth/local-auth-service'
import {
  resolveActiveRole,
  validateAssignedRoles,
} from '#/lib/auth/role-resolution'
import { SESSION_COOKIE_NAME } from '#/lib/auth/session-constants'
import {
  findSessionByTokenHash,
  type SessionWithUserAndRoles,
} from '#/lib/auth/session-repository'
import { hashSessionToken } from '#/lib/auth/session-token'
import {
  getActiveRoleCookieValue,
  getCookieValue,
} from '#/lib/auth/session-cookies'

export const Route = createFileRoute('/api/auth/session')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const cookieHeader = request.headers.get('cookie')
        const rawToken = getCookieValue(cookieHeader, SESSION_COOKIE_NAME)

        if (!rawToken) {
          return Response.json({
            session: null,
            roles: [],
            activeRole: null,
          })
        }

        let currentSession: SessionWithUserAndRoles | null
        try {
          currentSession = await findSessionByTokenHash(hashSessionToken(rawToken))
        } catch {
          currentSession = null
        }

        if (!currentSession) {
          return Response.json({
            session: null,
            roles: [],
            activeRole: null,
          })
        }

        const roleValidation = validateAssignedRoles(currentSession.roles)
        if (!roleValidation.ok) {
          return Response.json({
            session: null,
            roles: [],
            activeRole: null,
          })
        }

        const activeRole = resolveActiveRole(
          currentSession.roles,
          getActiveRoleCookieValue(cookieHeader),
        )

        return Response.json({
          session: {
            userId: currentSession.user.id,
            username: currentSession.user.username,
            displayName: toLocalAuthUser(currentSession.user).displayName,
          },
          roles: currentSession.roles,
          activeRole,
        })
      },
    },
  },
})
