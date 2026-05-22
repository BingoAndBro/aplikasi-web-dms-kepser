import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { revokeSessionByTokenHash } from '#/lib/auth/session-repository'
import { hashSessionToken } from '#/lib/auth/session-token'
import { SESSION_COOKIE_NAME } from '#/lib/auth/session-constants'
import {
  appendSetCookieHeaders,
  clearActiveRoleCookieHeader,
  clearSessionCookieHeader,
  getCookieValue,
} from '#/lib/auth/session-cookies'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const cookieHeader = request.headers.get('cookie')
        const rawToken = getCookieValue(cookieHeader, SESSION_COOKIE_NAME)

        if (rawToken) {
          try {
            await revokeSessionByTokenHash(hashSessionToken(rawToken))
          } catch {
            // Logout remains idempotent for malformed or already-revoked sessions.
          }
        }

        const headers = appendSetCookieHeaders(new Headers(), [
          clearSessionCookieHeader(request),
          clearActiveRoleCookieHeader(),
        ])

        return Response.json({ success: true }, {
          headers,
        })
      },
    },
  },
})
