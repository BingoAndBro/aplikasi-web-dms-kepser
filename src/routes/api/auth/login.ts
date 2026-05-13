import { createFileRoute } from '@tanstack/react-router'
import { loginSchema } from '#/lib/schemas/auth'
import { loginWithLocalCredentials } from '#/lib/auth/local-auth-service'
import {
  appendSetCookieHeaders,
  createActiveRoleCookieHeader,
  createSessionCookieHeader,
} from '#/lib/auth/session-cookies'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
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

        const loginResult = await loginWithLocalCredentials({
          email,
          password,
          userAgent: request.headers.get('user-agent'),
          ipAddress: getRequestIpAddress(request),
        })

        if (!loginResult.ok) {
          return Response.json({
            error: loginResult.error,
            ...(loginResult.code ? { code: loginResult.code } : {}),
          }, { status: loginResult.status })
        }

        const headers = appendSetCookieHeaders(new Headers(), [
          createSessionCookieHeader(
            request,
            loginResult.rawToken,
            loginResult.sessionMaxAgeSeconds,
          ),
          createActiveRoleCookieHeader(loginResult.activeRole),
        ])

        return Response.json({
          user: loginResult.user,
          roles: loginResult.roles,
          activeRole: loginResult.activeRole,
        }, {
          headers,
        })
      },
    },
  },
})

function getRequestIpAddress(request: Request): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null
  }

  return request.headers.get('x-real-ip')
}
