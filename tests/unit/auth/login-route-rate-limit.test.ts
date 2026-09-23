import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROLES } from '#/lib/constants/roles'
import { resetLoginRateLimitForTests } from '#/lib/auth/login-rate-limit'

const mocks = vi.hoisted(() => ({
  loginWithLocalCredentials: vi.fn(),
}))

vi.mock('#/lib/auth/local-auth-service', () => ({
  loginWithLocalCredentials: mocks.loginWithLocalCredentials,
}))

import { Route } from '#/routes/api/auth/login'

type LoginHandler = (args: { request: Request }) => Promise<Response>

const loginHandler = (Route as unknown as {
  options: { server: { handlers: { POST: LoginHandler } } }
}).options.server.handlers.POST

describe('/api/auth/login rate-limit behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetLoginRateLimitForTests()
    mocks.loginWithLocalCredentials.mockResolvedValue(successfulLogin())
  })

  it('preserves successful login response and compatibility cookies', async () => {
    const response = await loginHandler({
      request: loginRequest({
        identifier: 'Budi.Santoso',
        password: 'correct-password',
      }),
    })
    const body = await response.json()
    const setCookie = response.headers.getSetCookie?.() ?? []

    expect(response.status).toBe(200)
    expect(body).toEqual({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        username: 'budi.santoso',
        displayName: 'Test User',
      },
      roles: [ROLES.PEGAWAI],
      activeRole: ROLES.PEGAWAI,
    })
    expect(setCookie.some((cookie) => cookie.includes('dms_session='))).toBe(true)
    expect(setCookie.some((cookie) => cookie.includes('HttpOnly'))).toBe(true)
    expect(setCookie.some((cookie) => cookie.includes('dms_active_role=PEGAWAI'))).toBe(true)
    expect(mocks.loginWithLocalCredentials).toHaveBeenCalledWith(expect.objectContaining({
      identifier: 'Budi.Santoso',
      password: 'correct-password',
      ipAddress: '192.0.2.10',
    }))
  })

  it('rejects cross-origin login POST before credential verification', async () => {
    const response = await loginHandler({
      request: loginRequest({
        origin: 'https://evil.example',
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.loginWithLocalCredentials).not.toHaveBeenCalled()
  })

  it('keeps invalid user and wrong password responses generic and equivalent', async () => {
    mocks.loginWithLocalCredentials.mockResolvedValueOnce(invalidCredentials())
    const wrongPassword = await loginHandler({
      request: loginRequest({
        identifier: 'budi.santoso',
        password: 'wrong-password',
      }),
    })

    mocks.loginWithLocalCredentials.mockResolvedValueOnce(invalidCredentials())
    const missingUser = await loginHandler({
      request: loginRequest({
        identifier: 'missing.user',
        password: 'wrong-password',
      }),
    })

    expect(wrongPassword.status).toBe(401)
    expect(missingUser.status).toBe(401)
    expect(await wrongPassword.json()).toEqual({
      error: 'Username/NIP atau password salah',
      code: 'invalid_credentials',
    })
    expect(await missingUser.json()).toEqual({
      error: 'Username/NIP atau password salah',
      code: 'invalid_credentials',
    })
  })

  it('increments failed login attempts and returns 429 after repeated failures', async () => {
    mocks.loginWithLocalCredentials.mockResolvedValue(invalidCredentials())

    for (let i = 0; i < 4; i += 1) {
      const response = await loginHandler({
        request: loginRequest(),
      })

      expect(response.status).toBe(401)
    }

    const limited = await loginHandler({
      request: loginRequest(),
    })
    const body = await limited.json()

    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('900')
    expect(body).toEqual({
      error: 'Terlalu banyak percobaan login. Coba lagi nanti.',
      code: 'login_rate_limited',
    })
  })

  it('blocks correct credentials while the key is rate-limited', async () => {
    mocks.loginWithLocalCredentials.mockResolvedValue(invalidCredentials())

    for (let i = 0; i < 5; i += 1) {
      await loginHandler({ request: loginRequest() })
    }

    mocks.loginWithLocalCredentials.mockResolvedValue(successfulLogin())
    const beforeCallCount = mocks.loginWithLocalCredentials.mock.calls.length
    const response = await loginHandler({
      request: loginRequest({ password: 'correct-password' }),
    })

    expect(response.status).toBe(429)
    expect(mocks.loginWithLocalCredentials).toHaveBeenCalledTimes(beforeCallCount)
  })

  it('clears failed attempts after a successful login before the threshold', async () => {
    mocks.loginWithLocalCredentials.mockResolvedValueOnce(invalidCredentials())
    await loginHandler({ request: loginRequest() })

    mocks.loginWithLocalCredentials.mockResolvedValueOnce(successfulLogin())
    const success = await loginHandler({
      request: loginRequest({ password: 'correct-password' }),
    })
    expect(success.status).toBe(200)

    mocks.loginWithLocalCredentials.mockResolvedValue(invalidCredentials())
    for (let i = 0; i < 4; i += 1) {
      const response = await loginHandler({ request: loginRequest() })
      expect(response.status).toBe(401)
    }
  })
})

function loginRequest(input: Partial<{ identifier: string, password: string, origin: string }> = {}): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: input.origin ?? 'http://localhost',
      'x-forwarded-for': '192.0.2.10',
    },
    body: JSON.stringify({
      identifier: input.identifier ?? 'budi.santoso',
      password: input.password ?? 'wrong-password',
    }),
  })
}

function successfulLogin() {
  return {
    ok: true,
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'budi.santoso',
      displayName: 'Test User',
    },
    roles: [ROLES.PEGAWAI],
    activeRole: ROLES.PEGAWAI,
    rawToken: 'opaque-token',
    sessionMaxAgeSeconds: 28_800,
  }
}

function invalidCredentials() {
  return {
    ok: false,
    status: 401,
    error: 'Username/NIP atau password salah',
    code: 'invalid_credentials',
  }
}
