import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  createLoginRateLimitKey,
  recordFailedLoginAttempt,
} from '#/lib/auth/login-rate-limit'
import { loginSchema } from '#/lib/schemas/auth'
import { loginWithLocalCredentials } from '#/lib/auth/local-auth-service'
import {
  appendSetCookieHeaders,
  createActiveRoleCookieHeader,
  createSessionCookieHeader,
} from '#/lib/auth/session-cookies'

const GENERIC_CREDENTIAL_ERROR = 'Email atau password salah'
const INVALID_CREDENTIALS_CODE = 'invalid_credentials'

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
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
        const ipAddress = getRequestIpAddress(request)
        const rateLimitKey = createLoginRateLimitKey({
          identifier: email,
          ipAddress,
        })
        const rateLimit = checkLoginRateLimit(rateLimitKey)

        if (!rateLimit.allowed) {
          return rateLimitedResponse(rateLimit.retryAfterSeconds)
        }

        const loginResult = await loginWithLocalCredentials({
          email,
          password,
          userAgent: request.headers.get('user-agent'),
          ipAddress,
        })

        if (!loginResult.ok) {
          const failedAttempt = recordFailedLoginAttempt(rateLimitKey)
          if (!failedAttempt.allowed) {
            return rateLimitedResponse(failedAttempt.retryAfterSeconds)
          }

          return Response.json({
            error: GENERIC_CREDENTIAL_ERROR,
            code: loginResult.code ?? INVALID_CREDENTIALS_CODE,
          }, { status: 401 })
        }

        clearLoginRateLimit(rateLimitKey)

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

function rateLimitedResponse(retryAfterSeconds: number): Response {
  return Response.json({
    error: 'Terlalu banyak percobaan login. Coba lagi nanti.',
    code: 'login_rate_limited',
  }, {
    status: 429,
    headers: {
      'Retry-After': String(retryAfterSeconds),
    },
  })
}
